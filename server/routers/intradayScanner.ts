/**
 * PitDesk Intraday Trend Scanner — tRPC Router
 *
 * Procedures:
 *   runScan(tickers?)   — score one or all tickers, persist results, send A-setup alerts
 *   getScanResult(id)   — get a single stored scan result with full criteria JSON
 *   getLatestScans()    — latest scan result per ticker (for the live grid)
 *   getHistory(ticker)  — scan history for a ticker (last 100 scans)
 *   getBacktestStats()  — win/loss stats per grade, per criterion
 *   recordOutcome()     — mark a scan result as win/loss/neutral
 *   getWeights()        — get current criteria weights
 *   updateWeights()     — manually update criteria weights
 *   getTickers()        — get ticker metadata list
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { scoreTicker, DEFAULT_WEIGHTS, type ScanSetup } from "../lib/intradayScorer";
import { SCANNER_TICKERS, TIER1_TICKERS, TIER2_TICKERS, ALL_TICKERS } from "../../shared/intradayTickers";
import { sendEmail } from "../email";
import { sql, desc, eq, and } from "drizzle-orm";
import { intradayScanResults, scanOutcomes, criteriaWeights } from "../../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function loadWeights(): Promise<Record<string, number>> {
  try {
    const db = await getDb();
    if (!db) return DEFAULT_WEIGHTS;
    const rows = await db.select().from(criteriaWeights);
    if (!rows || rows.length === 0) return DEFAULT_WEIGHTS;
    const weights: Record<string, number> = { ...DEFAULT_WEIGHTS };
    for (const row of rows) {
      weights[row.criterionName] = parseFloat(String(row.weight));
    }
    return weights;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

async function persistScanResult(setup: ScanSetup): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const criteriaJson = JSON.stringify(setup.criteria);
  const [result] = await db.insert(intradayScanResults).values({
    ticker: setup.ticker,
    scannedAt: setup.scannedAt,
    grade: setup.grade,
    direction: setup.direction,
    weightedScore: String(setup.weightedScore),
    maxScore: String(setup.maxScore),
    price: String(setup.price),
    vwap: String(setup.vwap),
    rvol: String(setup.rvol),
    rsi: String(setup.rsi),
    atr: String(setup.atr),
    entryLow: String(setup.entryLow),
    entryHigh: String(setup.entryHigh),
    stopLevel: String(setup.stopLevel),
    target1: String(setup.target1),
    target2: String(setup.target2),
    criteriaJson,
    trapDetected: setup.trap.detected,
    trapType: setup.trap.type ?? null,
    trapDetails: setup.trap.details ?? null,
    optionStrategy: setup.optionStrategy,
    optionStrike: String(setup.optionStrike),
    optionExpiry: setup.optionExpiry,
    optionDebit: String(setup.optionDebit),
    optionMaxProfit: String(setup.optionMaxProfit),
    optionMaxLoss: String(setup.optionMaxLoss),
    alertSent: false,
  });
  return (result as any)?.insertId ?? 0;
}

async function sendASetupAlert(setup: ScanSetup, scanId: number): Promise<void> {
  const dirEmoji = setup.direction === "bullish" ? "🟢" : setup.direction === "bearish" ? "🔴" : "⚪";
  const passedCriteria = Object.entries(setup.criteria)
    .filter(([, v]) => v.pass)
    .map(([k]) => k)
    .join(", ");

  const subject = `${dirEmoji} A Setup Alert: ${setup.ticker} ${setup.direction.toUpperCase()} — PitDesk Intraday Scanner`;
  const html = `
<h2>${dirEmoji} A Setup: ${setup.ticker} — ${setup.direction.toUpperCase()}</h2>
<table style="border-collapse:collapse;font-family:monospace;font-size:14px">
  <tr><td style="padding:4px 12px"><b>Score</b></td><td>${setup.weightedScore.toFixed(1)} / ${setup.maxScore.toFixed(1)}</td></tr>
  <tr><td style="padding:4px 12px"><b>Price</b></td><td>$${setup.price.toFixed(2)}</td></tr>
  <tr><td style="padding:4px 12px"><b>VWAP</b></td><td>$${setup.vwap.toFixed(2)}</td></tr>
  <tr><td style="padding:4px 12px"><b>RVOL</b></td><td>${setup.rvol.toFixed(2)}x</td></tr>
  <tr><td style="padding:4px 12px"><b>RSI</b></td><td>${setup.rsi.toFixed(1)}</td></tr>
  <tr><td style="padding:4px 12px"><b>Entry Zone</b></td><td>$${setup.entryLow.toFixed(2)} – $${setup.entryHigh.toFixed(2)}</td></tr>
  <tr><td style="padding:4px 12px"><b>Stop Level</b></td><td>$${setup.stopLevel.toFixed(2)}</td></tr>
  <tr><td style="padding:4px 12px"><b>Target 1</b></td><td>$${setup.target1.toFixed(2)} (1.5x risk)</td></tr>
  <tr><td style="padding:4px 12px"><b>Target 2</b></td><td>$${setup.target2.toFixed(2)} (2.5x risk)</td></tr>
</table>
<br/>
<h3>Stock Trade</h3>
<p>
  ${setup.direction === "bullish" ? "Buy" : "Sell short"} <b>${setup.ticker}</b> at $${((setup.entryLow + setup.entryHigh) / 2).toFixed(2)}<br/>
  Stop: $${setup.stopLevel.toFixed(2)} &nbsp;|&nbsp; Target 1: $${setup.target1.toFixed(2)} &nbsp;|&nbsp; Target 2: $${setup.target2.toFixed(2)}
</p>
<h3>Options Trade</h3>
<p>
  <b>${setup.optionStrategy}</b> — Strike $${setup.optionStrike} &nbsp;|&nbsp; Expiry ${setup.optionExpiry}<br/>
  Debit: $${Math.abs(setup.optionDebit).toFixed(2)} &nbsp;|&nbsp; Max Profit: $${setup.optionMaxProfit.toFixed(2)} &nbsp;|&nbsp; Max Loss: $${setup.optionMaxLoss.toFixed(2)}
</p>
<h3>Criteria Passed</h3>
<p>${passedCriteria}</p>
${setup.trap.detected ? `<p style="color:orange"><b>⚠️ Trap Warning:</b> ${setup.trap.details}</p>` : "<p style='color:green'>✅ No institutional trap patterns detected</p>"}
<br/>
<a href="https://trading.akulaz.ai/intraday-scanner/${setup.ticker}" style="background:#22c55e;color:white;padding:8px 16px;border-radius:4px;text-decoration:none">View on PitDesk →</a>
  `.trim();

  try {
    await sendEmail({ to: "akulasridhar@gmail.com", subject, html });
    const db = await getDb();
    if (db) {
      await db.update(intradayScanResults)
        .set({ alertSent: true })
        .where(eq(intradayScanResults.id, scanId));
    }
  } catch (err) {
    console.error("[intradayScanner] Failed to send A-setup alert:", err);
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const intradayScannerRouter = router({
  /** Run a full scan on specified tickers (or all if none given). Persists results. */
  runScan: publicProcedure
    .input(z.object({
      tickers: z.array(z.string()).optional(),
      tier: z.enum(["1", "2", "all"]).optional().default("all"),
    }))
    .mutation(async ({ input }) => {
      const weights = await loadWeights();
      const tickersToScan = input.tickers ??
        (input.tier === "1" ? TIER1_TICKERS :
         input.tier === "2" ? TIER2_TICKERS :
         ALL_TICKERS);

      const results: Array<{ ticker: string; grade: string; direction: string; score: number; id: number }> = [];

      // Process in batches of 5 to avoid API rate limits
      const BATCH_SIZE = 5;
      for (let i = 0; i < tickersToScan.length; i += BATCH_SIZE) {
        const batch = tickersToScan.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(ticker => scoreTicker(ticker, weights))
        );

        for (let j = 0; j < batchResults.length; j++) {
          const res = batchResults[j];
          const ticker = batch[j];
          if (res.status === "fulfilled" && res.value) {
            const setup = res.value;
            const scanId = await persistScanResult(setup);
            if (setup.grade === "A") {
              await sendASetupAlert(setup, scanId);
            }
            results.push({
              ticker,
              grade: setup.grade,
              direction: setup.direction,
              score: setup.weightedScore,
              id: scanId,
            });
          }
        }

        // Small delay between batches
        if (i + BATCH_SIZE < tickersToScan.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      return { scanned: results.length, results };
    }),

  /** Get the latest scan result for every ticker (for the live grid) */
  getLatestScans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // Get latest scan per ticker using a subquery
    const rows = await db.execute(sql`
      SELECT s.*
      FROM intraday_scan_results s
      INNER JOIN (
        SELECT ticker, MAX(scannedAt) AS maxAt
        FROM intraday_scan_results
        GROUP BY ticker
      ) latest ON s.ticker = latest.ticker AND s.scannedAt = latest.maxAt
      ORDER BY s.weightedScore DESC
    `);
    const arr = Array.isArray(rows) ? (rows as unknown as any[][])[0] ?? [] : [];
    return arr.map((r: any) => {
      // Parse criteria and normalize field names: server uses {pass, description} but frontend expects {passed, name}
      const rawCriteria: Record<string, any> = (() => {
        try { return JSON.parse(r.criteriaJson ?? "{}"); } catch { return {}; }
      })();
      const criteria = Object.entries(rawCriteria).map(([key, c]: [string, any]) => ({
        name: c.name ?? c.description ?? key,
        passed: c.passed ?? c.pass ?? false,
        weight: c.weight ?? 1,
        points: c.points ?? 0,
        value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? ''),
        description: c.description ?? '',
      }));
      // Return only the fields the UI needs — never spread the full DB row
      return {
        ticker: r.ticker,
        grade: r.grade,
        direction: r.direction,
        weightedScore: r.weightedScore,
        maxScore: r.maxScore,
        price: r.price,
        vwap: r.vwap,
        atr: r.atr,
        scannedAt: r.scannedAt,
        criteria,
      };
    });
  }),

  /** Get a single scan result with full detail + fresh live data */
  getScanResult: publicProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      // Always fetch fresh data for the detail view
      const weights = await loadWeights();
      const setup = await scoreTicker(input.ticker, weights);
      if (!setup) return null;
      return setup;
    }),

  /** Get scan history for a ticker (last 100 scans) */
  getHistory: publicProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: intradayScanResults.id,
          ticker: intradayScanResults.ticker,
          scannedAt: intradayScanResults.scannedAt,
          grade: intradayScanResults.grade,
          direction: intradayScanResults.direction,
          weightedScore: intradayScanResults.weightedScore,
          maxScore: intradayScanResults.maxScore,
          price: intradayScanResults.price,
          vwap: intradayScanResults.vwap,
          rvol: intradayScanResults.rvol,
          rsi: intradayScanResults.rsi,
          trapDetected: intradayScanResults.trapDetected,
          trapType: intradayScanResults.trapType,
          alertSent: intradayScanResults.alertSent,
        })
        .from(intradayScanResults)
        .where(eq(intradayScanResults.ticker, input.ticker))
        .orderBy(desc(intradayScanResults.scannedAt))
        .limit(100);
      return rows;
    }),

  /** Backtest stats: win/loss by grade, by direction */
  getBacktestStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { byGrade: [], byDirection: [] };

    const byGrade = await db.execute(sql`
      SELECT
        s.grade,
        COUNT(*) AS total,
        SUM(CASE WHEN o.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN o.outcome = 'loss' THEN 1 ELSE 0 END) AS losses,
        AVG(o.pnlPct) AS avgPnlPct
      FROM intraday_scan_results s
      LEFT JOIN scan_outcomes o ON o.scanResultId = s.id
      WHERE o.outcome IS NOT NULL
      GROUP BY s.grade
    `);

    const byDirection = await db.execute(sql`
      SELECT
        s.direction,
        COUNT(*) AS total,
        SUM(CASE WHEN o.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
        AVG(o.pnlPct) AS avgPnlPct
      FROM intraday_scan_results s
      LEFT JOIN scan_outcomes o ON o.scanResultId = s.id
      WHERE o.outcome IS NOT NULL
      GROUP BY s.direction
    `);

    return {
      byGrade: Array.isArray(byGrade) ? (byGrade as unknown as any[][])[0] ?? [] : [],
      byDirection: Array.isArray(byDirection) ? (byDirection as unknown as any[][])[0] ?? [] : [],
    };
  }),

  /** Record outcome for a scan */
  recordOutcome: publicProcedure
    .input(z.object({
      scanResultId: z.number(),
      ticker: z.string(),
      grade: z.enum(["A", "B", "C", "none"]),
      direction: z.enum(["bullish", "bearish", "neutral"]),
      entryPrice: z.number(),
      exitPrice: z.number(),
    }))
    .mutation(async ({ input }) => {
      const pnlPct = ((input.exitPrice - input.entryPrice) / input.entryPrice) *
                     (input.direction === "bearish" ? -1 : 1) * 100;
      const outcome: "win" | "loss" | "neutral" = pnlPct > 0.5 ? "win" : pnlPct < -0.5 ? "loss" : "neutral";
      const db = await getDb();
      if (!db) return { outcome, pnlPct };
      await db.insert(scanOutcomes).values({
        scanResultId: input.scanResultId,
        ticker: input.ticker,
        grade: input.grade,
        direction: input.direction,
        entryPrice: String(input.entryPrice),
        exitPrice: String(input.exitPrice),
        outcome,
        pnlPct: String(pnlPct),
        evaluatedAt: new Date(),
      });
      return { outcome, pnlPct };
    }),

  /** Get current criteria weights */
  getWeights: publicProcedure.query(async () => {
    return loadWeights();
  }),

  /** Update criteria weights (manual tuning) */
  updateWeights: protectedProcedure
    .input(z.record(z.string(), z.number().min(0.1).max(5)))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: 0 };
      for (const [criterion, weight] of Object.entries(input)) {
        await db.execute(sql`
          INSERT INTO criteria_weights (criterion_name, weight)
          VALUES (${criterion}, ${weight})
          ON DUPLICATE KEY UPDATE weight = ${weight}
        `);
      }
      return { updated: Object.keys(input).length };
    }),

  /** Get ticker metadata list */
  getTickers: publicProcedure.query(() => SCANNER_TICKERS),
});
