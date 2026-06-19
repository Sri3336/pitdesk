/**
 * vcpAlertScheduler.ts
 *
 * Scheduled VCP breakout proximity alert checker.
 * Runs at 9:35 AM ET (14:35 UTC) on weekdays.
 *
 * For each active VCP alert:
 *  1. Run live VCP analysis via fetchVCP() to get current pivot level + distanceToPivot
 *  2. If distanceToPivot <= proximityPct threshold, mark as triggered
 *  3. Send push notification (notifyOwner) AND email (sendEmail) to akulasridhar@gmail.com
 *  4. Otherwise update lastDistancePct for tracking
 */

import { getAllVcpAlerts, updateVcpAlertStatus, updateVcpAlertLastChecked } from "./db";
import { notifyOwner } from "./_core/notification";
import { sendEmail } from "./email";
import { fetchVCP } from "./vcpStrategy";

export interface VcpAlertCheckResult {
  checked: number;
  triggered: number;
  errors: number;
  triggeredTickers: string[];
}

export async function runVcpAlertCheck(): Promise<VcpAlertCheckResult> {
  const alerts = await getAllVcpAlerts();
  if (!alerts.length) {
    console.log("[VCP Alert Check] No active alerts to check");
    return { checked: 0, triggered: 0, errors: 0, triggeredTickers: [] };
  }

  console.log(`[VCP Alert Check] Checking ${alerts.length} active alerts`);

  let triggered = 0;
  let errors = 0;
  const triggeredTickers: string[] = [];

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < alerts.length; i += 5) {
    const batch = alerts.slice(i, i + 5);

    for (const alert of batch) {
      try {
        // Use live VCP analysis for accurate pivot level
        const vcpResult = await fetchVCP(alert.ticker);
        const { pivotLevel, distanceToPivot, stage, vcpScore } = vcpResult;

        const threshold = parseFloat(alert.proximityPct ?? "3");

        console.log(
          `[VCP Alert Check] ${alert.ticker}: stage=${stage}, score=${vcpScore}, ` +
          `pivot=${pivotLevel.toFixed(2)}, distance=${distanceToPivot.toFixed(2)}%, threshold=${threshold}%`
        );

        // Update last distance regardless of trigger
        await updateVcpAlertLastChecked(alert.id, distanceToPivot);

        // Trigger if within threshold of pivot (and not already past by more than 2%)
        const isTriggered = distanceToPivot >= -2 && distanceToPivot <= threshold;

        if (isTriggered) {
          await updateVcpAlertStatus(alert.id, "triggered", new Date());
          triggered++;
          triggeredTickers.push(alert.ticker);

          // Push notification
          try {
            await notifyOwner({
              title: `VCP Alert Triggered: ${alert.ticker}`,
              content:
                `${alert.ticker} is within ${distanceToPivot.toFixed(1)}% of its VCP pivot level ($${pivotLevel.toFixed(2)}).\n\n` +
                `Stage: ${stage} | VCP Score: ${vcpScore}/10\n` +
                `Alert threshold: ${threshold}%\n\n` +
                `Consider entering a call debit spread or buying calls on breakout confirmation above the pivot.`,
            });
          } catch (notifyErr) {
            console.error(`[VCP Alert Check] Failed to send push for ${alert.ticker}:`, notifyErr);
          }

          // Email notification
          try {
            await sendEmail({
              to: "akulasridhar@gmail.com",
              subject: `VCP Alert Triggered: ${alert.ticker} — within ${distanceToPivot.toFixed(1)}% of pivot`,
              html:
                `<h2>VCP Alert Triggered: ${alert.ticker}</h2>` +
                `<p>${alert.ticker} is within <strong>${distanceToPivot.toFixed(1)}%</strong> of its VCP pivot level.</p>` +
                `<ul>` +
                `<li><strong>Stage:</strong> ${stage}</li>` +
                `<li><strong>VCP Score:</strong> ${vcpScore}/10</li>` +
                `<li><strong>Pivot Level:</strong> $${pivotLevel.toFixed(2)}</li>` +
                `<li><strong>Distance to Pivot:</strong> ${distanceToPivot.toFixed(2)}%</li>` +
                `<li><strong>Alert Threshold:</strong> ${threshold}%</li>` +
                `<li><strong>Triggered at:</strong> ${new Date().toUTCString()}</li>` +
                `</ul>` +
                `<p>Consider entering a call debit spread or buying calls on breakout confirmation above the pivot.</p>`,
            });
          } catch (emailErr) {
            console.error(`[VCP Alert Check] Failed to send email for ${alert.ticker}:`, emailErr);
          }
        }
      } catch (err) {
        errors++;
        console.error(`[VCP Alert Check] Error processing ${alert.ticker}:`, err);
      }
    }

    // Small delay between batches
    if (i + 5 < alerts.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const result: VcpAlertCheckResult = {
    checked: alerts.length,
    triggered,
    errors,
    triggeredTickers,
  };

  console.log(`[VCP Alert Check] Done: ${alerts.length} checked, ${triggered} triggered, ${errors} errors`);

  // Summary push notification if any triggered
  if (triggered > 0) {
    try {
      await notifyOwner({
        title: `VCP Alert Summary: ${triggered} ticker(s) near pivot`,
        content:
          `Daily VCP alert check complete.\n\n` +
          `Triggered: ${triggeredTickers.join(", ")}\n` +
          `Total checked: ${alerts.length}\n\n` +
          `Visit the VCP Alerts page to review and act on these signals.`,
      });
    } catch (err) {
      console.error("[VCP Alert Check] Failed to send summary notification:", err);
    }
  }

  return result;
}
