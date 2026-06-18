/**
 * Scheduled Intraday Scanner Handler
 *
 * Called by the Manus heartbeat cron every 15 minutes during market hours.
 * - Scans all 50 tickers using the 9-criteria scoring engine
 * - Persists results to intraday_scan_results table
 * - Sends email to akulasridhar@gmail.com for any ticker that grades A
 *   (deduped: only alerts once per ticker per 60-min window)
 */

import type { Request, Response } from "express";
import { getDb } from "./db";
import { intradayScanResults } from "../drizzle/schema";
import { runIntradayScan } from "./intradayScanner";
import { INTRADAY_TICKER_SYMBOLS } from "../shared/intradayTickers";
import { sdk } from "./_core/sdk";
import { sendEmail } from "./email";
import { eq, and, gte } from "drizzle-orm";

const OWNER_EMAIL = "akulasridhar@gmail.com";

/** Check if market is open (Mon–Fri 9:30 AM – 4:00 PM ET) */
function isMarketOpen(): boolean {
  const now = new Date();
  // Convert to ET (UTC-4 in summer / EDT, UTC-5 in winter / EST)
  const etOffset = isDST(now) ? -4 : -5;
  const etMs = now.getTime() + etOffset * 60 * 60 * 1000;
  const et = new Date(etMs);

  const day = et.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hour = et.getUTCHours();
  const minute = et.getUTCMinutes();
  const minuteOfDay = hour * 60 + minute;

  // 9:30 AM = 570 min, 4:00 PM = 960 min
  return minuteOfDay >= 570 && minuteOfDay < 960;
}

/** Rough DST check for US Eastern Time */
function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.max(jan, jul) !== date.getTimezoneOffset();
}

/** Send grade-A alert email via Manus notification API */
async function sendGradeAAlertEmail(alerts: Array<{
  symbol: string;
  score: number;
  grade: string;
  direction: string;
  criteria: Array<{ name: string; passed: boolean; value: string; weight: number }>;
}>) {
  const subject = `🚨 PitDesk Intraday Alert — ${alerts.length} Grade A Signal${alerts.length > 1 ? "s" : ""}`;

  const rows = alerts.map((a) => {
    const passed = a.criteria.filter((c) => c.passed).length;
    const total = a.criteria.length;
    const criteriaRows = a.criteria
      .map((c) => `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;">${c.passed ? "✅" : "❌"}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;">${c.name}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;">${c.value}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${c.weight.toFixed(1)}</td>
      </tr>`)
      .join("");

    return `
      <div style="margin-bottom:24px;border:2px solid #22c55e;border-radius:8px;overflow:hidden;">
        <div style="background:#22c55e;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:20px;font-weight:700;">${a.symbol}</span>
          <span style="font-size:16px;">Grade <strong>${a.grade}</strong> · ${a.score.toFixed(1)}/11.0 pts · ${a.direction.toUpperCase()}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Pass</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Criterion</th>
              <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Value</th>
              <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb;">Weight</th>
            </tr>
          </thead>
          <tbody>${criteriaRows}</tbody>
        </table>
        <div style="padding:8px 16px;background:#f0fdf4;font-size:13px;color:#166534;">
          ${passed}/${total} criteria passed
        </div>
      </div>`;
  }).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e293b;">PitDesk Intraday Scanner Alert</h2>
      <p style="color:#64748b;">The following tickers just scored Grade A on the 9-criteria intraday momentum scorecard:</p>
      ${rows}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
        Scanned at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET<br>
        <a href="https://trading.akulaz.ai/intraday-scanner" style="color:#22c55e;">View full scanner →</a>
      </p>
    </div>`;

  try {
    await sendEmail({
      to: OWNER_EMAIL,
      subject,
      html,
    });
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

    // Skip if market is closed
    if (!isMarketOpen()) {
      return res.json({ ok: true, skipped: "market-closed", time: new Date().toISOString() });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "database-unavailable" });
    }

    const now = Date.now();
    const scanBatch = Math.floor(now / 1000);

    // Run the full 50-ticker scan
    console.log("[IntradayScan] Starting scheduled scan of", INTRADAY_TICKER_SYMBOLS.length, "tickers");
    const results = await runIntradayScan(INTRADAY_TICKER_SYMBOLS);

    // Persist all results
    const inserts = results.map((r) => ({
      scannedAt: scanBatch,
      symbol: r.ticker,
      score: String(r.score),
      grade: r.grade,
      direction: r.direction,
      criteriaJson: JSON.stringify(r.criteria),
      currentPrice: String(r.currentPrice ?? 0),
      vwap: String(r.vwap ?? 0),
      atr: String(r.atr ?? 0),
      alerted: 0 as const,
    }));

    if (inserts.length > 0) {
      await db.insert(intradayScanResults).values(inserts);
    }

    // Find grade-A tickers that haven't been alerted in the last 60 min
    const sixtyMinAgo = now - 60 * 60 * 1000;
    const gradeAResults = results.filter((r) => r.grade === "A");

    const toAlert: typeof gradeAResults = [];
    for (const r of gradeAResults) {
      // Check if we already alerted this symbol in the last 60 min
      const recent = await db
        .select()
        .from(intradayScanResults)
        .where(
          and(
            eq(intradayScanResults.symbol, r.ticker),
            eq(intradayScanResults.grade, "A"),
            gte(intradayScanResults.scannedAt, Math.floor(sixtyMinAgo / 1000))
          )
        )
        .limit(1);

      const alreadyAlerted = recent.some((row: { alerted: number }) => row.alerted === 1);
      if (!alreadyAlerted) {
        toAlert.push(r);
      }
    }

    // Send email if there are new grade-A signals
    if (toAlert.length > 0) {
      await sendGradeAAlertEmail(
        toAlert.map((r) => ({
          symbol: r.ticker,
          score: r.score,
          grade: r.grade,
          direction: r.direction,
          criteria: r.criteria,
        }))
      );

      // Mark as alerted
      for (const r of toAlert) {
        await db
          .update(intradayScanResults)
          .set({ alerted: 1 })
          .where(
            and(
              eq(intradayScanResults.symbol, r.ticker),
              eq(intradayScanResults.scannedAt, scanBatch)
            )
          );
      }

      console.log(`[IntradayScan] Sent grade-A alert for: ${toAlert.map((r) => r.ticker).join(", ")}`);
    }

    return res.json({
      ok: true,
      scanned: results.length,
      gradeA: gradeAResults.length,
      alerted: toAlert.length,
      time: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[IntradayScan] Handler error:", error);
    return res.status(500).json({
      error,
      stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
