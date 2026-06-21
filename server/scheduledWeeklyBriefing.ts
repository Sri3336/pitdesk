/**
 * scheduledWeeklyBriefing.ts
 *
 * Heartbeat handler for the Sunday 7 PM ET Weekly Briefing.
 * - Pulls the week's PCR data (biggest movers, signal distribution)
 * - Calls Pit Advisor LLM to generate a forward-looking market outlook
 * - Sends a rich HTML email to akulasridhar@gmail.com
 *
 * Cron: "0 0 23 * * 0"  → Sunday 11 PM UTC = Sunday 7 PM EDT (UTC-4)
 * Path: /api/scheduled/weekly-briefing
 */
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { sendEmail } from "./email";
import { getBiggestMovers } from "./pcrScheduler";

const OWNER_EMAIL = "akulasridhar@gmail.com";

// ─── ET date helper ────────────────────────────────────────────────────────────

function getEasternDate(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  // Sunday trigger: week = Mon–Fri just ended
  const end = new Date(now);
  end.setDate(end.getDate() - 1); // Saturday
  const start = new Date(end);
  start.setDate(start.getDate() - 4); // Monday
  return {
    start: start.toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    end: end.toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  };
}

// ─── LLM Market Outlook ────────────────────────────────────────────────────────

async function generateWeeklyOutlook(
  movers: Array<{
    ticker: string;
    pcr: string;
    signal: string;
    pcrDeltaVsPrior: string | null;
    priorSignal: string | null;
    strategyHint: string;
    recommendation: string;
  }>,
  weekRange: { start: string; end: string }
): Promise<string> {
  const moverSummary = movers.length > 0
    ? movers.map((m, i) => {
        const delta = m.pcrDeltaVsPrior != null
          ? ` (PCR delta: ${Number(m.pcrDeltaVsPrior) > 0 ? "+" : ""}${Number(m.pcrDeltaVsPrior).toFixed(3)})`
          : "";
        const change = m.priorSignal && m.priorSignal !== m.signal
          ? ` [${m.priorSignal} → ${m.signal}]`
          : "";
        return `${i + 1}. ${m.ticker}: PCR ${m.pcr} | ${m.signal}${change}${delta} | ${m.strategyHint}`;
      }).join("\n")
    : "No PCR scan data available for this week.";

  const prompt = `You are Pit Advisor — PitDesk's AI trading mentor for Sridhar Akula.

Today is Sunday ${getEasternDate()}. The trading week of ${weekRange.start} to ${weekRange.end} just ended.

Here are the top PCR movers from this week's 11:30 AM ET scans:
${moverSummary}

Write a concise **Weekly Trading Briefing** for Sridhar. Structure it as follows:

## Week in Review
1–2 sentences on the overall market sentiment based on the PCR data above.

## Top Setups for Next Week
3–5 specific tickers from the list above (or SPY/QQQ if no data) with:
- Signal interpretation
- Recommended options strategy (be specific: e.g., "Bull Put Spread on NVDA, sell $X put, buy $Y put, 21 DTE")
- Key risk to watch

## Macro Watch for Next Week
2–3 macro themes or events to watch (earnings, Fed, geopolitical) that could affect these setups.

## Pit Advisor Bottom Line
One punchy paragraph: what's the dominant market regime, what's the highest-conviction trade, and what to avoid.

Keep it sharp and actionable. No fluff. Sridhar is an experienced trader — speak to him as a peer.`;

  try {
    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1200,
    });
    const content = result.choices[0]?.message?.content;
    return typeof content === "string" ? content : "Unable to generate outlook.";
  } catch (err) {
    console.error("[WeeklyBriefing] LLM call failed:", err);
    return "LLM unavailable — check PitDesk logs.";
  }
}

// ─── HTML Email Builder ────────────────────────────────────────────────────────

