/**
 * pcrScheduler.ts
 *
 * Scheduled PCR scan logic for two daily runs:
 *  1. EOD OI Snapshot  — 4:30 PM ET (21:30 UTC) — captures end-of-day OI baseline
 *  2. Intraday Scan    — 11:30 AM ET (16:30 UTC) — computes live PCR + COI delta vs prior EOD
 *
 * PCR Strategy Logic:
 *  - PCR (Volume) = Total Put Volume / Total Call Volume  (live intraday signal)
 *  - PCR (OI)     = Total Put OI / Total Call OI          (structural positioning)
 *  - COI Delta    = Current OI - Prior EOD OI             (new hedging activity)
 *
 * Signal Classification:
 *  - EXTREME_FEAR  : PCR > 1.5  → contrarian bullish (excessive put buying)
 *  - FEAR          : PCR 1.2–1.5 → mild bullish lean
 *  - NEUTRAL       : PCR 0.8–1.2 → no directional edge
 *  - GREED         : PCR 0.5–0.8 → mild bearish lean
 *  - EXTREME_GREED : PCR < 0.5  → contrarian bearish (excessive call buying)
 */

import { callDataApi } from "./_core/dataApi";
import { fetchPCR } from "./pcrStrategy";
import { getDb } from "./db";
import { pcrOiSnapshots, pcrScheduledResults, pcrAlertSettings, trackedRecommendations } from "../drizzle/schema";
import { eq, sql, and, ne, lt, like } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { TICKER_UNIVERSE } from "../shared/tickerUniverse";

/**
 * Return today's date in US Eastern Time (ET) as YYYY-MM-DD.
 * This prevents UTC date collisions where a 4:30 PM ET EOD snapshot
 * (which is already the next UTC day after midnight) gets the same
 * date string as the following morning's 11:30 AM ET intraday scan.
 */
function getEasternDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // en-CA locale gives YYYY-MM-DD format natively
}

/**
 * Return yesterday's date in US Eastern Time as YYYY-MM-DD.
 */
function getYesterdayEasternDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PCRSignal = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

interface OptionsChainSummary {
  ticker: string;
  totalPutVolume: number;
  totalCallVolume: number;
  totalPutOI: number;
  totalCallOI: number;
  pcrVolume: number;
  pcrOI: number;
  closingPrice: number;
  ivSkew: number; // ATM put IV - ATM call IV (positive = put skew = bearish hedging)
}

interface PriorSnapshot {
  totalPutOI: number;
  totalCallOI: number;
  pcrOI: number;
}

// ─── Signal classification ────────────────────────────────────────────────────

function classifyPCR(pcr: number): { signal: PCRSignal; strength: number; strategyHint: string; recommendation: string } {
  if (pcr > 1.5) return {
    signal: "EXTREME_FEAR",
    strength: 5,
    strategyHint: "Bull Call Spread / Cash-Secured Put",
    recommendation: `PCR of ${pcr.toFixed(2)} signals extreme put-buying. Market is over-hedged. Contrarian play: sell put spreads or buy call debit spreads on the next bounce. Look for reversal candles on the daily chart.`,
  };
  if (pcr > 1.2) return {
    signal: "FEAR",
    strength: 4,
    strategyHint: "Bull Put Spread",
    recommendation: `PCR of ${pcr.toFixed(2)} shows elevated put demand. Mild contrarian bullish signal. Consider bull put spreads below key support. Avoid naked short puts.`,
  };
  if (pcr > 0.8) return {
    signal: "NEUTRAL",
    strength: 2,
    strategyHint: "Iron Condor / Strangle",
    recommendation: `PCR of ${pcr.toFixed(2)} is balanced. No strong directional edge. Theta strategies (iron condors, short strangles) work best in this environment.`,
  };
  if (pcr > 0.5) return {
    signal: "GREED",
    strength: 3,
    strategyHint: "Bear Call Spread",
    recommendation: `PCR of ${pcr.toFixed(2)} shows call-heavy positioning. Mild bearish lean. Consider bear call spreads above resistance or protective puts on longs.`,
  };
  return {
    signal: "EXTREME_GREED",
    strength: 5,
    strategyHint: "Bear Call Spread / Protective Put",
    recommendation: `PCR of ${pcr.toFixed(2)} signals extreme call-buying (euphoria). Contrarian bearish play: sell call spreads above resistance. High risk of sharp pullback.`,
  };
}

// ─── Fetch options chain — delegates to the technical-signal PCR engine ────────

async function fetchOptionsChain(ticker: string): Promise<OptionsChainSummary | null> {
  try {
    // Use the shared pcrStrategy engine which derives PCR from:
    // RSI-14, 5d/20d price momentum, realized volatility, volume trend, ATR, analyst rating
    const pcrData = await fetchPCR(ticker);

    // Also fetch current price for the snapshot record
    const chartResp = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        region: "US",
        interval: "1d",
        range: "1d",
      },
    });
    const meta = (chartResp as any)?.chart?.result?.[0]?.meta;
    const closingPrice: number = meta?.regularMarketPrice ?? 0;

    return {
      ticker,
      totalPutVolume: pcrData.totalPutVolume,
      totalCallVolume: pcrData.totalCallVolume,
      totalPutOI: pcrData.totalPutOI,
      totalCallOI: pcrData.totalCallOI,
      pcrVolume: pcrData.pcr,
      pcrOI: pcrData.pcrOI,
      closingPrice,
      ivSkew: pcrData.ivSkew,
    };
  } catch (err) {
    console.error(`[PCR Scheduler] Error fetching ${ticker}:`, err);
    return null;
  }
}

