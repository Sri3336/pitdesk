/**
 * setupWeeklyBriefingJob.ts
 *
 * One-time setup script to register the Weekly Briefing heartbeat cron.
 * Run via: npx tsx server/setupWeeklyBriefingJob.ts
 *
 * Job: weekly-briefing — Sunday 7 PM ET
 *   EDT (UTC-4, Mar–Nov): 7 PM ET = 23:00 UTC → cron: "0 0 23 * * 0"
 *   EST (UTC-5, Nov–Mar): 7 PM ET = 00:00 UTC Mon → cron: "0 0 0 * * 1"
 *   Using EDT as primary (most Sundays fall in EDT).
 */

import { createHeartbeatJob, updateHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";

const WEEKLY_BRIEFING_CRON = "0 0 23 * * 0"; // Sunday 11 PM UTC = Sunday 7 PM EDT

export async function setupWeeklyBriefingJob(): Promise<void> {
  const ownerSession = "";

  try {
    const existing = await listHeartbeatJobs(ownerSession);
    const existingJob = existing.jobs.find(j => j.name === "weekly-briefing");

    if (!existingJob) {
      const job = await createHeartbeatJob(
        {
          name: "weekly-briefing",
          cron: WEEKLY_BRIEFING_CRON,
          path: "/api/scheduled/weekly-briefing",
          method: "POST",
          description: "PitDesk Weekly Briefing — Sunday 7 PM ET. Pit Advisor generates a market outlook from the week's PCR data and emails it to akulasridhar@gmail.com.",
        },
        ownerSession
      );
      console.log(`[WeeklyBriefing] Job created: ${job.taskUid}`);
      console.log(`[WeeklyBriefing] Next execution: ${job.nextExecutionAt}`);
    } else {
      await updateHeartbeatJob(
        existingJob.taskUid,
        {
          cron: WEEKLY_BRIEFING_CRON,
          description: "PitDesk Weekly Briefing — Sunday 7 PM ET (23:00 UTC EDT)",
        },
        ownerSession
      );
      console.log(`[WeeklyBriefing] Job reconciled (taskUid=${existingJob.taskUid}, cron=${WEEKLY_BRIEFING_CRON})`);
    }

    console.log("[WeeklyBriefing] Setup complete.");
  } catch (err) {
    console.error("[WeeklyBriefing] Setup failed:", err);
    throw err;
  }
}

// Allow running directly: npx tsx server/setupWeeklyBriefingJob.ts
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  setupWeeklyBriefingJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
