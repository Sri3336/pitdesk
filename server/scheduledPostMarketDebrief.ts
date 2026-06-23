/**
 * scheduledPostMarketDebrief.ts
 *
 * Daily 4:30 PM ET Post-Market Debrief — heartbeat handler.
 *
 * What it does:
 * 1. Pulls all open trades from manual_trades for the owner (user ID 210001)
 * 2. Pulls today's top PCR movers / signals from pcr_scheduled_results
 * 3. Calls Pit Advisor LLM to generate a position review + tomorrow's watchlist
 * 4. Sends a rich HTML email to akulasridhar@gmail.com
 *
 * Cron: "0 30 20 * * 1-5"  → Weekdays 8:30 PM UTC = 4:30 PM EDT (UTC-4)
 * Path: /api/scheduled/post-market-debrief
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { sendEmail } from "./email";
import { getDb } from "./db";
import { manualTrades, pcrScheduledResults } from "../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";

const OWNER_EMAIL = "akulasridhar@gmail.com";
const OWNER_USER_ID = 210001;

// ─── ET date helper ────────────────────────────────────────────────────────────

function getEasternDate(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function getEasternTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Data Fetchers ────────────────────────────────────────────────────────────

interface OpenTrade {
  id: number;
  ticker: string;
  strategyType: string | null;
  entryDate: string | null;
  entryPrice: string | null;
  stopPrice: string | null;
  targetPrice: string | null;
  quantity: number | null;
  account: string | null;
  postTradeNotes: string | null;
}

async function getOpenTrades(): Promise<OpenTrade[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const rows = await db
      .select({
        id: manualTrades.id,
        ticker: manualTrades.ticker,
        strategyType: manualTrades.strategyType,
        entryDate: manualTrades.entryDate,
        entryPrice: manualTrades.entryPrice,
        stopPrice: manualTrades.stopPrice,
        targetPrice: manualTrades.targetPrice,
        quantity: manualTrades.quantity,
        account: manualTrades.account,
        postTradeNotes: manualTrades.postTradeNotes,
      })
      .from(manualTrades)
      .where(and(eq(manualTrades.userId, OWNER_USER_ID), eq(manualTrades.status, "open")))
      .orderBy(desc(manualTrades.createdAt))
      .limit(20);

    return rows as OpenTrade[];
  } catch (err) {
    console.error("[PostMarketDebrief] Error fetching open trades:", err);
    return [];
  }
}

interface PcrSignal {
  ticker: string;
  pcr: string;
  signal: string;
  coiSignal: string | null;
  coiImbalancePct: string | null;
  strategyHint: string;
}

async function getTodayPcrSignals(): Promise<PcrSignal[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const today = getEasternDate();
    const rows = await db
      .select({
        ticker: pcrScheduledResults.ticker,
        pcr: pcrScheduledResults.pcr,
        signal: pcrScheduledResults.signal,
        coiSignal: pcrScheduledResults.coiSignal,
        coiImbalancePct: pcrScheduledResults.coiImbalancePct,
        strategyHint: pcrScheduledResults.strategyHint,
      })
      .from(pcrScheduledResults)
      .where(
        and(
          gte(pcrScheduledResults.runDate, today),
          eq(pcrScheduledResults.runType, "intraday_scan")
        )
      )
      .orderBy(desc(pcrScheduledResults.coiImbalancePct))
      .limit(10);

    return rows as PcrSignal[];
  } catch (err) {
    console.error("[PostMarketDebrief] Error fetching PCR signals:", err);
    return [];
  }
}

// ─── LLM Debrief Generator ────────────────────────────────────────────────────

async function generateDebrief(
  openTrades: OpenTrade[],
  pcrSignals: PcrSignal[],
  today: string
): Promise<string> {
  const tradesSummary = openTrades.length > 0
    ? openTrades.map((t, i) => {
        const entry = t.entryPrice ? `Entry: $${t.entryPrice}` : "";
        const stop = t.stopPrice ? `Stop: $${t.stopPrice}` : "";
        const target = t.targetPrice ? `Target: $${t.targetPrice}` : "";
        const notes = t.postTradeNotes ? `Notes: ${t.postTradeNotes}` : "";
        return `${i + 1}. ${t.ticker} — ${t.strategyType ?? "Unknown strategy"} | ${[entry, stop, target].filter(Boolean).join(" | ")} | Qty: ${t.quantity ?? "?"} | ${t.account ?? "Unknown account"}${notes ? `\n   ${notes}` : ""}`;
      }).join("\n")
    : "No open positions in the trade log.";

  const pcrSummary = pcrSignals.length > 0
    ? pcrSignals.map((s, i) => {
        const coi = s.coiSignal && s.coiImbalancePct
          ? ` | COI: ${s.coiSignal} (${Number(s.coiImbalancePct).toFixed(0)}% imbalance)`
          : "";
        return `${i + 1}. ${s.ticker}: PCR ${s.pcr} | ${s.signal}${coi} | ${s.strategyHint}`;
      }).join("\n")
    : "No PCR scan data available for today.";

  const prompt = `You are Pit Advisor — PitDesk's AI trading mentor for Sridhar Akula.

Today is ${today}. The market just closed at 4:00 PM ET. It is now 4:30 PM ET.

## Open Positions (from Trade Log)
${tradesSummary}

## Today's PCR + COI Signals (11:30 AM scan)
${pcrSummary}

Write a concise **Post-Market Debrief** for Sridhar. Structure it as:

## Position Review
For each open position above:
- Quick assessment: is the trade still valid? Any stop adjustment needed?
- One specific action for tomorrow (hold/tighten stop/take partial profit/exit)

## Today's Market Regime
1–2 sentences on what the PCR/COI signals say about today's market sentiment.

## Tomorrow's Watchlist
3–5 specific tickers (from PCR signals or open positions) with:
- Entry trigger to watch for
- Options strategy if applicable (be specific: e.g., "Bull Put Spread, sell $X put, buy $Y put, 14 DTE")
- Key risk level

## Pit Advisor Bottom Line
One punchy paragraph: what's the dominant setup for tomorrow, what to avoid, and any overnight risk to watch.

Be direct and specific. No fluff. Sridhar is an experienced trader — speak to him as a peer.`;

  try {
    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1200,
    });
    const content = result.choices[0]?.message?.content;
    return typeof content === "string" ? content : "Unable to generate debrief.";
  } catch (err) {
    console.error("[PostMarketDebrief] LLM call failed:", err);
    return "LLM unavailable — check PitDesk logs.";
  }
}

// ─── HTML Email Builder ────────────────────────────────────────────────────────

function buildDebriefEmail(
  debrief: string,
  openTrades: OpenTrade[],
  pcrSignals: PcrSignal[],
  today: string
): string {
  const signalColor = (signal: string) => {
    if (signal === "EXTREME_FEAR") return "#22c55e";
    if (signal === "FEAR") return "#86efac";
    if (signal === "NEUTRAL") return "#9ca3af";
    if (signal === "GREED") return "#fb923c";
    if (signal === "EXTREME_GREED") return "#ef4444";
    return "#9ca3af";
  };

  const coiColor = (coiSignal: string | null) => {
    if (coiSignal === "BUY_CALL") return "#22c55e";
    if (coiSignal === "BUY_PUT") return "#ef4444";
    return "#9ca3af";
  };

  // Convert markdown to basic HTML
  const debriefHtml = debrief
    .replace(/^## (.+)$/gm, '<h3 style="color:#111827;margin:20px 0 8px;font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 style="color:#374151;margin:12px 0 4px;font-size:13px">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;color:#374151">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin:8px 0;padding-left:20px">$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;color:#374151">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;color:#374151;line-height:1.6">')
    .replace(/\n/g, '<br/>');

  const tradesHtml = openTrades.length > 0
    ? openTrades.map(t => `
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#111827">${t.ticker}</td>
          <td style="padding:8px 12px;color:#374151;font-size:12px">${t.strategyType ?? "—"}</td>
          <td style="padding:8px 12px;font-mono;color:#374151">${t.entryPrice ? `$${t.entryPrice}` : "—"}</td>
          <td style="padding:8px 12px;font-mono;color:#ef4444">${t.stopPrice ? `$${t.stopPrice}` : "—"}</td>
          <td style="padding:8px 12px;font-mono;color:#22c55e">${t.targetPrice ? `$${t.targetPrice}` : "—"}</td>
          <td style="padding:8px 12px;color:#6b7280;font-size:11px">${t.account ?? "—"}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" style="padding:12px;color:#9ca3af;text-align:center">No open positions</td></tr>`;

  const pcrHtml = pcrSignals.length > 0
    ? pcrSignals.map(s => `
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#111827">${s.ticker}</td>
          <td style="padding:8px 12px;color:#374151">${s.pcr}</td>
          <td style="padding:8px 12px">
            <span style="background:${signalColor(s.signal)};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">
              ${s.signal.replace(/_/g, " ")}
            </span>
          </td>
          <td style="padding:8px 12px">
            ${s.coiSignal ? `<span style="background:${coiColor(s.coiSignal)};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${s.coiSignal.replace(/_/g, " ")}</span>` : "—"}
          </td>
          <td style="padding:8px 12px;color:#6b7280;font-size:12px">${s.strategyHint}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" style="padding:12px;color:#9ca3af;text-align:center">No PCR scan data today</td></tr>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff">
      <!-- Header -->
      <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="background:#22c55e;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px">📋</div>
          <div>
            <div style="color:#22c55e;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">PitDesk Post-Market Debrief</div>
            <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:2px">${today} · 4:30 PM ET</div>
          </div>
        </div>
      </div>

      <!-- Pit Advisor Debrief -->
      <div style="padding:24px 32px;background:#f9fafb;border-left:4px solid #22c55e">
        <div style="color:#22c55e;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">🤖 Pit Advisor Analysis</div>
        <div style="color:#374151;font-size:14px;line-height:1.7">
          <p style="margin:8px 0;color:#374151;line-height:1.6">${debriefHtml}</p>
        </div>
      </div>

      <!-- Open Positions Table -->
      <div style="padding:24px 32px">
        <h3 style="color:#111827;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">
          📂 Open Positions (${openTrades.length})
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Symbol</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Strategy</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Entry</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Stop</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Target</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Account</th>
            </tr>
          </thead>
          <tbody>${tradesHtml}</tbody>
        </table>
      </div>

      <!-- PCR Signals Table -->
      <div style="padding:0 32px 24px">
        <h3 style="color:#111827;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">
          📊 Today's PCR + COI Signals
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Ticker</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">PCR</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Signal</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">COI</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Strategy Hint</th>
            </tr>
          </thead>
          <tbody>${pcrHtml}</tbody>
        </table>
      </div>

      <!-- CTA -->
      <div style="padding:16px 32px 24px;text-align:center">
        <a href="https://www.pitdesk.ai/trade-log"
           style="display:inline-block;background:#22c55e;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">
          Open Trade Log →
        </a>
        <a href="https://www.pitdesk.ai/pit-advisor"
           style="display:inline-block;background:#111827;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;margin-left:12px">
          Ask Pit Advisor →
        </a>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
        <p style="color:#9ca3af;font-size:11px;margin:0">
          PitDesk Post-Market Debrief · ${today} 4:30 PM ET · <a href="https://www.pitdesk.ai" style="color:#22c55e">pitdesk.ai</a>
        </p>
        <p style="color:#d1d5db;font-size:10px;margin:4px 0 0">For educational purposes only. Not financial advice.</p>
      </div>
    </div>
  `;
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

export async function postMarketDebriefHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    console.log(`[PostMarketDebrief] Triggered by cron task ${user.taskUid}`);

    const today = getEasternDate();

    // Fetch data
    const [openTrades, pcrSignals] = await Promise.all([
      getOpenTrades(),
      getTodayPcrSignals(),
    ]);

    console.log(`[PostMarketDebrief] Found ${openTrades.length} open trades, ${pcrSignals.length} PCR signals`);

    // Generate LLM debrief
    const debrief = await generateDebrief(openTrades, pcrSignals, today);

    // Build and send email
    const html = buildDebriefEmail(debrief, openTrades, pcrSignals, today);
    const subject = `📋 PitDesk Post-Market Debrief — ${today}`;

    const sent = await sendEmail({ to: OWNER_EMAIL, subject, html });

    if (!sent) {
      console.error("[PostMarketDebrief] Email send failed");
      return res.status(500).json({ error: "email-send-failed" });
    }

    console.log(`[PostMarketDebrief] Debrief sent to ${OWNER_EMAIL} for ${today}`);
    res.json({
      ok: true,
      date: today,
      openTradesCount: openTrades.length,
      pcrSignalsCount: pcrSignals.length,
      sentTo: OWNER_EMAIL,
    });
  } catch (err) {
    console.error("[PostMarketDebrief] Handler error:", err);
    res.status(500).json({
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { url: req.originalUrl, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}