// ─── Get prior EOD snapshot ───────────────────────────────────────────────────

async function getPriorSnapshot(ticker: string): Promise<PriorSnapshot | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    // Use ET yesterday as the cutoff so we always find last night's 4:30 PM ET snapshot
    // regardless of whether the server clock is UTC-ahead of ET.
    const yesterday = getYesterdayEasternDate();
    const rows = await db
      .select()
      .from(pcrOiSnapshots)
      .where(and(
        eq(pcrOiSnapshots.ticker, ticker),
        lt(pcrOiSnapshots.snapshotDate, getEasternDate()) // strictly before today ET
      ))
      .orderBy(pcrOiSnapshots.snapshotDate)
      .limit(10);

    // Most recent snapshot before today
    const prior = rows
      .sort((a: typeof rows[0], b: typeof rows[0]) => b.snapshotDate.localeCompare(a.snapshotDate))[0];

    if (!prior) return null;
    return {
      totalPutOI: prior.totalPutOI,
      totalCallOI: prior.totalCallOI,
      pcrOI: parseFloat(prior.pcrOI),
    };
  } catch {
    return null;
  }
}

// ─── EOD Snapshot Run (4:30 PM ET) ───────────────────────────────────────────

export async function runEodSnapshot(): Promise<{ saved: number; errors: number }> {
  const today = getEasternDate(); // Use ET date to avoid UTC midnight rollover issues
  const tickers = TICKER_UNIVERSE.map(t => t.symbol);

  let saved = 0;
  let errors = 0;

  const db = await getDb();
  if (!db) {
    console.error("[PCR EOD Snapshot] No database connection");
    return { saved: 0, errors: tickers.length };
  }

  console.log(`[PCR EOD Snapshot] Starting for ${tickers.length} tickers on ${today}`);

  // Process in batches of 5 with exponential backoff on rate-limit errors
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);

    // Retry up to 3 times with backoff if the whole batch fails (rate limit)
    let results: PromiseSettledResult<OptionsChainSummary | null>[] = [];
    let attempt = 0;
    while (attempt < 3) {
      results = await Promise.allSettled(batch.map(t => fetchOptionsChain(t)));
      const allFailed = results.every(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value));
      if (!allFailed) break;
      attempt++;
      if (attempt < 3) {
        const delay = 60_000 * attempt; // 60s, then 120s
        console.warn(`[PCR EOD] Batch ${i / 5 + 1} all failed (rate limit?), waiting ${delay / 1000}s before retry ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j];
      const result = results[j];

      if (result.status === "rejected" || !result.value) {
        errors++;
        if (result.status === "rejected") {
          console.error(`[PCR Scheduler] Error fetching ${ticker}:`, (result as PromiseRejectedResult).reason?.message ?? (result as PromiseRejectedResult).reason);
        } else {
          console.warn(`[PCR Scheduler] No data for ${ticker} (null result)`);
        }
        continue;
      }

      const chain = result.value;

      try {
        await db
          .insert(pcrOiSnapshots)
          .values({
            ticker,
            snapshotDate: today,
            totalPutOI: chain.totalPutOI,
            totalCallOI: chain.totalCallOI,
            totalPutVolume: chain.totalPutVolume,
            totalCallVolume: chain.totalCallVolume,
            pcrVolume: chain.pcrVolume.toFixed(4),
            pcrOI: chain.pcrOI.toFixed(4),
            closingPrice: chain.closingPrice.toFixed(4),
          })
          .onDuplicateKeyUpdate({
            set: {
              totalPutOI: chain.totalPutOI,
              totalCallOI: chain.totalCallOI,
              totalPutVolume: chain.totalPutVolume,
              totalCallVolume: chain.totalCallVolume,
              pcrVolume: chain.pcrVolume.toFixed(4),
              pcrOI: chain.pcrOI.toFixed(4),
              closingPrice: chain.closingPrice.toFixed(4),
            },
          });
        saved++;
      } catch (err) {
        console.error(`[PCR EOD] DB error for ${ticker}:`, err);
        errors++;
      }
    }

    // Small delay between batches
    if (i + 5 < tickers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`[PCR EOD Snapshot] Done: ${saved} saved, ${errors} errors`);

  // Notify owner of completion
  await notifyOwner({
    title: `PCR EOD Snapshot Complete — ${today}`,
    content: `Captured OI baseline for ${saved}/${tickers.length} tickers. ${errors} errors. This data will be used for tomorrow's 11:30 AM COI analysis.`,
  }).catch(() => {});

  return { saved, errors };
}

