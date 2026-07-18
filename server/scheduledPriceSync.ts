/**
 * scheduledPriceSync.ts
 *
 * Daily OHLCV + IV sync job for PitDesk's top tickers.
 * Runs at 4:30 PM ET (21:30 UTC) weekdays via Heartbeat.
 *
 * What it does:
 *  1. Fetches last 10 days of OHLCV from Yahoo Finance for all tracked tickers
 *  2. Upserts into price_bars (deduplicates by ticker+date)
 *  3. Computes HV20/HV30 and IV rank from stored price history
 *  4. Upserts into iv_history table
 *  5. Updates ticker_data_coverage for the data health dashboard
 */
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { priceBars, ivHistory, tickerDataCoverage } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { callDataApi } from "./_core/dataApi";
import { PCR_TICKERS } from "../shared/tickers";

// ─── Ticker universe ──────────────────────────────────────────────────────────
const WATCHLIST_TICKERS = [
  "SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR",
  "META", "GOOGL", "NFLX", "AMZN", "SOFI", "INTC", "HOOD",
  "SOXL", "IONQ", "RGTI", "RKLB", "APP", "UNH", "BE", "FAS", "TEM",
  "ORCL", "SPY", "QQQ", "IWM", "GLD", "TLT",
];

function getAllSyncTickers(): string[] {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const t of [...WATCHLIST_TICKERS, ...PCR_TICKERS]) {
    const u = t.toUpperCase();
    if (!seen.has(u)) { seen.add(u); all.push(u); }
  }
  return all;
}

// ─── Yahoo Finance fetch ──────────────────────────────────────────────────────
interface OHLCVBar {
  date: string; open: number; high: number; low: number;
  close: number; volume: number; adjClose?: number;
}

async function fetchRecentBars(symbol: string, days = 10): Promise<OHLCVBar[]> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, region: "US", interval: "1d", range: `${days}d`, includeAdjustedClose: "true" },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return [];
    const { timestamp, indicators } = result;
    const quote = indicators?.quote?.[0] ?? {};
    const adjCloseArr = indicators?.adjclose?.[0]?.adjclose ?? [];
    const bars: OHLCVBar[] = [];
    for (let i = 0; i < (timestamp?.length ?? 0); i++) {
      if (!quote.close?.[i]) continue;
      bars.push({
        date: new Date(timestamp[i] * 1000).toISOString().split("T")[0],
        open: quote.open?.[i] ?? quote.close[i],
        high: quote.high?.[i] ?? quote.close[i],
        low: quote.low?.[i] ?? quote.close[i],
        close: quote.close[i],
        volume: quote.volume?.[i] ?? 0,
        adjClose: adjCloseArr[i] ?? undefined,
      });
    }
    return bars;
  } catch { return []; }
}

// ─── IV / HV computation ──────────────────────────────────────────────────────
function computeHV(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(closes.length - period - 1);
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0 && slice[i] > 0)
      logReturns.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (logReturns.length < Math.floor(period * 0.8)) return null;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance * 252);
}

function computeIVRank(current: number, history: number[]): number {
  if (history.length < 2) return 50;
  const min = Math.min(...history);
  const max = Math.max(...history);
  if (max === min) return 50;
  return Math.round(((current - min) / (max - min)) * 100);
}

function computeIVPercentile(current: number, history: number[]): number {
  if (history.length === 0) return 50;
  return Math.round((history.filter(v => v < current).length / history.length) * 100);
}

