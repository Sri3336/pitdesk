/**
 * setupPostMarketJob.ts
 *
 * One-time script to register the daily 4:30 PM ET Post-Market Debrief
 * heartbeat cron job via the Manus platform.
 *
 * Run after deploying the site:
 *   npx tsx server/setupPostMarketJob.ts
 *
 * Cron: "0 30 20 * * 1-5"
 *   → Weekdays 8:30 PM UTC = 4:30 PM EDT (UTC-4)
 *   → Weekdays 8:30 PM UTC = 3:30 PM EST (UTC-5) in winter — adjust if needed
 *
 * The returned task_uid is printed to stdout — save it if you need to
 * update/delete the job later via `manus-heartbeat update --task-uid <uid>`.
 */

import "dotenv/config";
import { ENV } from "./_core/env";

const FORGE_API_URL = ENV.forgeApiUrl;
const FORGE_API_KEY = ENV.forgeApiKey;

async function registerPostMarketJob() {
  if (!FORGE_API_URL || !FORGE_API_KEY) {
    console.error("[SetupPostMarketJob] Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY");
    process.exit(1);
  }

  const payload = {
    name: "pitdesk-post-market-debrief",
    cron: "0 30 20 * * 1-5",  // Weekdays 8:30 PM UTC = 4:30 PM EDT
    path: "/api/scheduled/post-market-debrief",
    method: "POST",
    description: "PitDesk daily post-market debrief — reviews open positions + PCR signals, sends LLM analysis to akulasridhar@gmail.com",
  };

  console.log("[SetupPostMarketJob] Registering heartbeat job...");
  console.log("[SetupPostMarketJob] Cron:", payload.cron);
  console.log("[SetupPostMarketJob] Path:", payload.path);

  const resp = await fetch(`${FORGE_API_URL}/heartbeat/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`[SetupPostMarketJob] API error ${resp.status}:`, body.slice(0, 500));
    process.exit(1);
  }

  const result = await resp.json() as { taskUid: string; nextExecutionAt?: string | null };
  console.log("[SetupPostMarketJob] ✅ Job registered successfully!");
  console.log("[SetupPostMarketJob] Task UID:", result.taskUid);
  console.log("[SetupPostMarketJob] Next execution:", result.nextExecutionAt ?? "unknown");
  console.log("\n⚠️  Save this task_uid if you need to update/delete the job later:");
  console.log(`   manus-heartbeat update --task-uid ${result.taskUid} --enable=false  # pause`);
  console.log(`   manus-heartbeat delete --task-uid ${result.taskUid}                 # delete`);
  console.log(`   manus-heartbeat logs --task-uid ${result.taskUid}                   # view logs`);
}

registerPostMarketJob().catch(err => {
  console.error("[SetupPostMarketJob] Fatal error:", err);
  process.exit(1);
});