// ─── Intraday Scan Run (11:30 AM ET) ─────────────────────────────────────────

export async function runIntradayScan(): Promise<{ processed: number; actionable: number; errors: number }> {
  const today = getEasternDate(); // Use ET date to match EOD snapshot date
  const tickers = TICKER_UNIVERSE.map(t => t.symbol);

  let processed = 0;
  let actionable = 0;
  let errors = 0;

  const db = await getDb();
  if (!db) {
    console.error("[PCR Intraday Scan] No database connection");
    return { processed: 0, actionable: 0, errors: tickers.length };
  }

  console.log(`[PCR Intraday Scan] Starting for ${tickers.length} tickers on ${today}`);

  const extremeSignals: Array<{ ticker: string; signal: PCRSignal; pcr: number; coiDelta: number }> = [];
  const allResults: Array<{ ticker: string; signal: PCRSignal; pcr: number; pcrDeltaVsPrior: number | null; priorSignal: string | null; strategyHint: string; signalChanged: boolean }> = [];

  // Process in batches of 5
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(t => fetchOptionsChain(t)));

    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j];
      const result = results[j];

      if (result.status === "rejected" || !result.value) {
        errors++;
        if (result.status === "rejected") {
          console.error(`[PCR Intraday] Error fetching ${ticker}:`, result.reason?.message ?? result.reason);
        } else {
          console.warn(`[PCR Intraday] No data for ${ticker} (null result)`);
        }
        continue;
      }

      const chain = result.value;
      const { signal, strength, strategyHint, recommendation } = classifyPCR(chain.pcrVolume);

      // Get prior EOD snapshot for COI delta and PCR delta
      const prior = await getPriorSnapshot(ticker);
      const coiDelta = prior ? chain.totalPutOI - prior.totalPutOI : 0;
      const coiPctChange = prior && prior.totalPutOI > 0
        ? ((chain.totalPutOI - prior.totalPutOI) / prior.totalPutOI) * 100
        : 0;

      // Compute PCR delta vs prior day EOD
      const priorPcr = prior?.pcrOI ?? null;
      const pcrDeltaVsPrior = priorPcr !== null ? chain.pcrVolume - priorPcr : null;

      // Get prior signal for regime-change detection (from yesterday's intraday scan)
      const priorSignalRow = await db
        .select({ signal: pcrScheduledResults.signal })
        .from(pcrScheduledResults)
        .where(and(
          eq(pcrScheduledResults.ticker, ticker),
          ne(pcrScheduledResults.runDate, today),
          eq(pcrScheduledResults.runType, "intraday_scan")
        ))
        .orderBy(pcrScheduledResults.runDate)
        .limit(1)
        .then(rows => rows[0]?.signal ?? null);

      const priorSignal = priorSignalRow;

      try {
        await db
          .insert(pcrScheduledResults)
          .values({
            runDate: today,
            runType: "intraday_scan",
            ticker,
            pcr: chain.pcrVolume.toFixed(4),
            pcrOI: chain.pcrOI.toFixed(4),
            coiDelta: coiDelta.toFixed(4),
            coiPctChange: coiPctChange.toFixed(4),
            signal,
            signalStrength: strength,
            recommendation,
            strategyHint,
            totalPutVolume: chain.totalPutVolume,
            totalCallVolume: chain.totalCallVolume,
            ivSkew: chain.ivSkew.toFixed(2),
            pcrDeltaVsPrior: pcrDeltaVsPrior !== null ? pcrDeltaVsPrior.toFixed(4) : null,
            priorSignal: priorSignal ?? null,
          })
          .onDuplicateKeyUpdate({
            set: {
              pcr: chain.pcrVolume.toFixed(4),
              pcrOI: chain.pcrOI.toFixed(4),
              coiDelta: coiDelta.toFixed(4),
              coiPctChange: coiPctChange.toFixed(4),
              signal,
              signalStrength: strength,
              recommendation,
              strategyHint,
              totalPutVolume: chain.totalPutVolume,
              totalCallVolume: chain.totalCallVolume,
              ivSkew: chain.ivSkew.toFixed(2),
              pcrDeltaVsPrior: pcrDeltaVsPrior !== null ? pcrDeltaVsPrior.toFixed(4) : null,
              priorSignal: priorSignal ?? null,
            },
          });

        processed++;
        // Accumulate all results for digest email
        allResults.push({
          ticker,
          signal,
          pcr: chain.pcrVolume,
          pcrDeltaVsPrior: pcrDeltaVsPrior,
          priorSignal,
          strategyHint,
          signalChanged: !!(priorSignal && priorSignal !== signal),
        });
        if (signal === "EXTREME_FEAR" || signal === "EXTREME_GREED") {
          actionable++;
          extremeSignals.push({ ticker, signal, pcr: chain.pcrVolume, coiDelta });
        }

        // Regime-change detection: notify users who have alerts for this ticker
        if (
          priorSignal &&
          priorSignal !== signal &&
          (priorSignal === "NEUTRAL" || signal === "NEUTRAL" ||
           (priorSignal !== signal && (
             (signal === "FEAR" || signal === "EXTREME_FEAR" || signal === "GREED" || signal === "EXTREME_GREED")
           )))
        ) {
          try {
            // Find all users with alerts enabled for this ticker
            const alertRows = await db
              .select()
              .from(pcrAlertSettings)
              .where(and(
                eq(pcrAlertSettings.ticker, ticker),
                eq(pcrAlertSettings.enabled, true)
              ));

            for (const alertRow of alertRows) {
              const shouldAlert =
                (signal === "FEAR" && alertRow.alertOnFear) ||
                (signal === "GREED" && alertRow.alertOnGreed) ||
                (signal === "EXTREME_FEAR" && alertRow.alertOnExtremeFear) ||
                (signal === "EXTREME_GREED" && alertRow.alertOnExtremeGreed);

              if (shouldAlert) {
                const emoji = signal.includes("FEAR") ? "🟢" : "🔴";
                const delta = pcrDeltaVsPrior !== null ? ` (PCR Δ ${pcrDeltaVsPrior > 0 ? "+" : ""}${pcrDeltaVsPrior.toFixed(2)})` : "";
                await notifyOwner({
                  title: `PCR Regime Change: ${ticker} → ${signal}`,
                  content: `${emoji} ${ticker} shifted from ${priorSignal} to ${signal} in the 11:30 AM scan.\nNew PCR: ${chain.pcrVolume.toFixed(2)}${delta}\n\nStrategy hint: ${strategyHint}\n${recommendation}`,
                }).catch(() => {});
              }
            }
          } catch (alertErr) {
            console.error(`[PCR Intraday] Alert check error for ${ticker}:`, alertErr);
          }
        }
      } catch (err) {
        console.error(`[PCR Intraday] DB error for ${ticker}:`, err);
        errors++;
      }
    }

    if (i + 5 < tickers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`[PCR Intraday Scan] Done: ${processed} processed, ${actionable} actionable, ${errors} errors`);

  // ── Rich digest email: top 10 movers by |pcrDeltaVsPrior| ──────────────────
  const top10Movers = allResults
    .filter(r => r.pcrDeltaVsPrior !== null)
    .sort((a, b) => Math.abs(b.pcrDeltaVsPrior!) - Math.abs(a.pcrDeltaVsPrior!))
    .slice(0, 10);

  // Signal distribution
  const signalCounts = allResults.reduce((acc, r) => {
    acc[r.signal] = (acc[r.signal] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const regimeChanges = allResults.filter(r => r.signalChanged).length;

  // Build digest lines
  const moverLines = top10Movers.map((r, i) => {
    const delta = r.pcrDeltaVsPrior!;
    const arrow = delta > 0 ? "▲" : "▼";
    const signalEmoji = r.signal === "EXTREME_FEAR" ? "🟢" : r.signal === "EXTREME_GREED" ? "🔴" : r.signal === "FEAR" ? "🟡" : r.signal === "GREED" ? "🟠" : "⚪";
    const changeNote = r.signalChanged ? ` [${r.priorSignal} → ${r.signal}]` : "";
    return `${i + 1}. ${signalEmoji} ${r.ticker.padEnd(6)} PCR ${r.pcr.toFixed(2)} ${arrow}${Math.abs(delta).toFixed(2)}${changeNote} — ${r.strategyHint}`;
  }).join("\n");

  const fearCount = (signalCounts["EXTREME_FEAR"] ?? 0) + (signalCounts["FEAR"] ?? 0);
  const greedCount = (signalCounts["EXTREME_GREED"] ?? 0) + (signalCounts["GREED"] ?? 0);
  const neutralCount = signalCounts["NEUTRAL"] ?? 0;

  const digestTitle = today === new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    ? `PCR Daily Digest — ${today}`
    : `PCR Scan Digest — ${today}`;

  await notifyOwner({
    title: digestTitle,
    content: [
      `📊 11:30 AM ET Scan Complete — ${processed} tickers scanned`,
      ``,
      `Market Sentiment: 🟢 Fear: ${fearCount} | ⚪ Neutral: ${neutralCount} | 🔴 Greed: ${greedCount}`,
      `Regime Changes: ${regimeChanges} tickers shifted signals`,
      `Extreme Signals: ${actionable} (${extremeSignals.map(s => s.ticker).join(", ") || "none"})`,
      ``,
      `── Top 10 Movers by PCR Shift ──`,
      moverLines || "No delta data (first scan of the day — run EOD snapshot first)",
      ``,
      `View full Scan Detail on the PCR Strategy page → Scan Detail tab.`,
    ].join("\n"),
  }).catch(() => {});

  return { processed, actionable, errors };
}

// ─── DB helpers for reading scheduled results ─────────────────────────────────

export async function getLatestScheduledResults(runType: "eod_snapshot" | "intraday_scan", runDate?: string) {
  const date = runDate ?? new Date().toISOString().slice(0, 10);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pcrScheduledResults)
    .where(eq(pcrScheduledResults.runDate, date))
    .orderBy(pcrScheduledResults.signalStrength);
}

export async function getLatestOiSnapshots(snapshotDate?: string) {
  const date = snapshotDate ?? new Date().toISOString().slice(0, 10);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pcrOiSnapshots)
    .where(eq(pcrOiSnapshots.snapshotDate, date));
}

