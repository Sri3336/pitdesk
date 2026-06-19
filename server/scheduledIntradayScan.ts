/**
 * Scheduled Intraday Scanner Handler
 *
 * Called by the Manus heartbeat cron every 15 minutes during market hours.
 * - Scans all 50 tickers using the 9-criteria scoring engine (intradayScorer)
 * - Persists results to intraday_scan_results table (rich schema)
 * - Sends email to akulasridhar@gmail.com for any ticker that grades A
 *   (deduped: only alerts once per ticker per 60-min window)
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import { intradayScanResults } from "../drizzle/schema";
import { scoreTicker } from "./lib/intradayScorer";
import { loadWeights } from "./routers/intradayScanner";
import { INTRADAY_TICKER_SYMBOLS } from "../shared/intradayTickers";
import { sdk } from "./_core/sdk";
import { sendEmail } from "./email";
import { eq, and, gte } from "drizzle-orm";

const OWNER_EMAIL = "akulasridhar@gmail.com";

/** Check if market is open (Mon–Fri 9:30 AM – 4:00 PM ET) */
function isMarketOpen(): boolean {
  const now = new Date();
  const etOffset = isDST(now) ? -4 : -5;
  const etMs = now.getTime() + etOffset * 60 * 60 * 1000;
  const et = new Date(etMs);
  const day = et.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = et.getUTCHours();
  const minute = et.getUTCMinutes();
  const minuteOfDay = hour * 60 + minute;
  return minuteOfDay >= 570 && minuteOfDay < 960;
}

function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.max(jan, jul) !== date.getTimezoneOffset();
}

/** Send grade-A alert email */
async function sendGradeAAlertEmail(alerts: Array<{
  ticker: string;
  grade: string;
  direction: string;
  weightedScore: number;
  maxScore: number;
  price: number;
  trapDetected: boolean;
}>) {
  const subject = `🚨 PitDesk A-Setup Alert: ${alerts.map(a => a.ticker).join(", ")}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#22c55e">PitDesk Intraday A-Setup Alert</h2>
      <p>${alerts.length} ticker(s) just scored Grade A:</p>
      ${alerts.map(a => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:8px 0">
          <strong style="font-size:18px">${a.ticker}</strong>
          <span style="background:#22c55e;color:white;padding:2px 8px;border-radius:4px;margin-left:8px">Grade A</span>
          <br/>
          <span style="color:#6b7280">Direction: ${a.direction} | Score: ${a.weightedScore.toFixed(1)}/${a.maxScore.toFixed(1)} | Price: $${a.price.toFixed(2)}</span>
          ${a.trapDetected ? '<br/><span style="color:#ef4444">⚠️ Institutional trap detected — use caution</span>' : ''}
        </div>
      `).join("")}
      <p style="color:#6b7280;font-size:12px">Sent by PitDesk Intraday Scanner at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
    </div>`;

  try {
    await sendEmail({ to: OWNER_EMAIL, subject, html });
  } catch (err) {
    console.error("[IntradayScan] Email send failed:", err);
  }
}

/** Main handler — called by heartbeat cron */
export async function intradayScanHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    if (!isMarketOpen()) {
      return res.json({ ok: true, skipped: "market-closed", time: new Date().toISOString() });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "database-unavailable" });
    }

    // Load current criteria weights from DB
    const weights = await loadWeights();

    // Score all tickers
    console.log("[IntradayScan] Starting scheduled scan of", INTRADAY_TICKER_SYMBOLS.length, "tickers");
    const results = await Promise.allSettled(
      INTRADAY_TICKER_SYMBOLS.map(ticker => scoreTicker(ticker, weights))
    );

    const valid = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scoreTicker>>> =>
        r.status === "fulfilled" && r.value !== null)
      .map(r => r.value!);

    // Persist all results
    if (valid.length > 0) {
      const inserts = valid.map((r) => ({
        ticker: r.ticker,
        grade: r.grade as "A" | "B" | "C" | "none",
        direction: r.direction as "bullish" | "bearish" | "neutral",
        weightedScore: String(r.weightedScore),
        maxScore: String(r.maxScore),
        price: String(r.price),
        vwap: r.vwap != null ? String(r.vwap) : null,
        rvol: r.rvol != null ? String(r.rvol) : null,
        rsi: r.rsi != null ? String(r.rsi) : null,
        atr: r.atr != null ? String(r.atr) : null,
        entryLow: r.entryLow != null ? String(r.entryLow) : null,
        entryHigh: r.entryHigh != null ? String(r.entryHigh) : null,
        stopLevel: r.stopLevel != null ? String(r.stopLevel) : null,
        target1: r.target1 != null ? String(r.target1) : null,
        target2: r.target2 != null ? String(r.target2) : null,
        criteriaJson: JSON.stringify(r.criteria),
        trapDetected: r.trap?.detected ?? false,
        trapType: r.trap?.type ?? null,
        trapDetails: r.trap?.details ?? null,
        optionStrategy: r.optionStrategy ?? null,
        optionStrike: r.optionStrike != null ? String(r.optionStrike) : null,
        optionExpiry: r.optionExpiry ?? null,
        optionDebit: r.optionDebit != null ? String(r.optionDebit) : null,
        optionMaxProfit: r.optionMaxProfit != null ? String(r.optionMaxProfit) : null,
        optionMaxLoss: r.optionMaxLoss != null ? String(r.optionMaxLoss) : null,
        alertSent: false,
      }));
      await db.insert(intradayScanResults).values(inserts);
    }

    // Find grade-A tickers that haven't been alerted in the last 60 min
    const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000);
    const gradeAResults = valid.filter(r => r.grade === "A");
    const toAlert: typeof gradeAResults = [];

    for (const r of gradeAResults) {
      const recent = await db
        .select()
        .from(intradayScanResults)
        .where(
          and(
            eq(intradayScanResults.ticker, r.ticker),
            eq(intradayScanResults.grade, "A"),
            gte(intradayScanResults.scannedAt, sixtyMinAgo)
          )
        )
        .limit(1);

      const alreadyAlerted = recent.some(row => row.alertSent);
      if (!alreadyAlerted) toAlert.push(r);
    }

    if (toAlert.length > 0) {
      await sendGradeAAlertEmail(toAlert.map(r => ({
        ticker: r.ticker,
        grade: r.grade,
        direction: r.direction,
        weightedScore: r.weightedScore,
        maxScore: r.maxScore,
        price: r.price,
        trapDetected: r.trap?.detected ?? false,
      })));

      // Mark as alerted
      for (const r of toAlert) {
        await db
          .update(intradayScanResults)
          .set({ alertSent: true })
          .where(
            and(
              eq(intradayScanResults.ticker, r.ticker),
              eq(intradayScanResults.alertSent, false),
              eq(intradayScanResults.grade, "A")
            )
          );
      }
      console.log(`[IntradayScan] Sent grade-A alert for: ${toAlert.map(r => r.ticker).join(", ")}`);
    }

    return res.json({
      ok: true,
      scanned: valid.length,
      gradeA: gradeAResults.length,
      alerted: toAlert.length,
      time: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[IntradayScan] Handler error:", error);
    return res.status(500).json({ error, timestamp: new Date().toISOString() });
  }
}