// ─── Coverage update ──────────────────────────────────────────────────────────
async function updateCoverage(db: any, ticker: string, status: "ok" | "error", errorMsg?: string) {
  const now = Date.now();
  try {
    const [ohlcvStats] = await db
      .select({ count: sql<number>`COUNT(*)`, oldest: sql<string>`MIN(date)`, newest: sql<string>`MAX(date)` })
      .from(priceBars).where(eq(priceBars.ticker, ticker));
    const [ivStats] = await db
      .select({ count: sql<number>`COUNT(*)`, oldest: sql<string>`MIN(date)`, newest: sql<string>`MAX(date)` })
      .from(ivHistory).where(eq(ivHistory.ticker, ticker));
    await db.insert(tickerDataCoverage).values({
      ticker,
      ohlcvBars: ohlcvStats?.count ?? 0,
      ohlcvOldest: ohlcvStats?.oldest ?? null,
      ohlcvNewest: ohlcvStats?.newest ?? null,
      ivBars: ivStats?.count ?? 0,
      ivOldest: ivStats?.oldest ?? null,
      ivNewest: ivStats?.newest ?? null,
      lastSyncAt: now,
      lastSyncStatus: status,
      lastSyncError: errorMsg ?? null,
      updatedAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        ohlcvBars: sql`VALUES(ohlcv_bars)`, ohlcvOldest: sql`VALUES(ohlcv_oldest)`,
        ohlcvNewest: sql`VALUES(ohlcv_newest)`, ivBars: sql`VALUES(iv_bars)`,
        ivOldest: sql`VALUES(iv_oldest)`, ivNewest: sql`VALUES(iv_newest)`,
        lastSyncAt: sql`VALUES(last_sync_at)`, lastSyncStatus: sql`VALUES(last_sync_status)`,
        lastSyncError: sql`VALUES(last_sync_error)`, updatedAt: sql`VALUES(updated_at)`,
      },
    });
  } catch (e) {
    console.warn(`[PriceSync] Coverage update failed for ${ticker}:`, e);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function priceSyncHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only endpoint" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "db unavailable" });

    const tickers = getAllSyncTickers();
    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();
    let synced = 0, ivComputed = 0, skipped = 0, errors = 0;
    const errorLog: string[] = [];

    for (const ticker of tickers) {
      try {
        // Step 1: Fetch recent OHLCV
        const bars = await fetchRecentBars(ticker, 10);
        if (bars.length === 0) {
          skipped++;
          await updateCoverage(db, ticker, "error", "No bars from Yahoo");
          continue;
        }

        // Step 2: Upsert OHLCV
        for (const bar of bars) {
          await db.insert(priceBars).values({
            ticker, date: bar.date,
            open: String(bar.open), high: String(bar.high),
            low: String(bar.low), close: String(bar.close),
            volume: bar.volume,
            adjClose: bar.adjClose != null ? String(bar.adjClose) : null,
            interval: "1d", source: "yahoo", fetchedAt: now,
          }).onDuplicateKeyUpdate({
            set: {
              open: sql`VALUES(open)`, high: sql`VALUES(high)`,
              low: sql`VALUES(low)`, close: sql`VALUES(close)`,
              volume: sql`VALUES(volume)`, adjClose: sql`VALUES(adj_close)`,
              fetchedAt: now,
            },
          }).catch(() => {});
        }
        if (bars.some(b => b.date === today)) synced++; else skipped++;

        // Step 3: Compute IV from full stored history (last 300 bars ≈ 14 months)
        const allBars = await db
          .select({ date: priceBars.date, close: priceBars.close })
          .from(priceBars)
          .where(eq(priceBars.ticker, ticker))
          .orderBy(priceBars.date)
          .limit(300);

        if (allBars.length >= 30) {
          const closes = allBars.map((b: any) => parseFloat(b.close));
          const dates = allBars.map((b: any) => b.date as string);
          const hv20 = computeHV(closes, 20);
          const hv30 = computeHV(closes, 30);

          if (hv30 !== null) {
            // Build rolling HV30 history for IV rank
            const hvHistory: number[] = [];
            for (let i = 31; i < closes.length; i++) {
              const h = computeHV(closes.slice(0, i + 1), 30);
              if (h !== null) hvHistory.push(h);
            }
            const ivRank = computeIVRank(hv30, hvHistory);
            const ivPct = computeIVPercentile(hv30, hvHistory);
            const latestDate = dates[dates.length - 1];

            await db.insert(ivHistory).values({
              ticker, date: latestDate,
              ivClose: String(hv30.toFixed(4)),
              ivHigh: hv20 !== null ? String(Math.max(hv20, hv30).toFixed(4)) : null,
              ivLow: hv20 !== null ? String(Math.min(hv20, hv30).toFixed(4)) : null,
              ivRank: String(ivRank),
              ivPercentile: String(ivPct),
              hv20: hv20 !== null ? String(hv20.toFixed(4)) : null,
              hv30: String(hv30.toFixed(4)),
              source: "computed", fetchedAt: now,
            }).onDuplicateKeyUpdate({
              set: {
                ivClose: sql`VALUES(iv_close)`, ivHigh: sql`VALUES(iv_high)`,
                ivLow: sql`VALUES(iv_low)`, ivRank: sql`VALUES(iv_rank)`,
                ivPercentile: sql`VALUES(iv_percentile)`,
                hv20: sql`VALUES(hv20)`, hv30: sql`VALUES(hv30)`,
                fetchedAt: sql`VALUES(fetched_at)`,
              },
            }).catch(() => {});
            ivComputed++;
          }
        }

        // Step 4: Update coverage
        await updateCoverage(db, ticker, "ok");
        await new Promise(r => setTimeout(r, 80)); // rate limit

      } catch (err: any) {
        errors++;
        const msg = err?.message ?? "unknown";
        errorLog.push(`${ticker}: ${msg}`);
        await updateCoverage(db, ticker, "error", msg).catch(() => {});
      }
    }

    const summary = { ok: true, date: today, synced, ivComputed, skipped, errors, total: tickers.length, errorLog: errorLog.slice(0, 10) };
    console.log(`[PriceSync] ${today}:`, summary);
    return res.json(summary);

  } catch (err: any) {
    console.error("[PriceSync] handler error:", err);
    return res.status(500).json({ error: err?.message ?? "unknown", timestamp: new Date().toISOString() });
  }
}
