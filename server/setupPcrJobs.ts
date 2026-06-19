/**
 * setupPcrJobs.ts
 *
 * One-time setup script to register the two PCR scheduled heartbeat jobs.
 * Run via: node -r dotenv/config -e "require('./server/setupPcrJobs').setupPcrJobs()"
 *
 * Jobs registered:
 *  1. pcr-eod-snapshot   — 4:30 PM ET = 21:30 UTC (cron: "0 30 21 * * 1-5")
 *  2. pcr-intraday-scan  — 11:30 AM ET = 16:30 UTC (cron: "0 30 16 * * 1-5")
 *
 * Both run Monday–Friday only (weekdays = 1-5 in cron dow).
 * The heartbeat platform uses UTC, so ET times are converted:
 *   ET = UTC - 5h (EST) or UTC - 4h (EDT)
 *   Using EST (UTC-5) as the conservative baseline:
 *     4:30 PM ET = 21:30 UTC
 *     11:30 AM ET = 16:30 UTC
 */

import { createHeartbeatJob, updateHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";

export async function setupPcrJobs(): Promise<void> {
  // Use empty string = project owner identity (no user session needed for system jobs)
  const ownerSession = "";

  try {
    // Check existing jobs to avoid duplicates
    const existing = await listHeartbeatJobs(ownerSession);

    // Correct cron expressions (EDT = UTC-4, valid Mar–Nov; EST = UTC-5 Nov–Mar)
    // We use EDT (UTC-4) as the primary since most trading days fall in EDT:
    //   4:30 PM ET = 20:30 UTC (EDT) → cron: "0 30 20 * * 1-5"
    //  11:30 AM ET = 15:30 UTC (EDT) → cron: "0 30 15 * * 1-5"
    const EOD_CRON = "0 30 20 * * 1-5";      // 4:30 PM ET (EDT)
    const INTRADAY_CRON = "0 30 15 * * 1-5"; // 11:30 AM ET (EDT)

    // ── Job 1: EOD OI Snapshot at 4:30 PM ET ──────────────────────────────────
    const existingEod = existing.jobs.find(j => j.name === "pcr-eod-snapshot");
    if (!existingEod) {
      const eodJob = await createHeartbeatJob(
        {
          name: "pcr-eod-snapshot",
          cron: EOD_CRON,
          path: "/api/scheduled/pcr-eod-snapshot",
          method: "POST",
          description: "PCR End-of-Day OI Snapshot — captures put/call open interest baseline for all 66 tickers at market close (4:30 PM ET). Used as COI baseline for next day's 11:30 AM scan.",
        },
        ownerSession
      );
      console.log(`[PCR Jobs] EOD Snapshot job created: ${eodJob.taskUid}`);
      console.log(`[PCR Jobs] Next execution: ${eodJob.nextExecutionAt}`);
    } else {
      // Reconcile: always update to the correct cron in case it drifted (e.g. stale EST schedule)
      await updateHeartbeatJob(
        existingEod.taskUid,
        { cron: EOD_CRON, description: "PCR End-of-Day OI Snapshot (4:30 PM ET / 20:30 UTC EDT)" },
        ownerSession
      );
      console.log(`[PCR Jobs] EOD Snapshot job reconciled (taskUid=${existingEod.taskUid}, cron=${EOD_CRON}).`);
    }

    // ── Job 2: Intraday Scan at 11:30 AM ET ───────────────────────────────────
    const existingIntraday = existing.jobs.find(j => j.name === "pcr-intraday-scan");
    if (!existingIntraday) {
      const intradayJob = await createHeartbeatJob(
        {
          name: "pcr-intraday-scan",
          cron: INTRADAY_CRON,
          path: "/api/scheduled/pcr-intraday-scan",
          method: "POST",
          description: "PCR 11:30 AM Intraday Scan — computes live PCR + COI delta vs prior EOD snapshot for all 66 tickers. Notifies owner of extreme signals (PCR > 1.5 or < 0.5).",
        },
        ownerSession
      );
      console.log(`[PCR Jobs] Intraday Scan job created: ${intradayJob.taskUid}`);
      console.log(`[PCR Jobs] Next execution: ${intradayJob.nextExecutionAt}`);
    } else {
      await updateHeartbeatJob(
        existingIntraday.taskUid,
        { cron: INTRADAY_CRON, description: "PCR 11:30 AM Intraday Scan (11:30 AM ET / 15:30 UTC EDT)" },
        ownerSession
      );
      console.log(`[PCR Jobs] Intraday Scan job reconciled (taskUid=${existingIntraday.taskUid}, cron=${INTRADAY_CRON}).`);
    }

    console.log("[PCR Jobs] Setup complete.");
  } catch (err) {
    console.error("[PCR Jobs] Setup failed:", err);
    throw err;
  }
}

// Allow running directly: npx tsx server/setupPcrJobs.ts
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  setupPcrJobs()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