// Returns tickers that are missing from today's EOD snapshot
export async function getMissingTickers(snapshotDate?: string): Promise<string[]> {
  const date = snapshotDate ?? new Date().toISOString().slice(0, 10);
  const db = await getDb();
  if (!db) return TICKER_UNIVERSE.map(t => t.symbol);
  const rows = await db
    .select({ ticker: pcrOiSnapshots.ticker })
    .from(pcrOiSnapshots)
    .where(eq(pcrOiSnapshots.snapshotDate, date));
  const saved = new Set(rows.map(r => r.ticker));
  return TICKER_UNIVERSE.map(t => t.symbol).filter(s => !saved.has(s));
}

// Retry EOD snapshot for a specific list of tickers (used for missing-ticker retry)
export async function runEodSnapshotForTickers(
  tickers: string[]
): Promise<{ saved: number; errors: number; stillMissing: string[] }> {
  const today = new Date().toISOString().slice(0, 10);
  let saved = 0;
  let errors = 0;
  const stillMissing: string[] = [];

  const db = await getDb();
  if (!db) return { saved: 0, errors: tickers.length, stillMissing: tickers };

  console.log(`[PCR Retry] Retrying ${tickers.length} missing tickers for ${today}`);

  // Process in batches of 3 with longer delays to avoid rate limiting
  for (let i = 0; i < tickers.length; i += 3) {
    const batch = tickers.slice(i, i + 3);

    // Exponential backoff retry per batch
    let attempt = 0;
    let batchResults: PromiseSettledResult<OptionsChainSummary | null>[] = [];
    while (attempt < 3) {
      batchResults = await Promise.allSettled(batch.map(t => fetchOptionsChain(t)));
      const allFailed = batchResults.every(
        r => r.status === "rejected" ||
          (r.status === "fulfilled" && !r.value)
      );
      if (!allFailed) break;
      attempt++;
      if (attempt < 3) {
        const delay = 60_000 * attempt; // 60s, 120s
        console.log(`[PCR Retry] Rate limit hit, waiting ${delay / 1000}s before retry ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j];
      const result = batchResults[j];

      if (result.status === "rejected" || !result.value) {
        errors++;
        stillMissing.push(ticker);
        console.warn(`[PCR Retry] Still failing for ${ticker} after retries`);
        continue;
      }

      const chain = result.value;
      try {
        await db
          .insert(pcrOiSnapshots)
          .values({
            ticker,
            snapshotDate: today,
            totalPutOI: chain.totalPutOI,
            totalCallOI: chain.totalCallOI,
            totalPutVolume: chain.totalPutVolume,
            totalCallVolume: chain.totalCallVolume,
            pcrVolume: chain.pcrVolume.toFixed(4),
            pcrOI: chain.pcrOI.toFixed(4),
            closingPrice: chain.closingPrice.toFixed(4),
          })
          .onDuplicateKeyUpdate({
            set: {
              totalPutOI: chain.totalPutOI,
              totalCallOI: chain.totalCallOI,
              totalPutVolume: chain.totalPutVolume,
              totalCallVolume: chain.totalCallVolume,
              pcrVolume: chain.pcrVolume.toFixed(4),
              pcrOI: chain.pcrOI.toFixed(4),
              closingPrice: chain.closingPrice.toFixed(4),
            },
          });
        saved++;
      } catch (err) {
        console.error(`[PCR Retry] DB error for ${ticker}:`, err);
        errors++;
        stillMissing.push(ticker);
      }
    }

    // Longer delay between batches for retry runs
    if (i + 3 < tickers.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`[PCR Retry] Done: ${saved} saved, ${errors} still failing`);
  return { saved, errors, stillMissing };
}

// Returns all scheduled results grouped by date (for Scan History tab)
export async function getHistoricalResults(
  days = 30
): Promise<Array<{ runDate: string; runType: string; ticker: string; signal: string; pcr: string; signalStrength: number }>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      runDate: pcrScheduledResults.runDate,
      runType: pcrScheduledResults.runType,
      ticker: pcrScheduledResults.ticker,
      signal: pcrScheduledResults.signal,
      pcr: pcrScheduledResults.pcr,
      signalStrength: pcrScheduledResults.signalStrength,
    })
    .from(pcrScheduledResults)
    .orderBy(sql`${pcrScheduledResults.runDate} DESC, ${pcrScheduledResults.signalStrength} DESC`)
    .limit(days * 66); // max 66 tickers per day
}

// Returns EOD price/PCR history for a single ticker (for sparkline)
export async function getEodHistory(
  ticker: string,
  days = 30
): Promise<Array<{ snapshotDate: string; closingPrice: string | null; pcrVolume: string; pcrOI: string }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      snapshotDate: pcrOiSnapshots.snapshotDate,
      closingPrice: pcrOiSnapshots.closingPrice,
      pcrVolume: pcrOiSnapshots.pcrVolume,
      pcrOI: pcrOiSnapshots.pcrOI,
    })
    .from(pcrOiSnapshots)
    .where(eq(pcrOiSnapshots.ticker, ticker))
    .orderBy(pcrOiSnapshots.snapshotDate)
    .limit(days);
  return rows;
}

// Returns 7-day PCR history for a single ticker (for sparkline on ticker card)
export async function getPCRHistoryForTicker(
  ticker: string,
  days = 7
): Promise<Array<{ runDate: string; pcr: string; signal: string }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      runDate: pcrScheduledResults.runDate,
      pcr: pcrScheduledResults.pcr,
      signal: pcrScheduledResults.signal,
    })
    .from(pcrScheduledResults)
    .where(and(
      eq(pcrScheduledResults.ticker, ticker.toUpperCase()),
      eq(pcrScheduledResults.runType, "intraday_scan")
    ))
    .orderBy(sql`${pcrScheduledResults.runDate} DESC`)
    .limit(days);
  // Return oldest-first for chart rendering
  return rows.reverse();
}

// Returns top 5 tickers by absolute pcrDeltaVsPrior from today's intraday scan
export async function getBiggestMovers(
  runDate?: string
): Promise<Array<{ ticker: string; pcr: string; signal: string; pcrDeltaVsPrior: string | null; priorSignal: string | null; strategyHint: string; recommendation: string }>> {
  const db = await getDb();
  if (!db) return [];
  const date = runDate ?? getEasternDate();
  const rows = await db
    .select({
      ticker: pcrScheduledResults.ticker,
      pcr: pcrScheduledResults.pcr,
      signal: pcrScheduledResults.signal,
      pcrDeltaVsPrior: pcrScheduledResults.pcrDeltaVsPrior,
      priorSignal: pcrScheduledResults.priorSignal,
      strategyHint: pcrScheduledResults.strategyHint,
      recommendation: pcrScheduledResults.recommendation,
    })
    .from(pcrScheduledResults)
    .where(and(
      eq(pcrScheduledResults.runDate, date),
      eq(pcrScheduledResults.runType, "intraday_scan")
    ))
    .orderBy(sql`ABS(${pcrScheduledResults.pcrDeltaVsPrior}) DESC`)
    .limit(5);
  return rows;
}

// Returns all distinct intraday scan run dates (newest first)
export async function getScanRunDates(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ runDate: pcrScheduledResults.runDate })
    .from(pcrScheduledResults)
    .where(eq(pcrScheduledResults.runType, "intraday_scan"))
    .orderBy(sql`${pcrScheduledResults.runDate} DESC`)
    .limit(60);
  return rows.map(r => r.runDate);
}

// Returns per-ticker OI comparison for a selected intraday scan run:
// joins pcr_scheduled_results (intraday) with pcr_oi_snapshots (prior EOD)
export async function getScanRunDetail(runDate: string): Promise<Array<{
  ticker: string;
  sector: string;
  // Intraday scan data
  currentPCR: string;
  currentPCROI: string;
  currentSignal: string;
  signalStrength: number;
  strategyHint: string;
  recommendation: string;
  pcrDeltaVsPrior: string | null;
  priorSignal: string | null;
  signalChanged: boolean;
  coiDelta: string | null;
  coiPctChange: string | null;
  ivSkew: string | null;
  // Prior EOD snapshot data
  priorPutOI: number | null;
  priorCallOI: number | null;
  priorPCROI: string | null;
  priorSnapshotDate: string | null;
  closingPrice: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Get all intraday scan results for this run date
  const intradayRows = await db
    .select()
    .from(pcrScheduledResults)
    .where(and(
      eq(pcrScheduledResults.runDate, runDate),
      eq(pcrScheduledResults.runType, "intraday_scan")
    ))
    .orderBy(sql`${pcrScheduledResults.signalStrength} DESC`);

  if (!intradayRows.length) return [];

  // Get the most recent EOD snapshot before this run date for each ticker
  // We fetch all EOD snapshots before runDate and pick the latest per ticker
  const eodRows = await db
    .select()
    .from(pcrOiSnapshots)
    .where(lt(pcrOiSnapshots.snapshotDate, runDate))
    .orderBy(sql`${pcrOiSnapshots.snapshotDate} DESC`);

  // Build a map: ticker → most recent prior EOD snapshot
  const eodMap = new Map<string, typeof eodRows[0]>();
  for (const row of eodRows) {
    if (!eodMap.has(row.ticker)) {
      eodMap.set(row.ticker, row);
    }
  }

  // Build ticker → sector map from TICKER_UNIVERSE
  const sectorMap = new Map<string, string>();
  for (const t of TICKER_UNIVERSE) {
    sectorMap.set(t.symbol, t.sector);
  }

  return intradayRows.map(row => {
    const eod = eodMap.get(row.ticker) ?? null;
    return {
      ticker: row.ticker,
      sector: sectorMap.get(row.ticker) ?? "Unknown",
      currentPCR: row.pcr,
      currentPCROI: row.pcrOI,
      currentSignal: row.signal,
      signalStrength: row.signalStrength,
      strategyHint: row.strategyHint,
      recommendation: row.recommendation,
      pcrDeltaVsPrior: row.pcrDeltaVsPrior ?? null,
      priorSignal: row.priorSignal ?? null,
      signalChanged: !!(row.priorSignal && row.priorSignal !== row.signal),
      coiDelta: row.coiDelta ?? null,
      coiPctChange: row.coiPctChange ?? null,
      ivSkew: row.ivSkew ?? null,
      priorPutOI: eod?.totalPutOI ?? null,
      priorCallOI: eod?.totalCallOI ?? null,
      priorPCROI: eod?.pcrOI ?? null,
      priorSnapshotDate: eod?.snapshotDate ?? null,
      closingPrice: eod?.closingPrice ?? null,
    };
  });
}

// Returns the number of distinct snapshot dates stored in the DB
export async function countSnapshotDays(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${pcrOiSnapshots.snapshotDate})` })
    .from(pcrOiSnapshots);
  return Number(result[0]?.count ?? 0);
}

// ─── Daily Landing Table ──────────────────────────────────────────────────────
// Returns a unified per-ticker row for the PCR landing page.
// Priority: if an intraday scan exists for today, use it; otherwise fall back to
// the most recent EOD snapshot so the table is always populated.
export async function getDailyLandingTable(runDate?: string): Promise<Array<{
  ticker: string;
  name: string;
  sector: string;
  // EOD baseline (prior day)
  priorPutOI: number | null;
  priorCallOI: number | null;
  priorPCROI: string | null;
  priorSnapshotDate: string | null;
  closingPrice: string | null;
  // Intraday scan (today, if available)
  hasIntradayScan: boolean;
  currentPCR: string | null;
  currentPCROI: string | null;
  currentSignal: string;
  signalStrength: number;
  strategyHint: string;
  recommendation: string;
  pcrDeltaVsPrior: string | null;
  priorSignal: string | null;
  signalChanged: boolean;
  coiDelta: string | null;
  coiPctChange: string | null;
  ivSkew: string | null;
  totalPutVolume: number;
  totalCallVolume: number;
  // 7-day PCR history for sparkline
  pcrHistory: Array<{ runDate: string; pcr: string; signal: string }>;
}>> {
  const db = await getDb();
  if (!db) return [];

  const today = runDate ?? getEasternDate();

  // Build ticker metadata map
  const tickerMap = new Map<string, { name: string; sector: string }>();
  for (const t of TICKER_UNIVERSE) {
    tickerMap.set(t.symbol, { name: t.name, sector: t.sector });
  }

  // Fetch today's intraday scan results
  const intradayRows = await db
    .select()
    .from(pcrScheduledResults)
    .where(and(
      eq(pcrScheduledResults.runDate, today),
      eq(pcrScheduledResults.runType, "intraday_scan")
    ));

  const intradayMap = new Map<string, typeof intradayRows[0]>();
  for (const row of intradayRows) {
    intradayMap.set(row.ticker, row);
  }

  // Fetch the most recent EOD snapshot: prefer prior-day, fall back to today
  // (on the first day of data there is no prior-day row, so we use today's snapshot)
  const eodRowsPrior = await db
    .select()
    .from(pcrOiSnapshots)
    .where(lt(pcrOiSnapshots.snapshotDate, today))
    .orderBy(sql`${pcrOiSnapshots.snapshotDate} DESC`);

  // If no prior-day rows exist, fall back to today's EOD snapshot
  const eodRows = eodRowsPrior.length > 0
    ? eodRowsPrior
    : await db
        .select()
        .from(pcrOiSnapshots)
        .where(eq(pcrOiSnapshots.snapshotDate, today))
        .orderBy(sql`${pcrOiSnapshots.snapshotDate} DESC`);

  const eodMap = new Map<string, typeof eodRows[0]>();
  for (const row of eodRows) {
    if (!eodMap.has(row.ticker)) {
      eodMap.set(row.ticker, row);
    }
  }

  // Fetch 7-day PCR history for all tickers in one query
  const historyRows = await db
    .select({
      ticker: pcrScheduledResults.ticker,
      runDate: pcrScheduledResults.runDate,
      pcr: pcrScheduledResults.pcr,
      signal: pcrScheduledResults.signal,
    })
    .from(pcrScheduledResults)
    .where(eq(pcrScheduledResults.runType, "intraday_scan"))
    .orderBy(sql`${pcrScheduledResults.runDate} DESC`)
    .limit(TICKER_UNIVERSE.length * 7);

  // Group history by ticker (oldest-first for chart rendering)
  const historyMap = new Map<string, Array<{ runDate: string; pcr: string; signal: string }>>();
  for (const row of historyRows) {
    if (!historyMap.has(row.ticker)) historyMap.set(row.ticker, []);
    const arr = historyMap.get(row.ticker)!;
    if (arr.length < 7) arr.push({ runDate: row.runDate, pcr: row.pcr, signal: row.signal });
  }
  // Reverse each ticker's history to oldest-first
  Array.from(historyMap.values()).forEach(arr => arr.reverse());

  // Build unified rows for every ticker in the universe
  return TICKER_UNIVERSE.map(tickerInfo => {
    const intraday = intradayMap.get(tickerInfo.symbol) ?? null;
    const eod = eodMap.get(tickerInfo.symbol) ?? null;
    const history = historyMap.get(tickerInfo.symbol) ?? [];

    // Determine signal: use intraday if available, else fall back to EOD-derived
    const hasIntradayScan = !!intraday;
    const currentSignal = intraday?.signal ?? "NEUTRAL";
    const signalStrength = intraday?.signalStrength ?? 0;

    return {
      ticker: tickerInfo.symbol,
      name: tickerInfo.name,
      sector: tickerInfo.sector,
      // EOD baseline
      priorPutOI: eod?.totalPutOI ?? null,
      priorCallOI: eod?.totalCallOI ?? null,
      priorPCROI: eod?.pcrOI ?? null,
      priorSnapshotDate: eod?.snapshotDate ?? null,
      closingPrice: eod?.closingPrice ?? null,
      // Intraday
      hasIntradayScan,
      currentPCR: intraday?.pcr ?? null,
      currentPCROI: intraday?.pcrOI ?? null,
      currentSignal,
      signalStrength,
      strategyHint: intraday?.strategyHint ?? "—",
      recommendation: intraday?.recommendation ?? "Run 11:30 AM scan to generate recommendation.",
      pcrDeltaVsPrior: intraday?.pcrDeltaVsPrior ?? null,
      priorSignal: intraday?.priorSignal ?? null,
      signalChanged: !!(intraday?.priorSignal && intraday.priorSignal !== intraday.signal),
      coiDelta: intraday?.coiDelta ?? null,
      coiPctChange: intraday?.coiPctChange ?? null,
      ivSkew: intraday?.ivSkew ?? null,
      totalPutVolume: intraday?.totalPutVolume ?? 0,
      totalCallVolume: intraday?.totalCallVolume ?? 0,
      pcrHistory: history,
    };
  });
}

// ─── PCR Recommendation Persistence ──────────────────────────────────────────
// Save a PCR-derived recommendation for backtesting / performance tracking.
export async function savePCRRecommendation(params: {
  userId: number;
  ticker: string;
  signal: string;
  strategyHint: string;
  recommendation: string;
  pcr: string;
  pcrDeltaVsPrior: string | null;
  priorSignal: string | null;
  runDate: string;
  closingPrice: string | null;
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("No database connection");

  // We reuse tracked_recommendations for PCR-sourced trades.
  // Strategy = strategyHint, targetDte = 30 (default), entryPrice = closingPrice.
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days out

  const [result] = await db
    .insert(trackedRecommendations)
    .values({
      userId: params.userId,
      ticker: params.ticker,
      strategy: params.strategyHint,
      targetDte: 30,
      expiryDate,
      entryPrice: params.closingPrice ?? "0",
      netCredit: "0", // PCR-sourced recs don't have a specific credit
      maxProfit: null,
      maxLoss: null,
      breakevens: "[]",
      legsJson: JSON.stringify([{ source: "pcr", signal: params.signal, pcr: params.pcr }]),
      compositeScore: String(params.pcrDeltaVsPrior ? Math.abs(parseFloat(params.pcrDeltaVsPrior)) * 10 : 5),
      pop: "0.5",
      bpRequired: "0",
      status: "open",
      notes: `PCR signal: ${params.signal} | PCR: ${params.pcr} | Delta vs prior: ${params.pcrDeltaVsPrior ?? "N/A"} | Prior signal: ${params.priorSignal ?? "N/A"} | Run date: ${params.runDate}`,
    })
    .$returningId();

  return { id: result.id };
}

// ─── Get PCR Saved Recommendations ───────────────────────────────────────────
export async function getPCRSavedRecommendations(userId: number, ticker?: string): Promise<Array<{
  id: number;
  ticker: string;
  strategy: string;
  entryDate: Date;
  expiryDate: Date;
  entryPrice: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  actualPnl: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    eq(trackedRecommendations.userId, userId),
    // PCR recs have legsJson starting with [{"source":"pcr"
    like(trackedRecommendations.legsJson, '%"source":"pcr"%'),
  ];
  if (ticker) {
    conditions.push(eq(trackedRecommendations.ticker, ticker.toUpperCase()));
  }

  return db
    .select({
      id: trackedRecommendations.id,
      ticker: trackedRecommendations.ticker,
      strategy: trackedRecommendations.strategy,
      entryDate: trackedRecommendations.entryDate,
      expiryDate: trackedRecommendations.expiryDate,
      entryPrice: trackedRecommendations.entryPrice,
      status: trackedRecommendations.status,
      outcome: trackedRecommendations.outcome,
      notes: trackedRecommendations.notes,
      actualPnl: trackedRecommendations.actualPnl,
    })
    .from(trackedRecommendations)
    .where(and(...conditions))
    .orderBy(sql`${trackedRecommendations.entryDate} DESC`)
    .limit(200);
}