function buildWeeklyBriefingEmail(
  outlook: string,
  movers: Array<{ ticker: string; pcr: string; signal: string; strategyHint: string; recommendation: string }>,
  weekRange: { start: string; end: string }
): string {
  const signalColor = (signal: string) => {
    if (signal === "EXTREME_FEAR") return "#22c55e";
    if (signal === "FEAR") return "#86efac";
    if (signal === "NEUTRAL") return "#9ca3af";
    if (signal === "GREED") return "#fb923c";
    if (signal === "EXTREME_GREED") return "#ef4444";
    return "#9ca3af";
  };

  const signalEmoji = (signal: string) => {
    if (signal === "EXTREME_FEAR") return "🟢";
    if (signal === "FEAR") return "🟡";
    if (signal === "NEUTRAL") return "⚪";
    if (signal === "GREED") return "🟠";
    if (signal === "EXTREME_GREED") return "🔴";
    return "⚪";
  };

  // Convert markdown to basic HTML
  const outlookHtml = outlook
    .replace(/^## (.+)$/gm, '<h3 style="color:#111827;margin:20px 0 8px;font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 style="color:#374151;margin:12px 0 4px;font-size:13px">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;color:#374151">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin:8px 0;padding-left:20px">$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;color:#374151">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;color:#374151;line-height:1.6">')
    .replace(/\n/g, '<br/>');

  const moversHtml = movers.length > 0
    ? movers.map(m => `
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#111827">${m.ticker}</td>
          <td style="padding:8px 12px;color:#374151">${m.pcr}</td>
          <td style="padding:8px 12px">
            <span style="background:${signalColor(m.signal)};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">
              ${signalEmoji(m.signal)} ${m.signal.replace(/_/g, " ")}
            </span>
          </td>
          <td style="padding:8px 12px;color:#6b7280;font-size:12px">${m.strategyHint}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="padding:12px;color:#9ca3af;text-align:center">No scan data available</td></tr>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff">
      <!-- Header -->
      <div style="background:#111827;padding:24px 32px;border-radius:8px 8px 0 0">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="background:#22c55e;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px">📊</div>
          <div>
            <div style="color:#22c55e;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">PitDesk Weekly Briefing</div>
            <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:2px">Week of ${weekRange.start} → ${weekRange.end}</div>
          </div>
        </div>
      </div>

      <!-- Pit Advisor Outlook -->
      <div style="padding:24px 32px;background:#f9fafb;border-left:4px solid #22c55e">
        <div style="color:#22c55e;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">🤖 Pit Advisor Market Outlook</div>
        <div style="color:#374151;font-size:14px;line-height:1.7">
          <p style="margin:8px 0;color:#374151;line-height:1.6">${outlookHtml}</p>
        </div>
      </div>

      <!-- PCR Movers Table -->
      <div style="padding:24px 32px">
        <h3 style="color:#111827;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">
          📈 Top PCR Movers This Week
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Ticker</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">PCR</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Signal</th>
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Strategy Hint</th>
            </tr>
          </thead>
          <tbody>
            ${moversHtml}
          </tbody>
        </table>
      </div>

      <!-- CTA -->
      <div style="padding:16px 32px 24px;text-align:center">
        <a href="https://www.pitdesk.ai/pcr-dashboard"
           style="display:inline-block;background:#22c55e;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">
          Open PCR Dashboard →
        </a>
        <a href="https://www.pitdesk.ai/pit-advisor"
           style="display:inline-block;background:#111827;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;margin-left:12px">
          Ask Pit Advisor →
        </a>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
        <p style="color:#9ca3af;font-size:11px;margin:0">
          PitDesk Weekly Briefing · Sent Sunday ${getEasternDate()} 7 PM ET · <a href="https://www.pitdesk.ai" style="color:#22c55e">pitdesk.ai</a>
        </p>
        <p style="color:#d1d5db;font-size:10px;margin:4px 0 0">For educational purposes only. Not financial advice.</p>
      </div>
    </div>
  `;
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

export async function weeklyBriefingHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    console.log(`[WeeklyBriefing] Triggered by cron task ${user.taskUid}`);

    const weekRange = getWeekRange();

    // Pull this week's biggest PCR movers (uses today's date — Sunday)
    // Fall back to yesterday if no Sunday scan (PCR scans run Mon–Fri)
    let movers = await getBiggestMovers();
    if (movers.length === 0) {
      movers = await getBiggestMovers(getEasternDate(-1));
    }
    if (movers.length === 0) {
      movers = await getBiggestMovers(getEasternDate(-2));
    }

    // Generate LLM outlook
    const outlook = await generateWeeklyOutlook(movers, weekRange);

    // Build and send email
    const html = buildWeeklyBriefingEmail(outlook, movers, weekRange);
    const subject = `📊 PitDesk Weekly Briefing — Week of ${weekRange.start}`;

    const sent = await sendEmail({ to: OWNER_EMAIL, subject, html });

    if (!sent) {
      console.error("[WeeklyBriefing] Email send failed");
      return res.status(500).json({ error: "email-send-failed" });
    }

    console.log(`[WeeklyBriefing] Briefing sent to ${OWNER_EMAIL} for week ${weekRange.start}–${weekRange.end}`);
    res.json({
      ok: true,
      week: weekRange,
      moversCount: movers.length,
      sentTo: OWNER_EMAIL,
    });
  } catch (err) {
    console.error("[WeeklyBriefing] Handler error:", err);
    res.status(500).json({
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { url: req.originalUrl, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}
