/**
 * email.ts — Email sending helper using Manus built-in Forge API (Resend)
 */
import { ENV } from "./_core/env";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export type EmailTransport = "resend" | "forge" | "none";

export function selectEmailTransport(input: {
  resendApiKey?: string;
  emailFrom?: string;
  forgeApiUrl?: string;
  forgeApiKey?: string;
}): EmailTransport {
  if (input.resendApiKey && input.emailFrom) return "resend";
  if (input.forgeApiUrl && input.forgeApiKey) return "forge";
  return "none";
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  try {
    const transport = selectEmailTransport(ENV);
    if (transport === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.resendApiKey}`,
        },
        body: JSON.stringify({
          from: ENV.emailFrom,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
        }),
      });
      return res.ok;
    }

    if (transport === "none") {
      console.warn("[Email] No external Resend or managed email configuration is available");
      return false;
    }

    const res = await fetch(`${ENV.forgeApiUrl}/v1/email/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify({
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[Email] Failed to send email:", err);
    return false;
  }
}

export function buildFibEmaAlertEmail(
  ticker: string,
  currentPrice: number,
  fibLevel: number,
  fibPrice: number,
  emaPeriod: number,
  emaValue: number
): string {
  const appUrl = (ENV.appUrl || "https://trading.akulaz.ai").replace(/\/$/, "");
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #22c55e; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">🎯 PitDesk — Fib + EMA Confluence Alert</h2>
      </div>
      <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
        <h3 style="color: #111827; margin-top: 0;">${ticker} — Confluence Detected</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px 12px; font-weight: bold; color: #374151;">Current Price</td>
            <td style="padding: 8px 12px; color: #111827;">$${currentPrice.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; color: #374151;">Fib Level</td>
            <td style="padding: 8px 12px; color: #22c55e;">${fibLevel}% → $${fibPrice.toFixed(2)}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 8px 12px; font-weight: bold; color: #374151;">EMA</td>
            <td style="padding: 8px 12px; color: #3b82f6;">EMA-${emaPeriod} → $${emaValue.toFixed(2)}</td>
          </tr>
        </table>
        <p style="color: #6b7280; font-size: 14px;">
          Price is within 1% of both the ${fibLevel}% Fibonacci retracement and the ${emaPeriod}-period EMA — 
          a high-probability confluence zone. Consider reviewing for a potential entry.
        </p>
        <a href="${appUrl}/fib-ema-alerts" 
           style="display: inline-block; background: #22c55e; color: white; padding: 10px 20px; 
                  border-radius: 6px; text-decoration: none; font-weight: bold;">
          View in PitDesk →
        </a>
      </div>
    </div>
  `;
}
