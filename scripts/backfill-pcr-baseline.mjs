/**
 * PCR Baseline Backfill Script
 * Reads PCR_Baseline_raw_metrics_20260512.json and inserts records into:
 *   - pcr_oi_snapshots  (EOD snapshot — powers PCR Trend chart)
 *   - pcr_scheduled_results (intraday_scan — powers History tab + sparklines)
 *
 * Run: node scripts/backfill-pcr-baseline.mjs
 */

import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

// ─── Load baseline JSON ───────────────────────────────────────────────────────
const jsonPath = "/home/ubuntu/.manus/config/project-file/PCR_Baseline_raw_metrics_20260512.json";
const raw = JSON.parse(readFileSync(jsonPath, "utf8"));

const runDate = raw.date; // "2026-05-12"
const summary = raw.summary; // Array of 22 ticker objects

console.log(`📅 Backfilling PCR data for date: ${runDate}`);
console.log(`📊 Tickers: ${summary.length}`);

// ─── Signal classification (matches pcrScheduler.ts logic) ───────────────────
function classifySignal(pcr) {
  if (pcr >= 1.5) return { signal: "EXTREME_FEAR", strength: 5 };
  if (pcr >= 1.2) return { signal: "FEAR",         strength: 4 };
  if (pcr >= 0.8) return { signal: "NEUTRAL",      strength: 3 };
  if (pcr >= 0.5) return { signal: "GREED",        strength: 2 };
  return           { signal: "EXTREME_GREED",       strength: 1 };
}

function strategyHint(signal) {
  switch (signal) {
    case "EXTREME_FEAR":  return "Sell Put / Bull Put Spread";
    case "FEAR":          return "Bull Put Spread";
    case "NEUTRAL":       return "Iron Condor / Strangle";
    case "GREED":         return "Bear Call Spread";
    case "EXTREME_GREED": return "Sell Call / Bear Call Spread";
    default:              return "Monitor";
  }
}

function recommendation(signal, ticker) {
  switch (signal) {
    case "EXTREME_FEAR":  return `${ticker}: Contrarian bullish — sell put premium or buy calls`;
    case "FEAR":          return `${ticker}: Mildly bullish — consider bull put spread`;
    case "NEUTRAL":       return `${ticker}: No clear edge — iron condor or wait`;
    case "GREED":         return `${ticker}: Mildly bearish — consider bear call spread`;
    case "EXTREME_GREED": return `${ticker}: Contrarian bearish — sell call premium or buy puts`;
    default:              return `${ticker}: Monitor`;
  }
}

// ─── Parse DB URL ─────────────────────────────────────────────────────────────
// Format: mysql://user:pass@host:port/db?ssl=...
const urlMatch = DB_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!urlMatch) {
  console.error("❌ Could not parse DATABASE_URL:", DB_URL.substring(0, 50));
  process.exit(1);
}
const [, user, password, host, port, database] = urlMatch;

const conn = await createConnection({
  host,
  port: parseInt(port),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: true },
});

console.log("✅ Connected to TiDB");

let snapshotInserted = 0;
let snapshotSkipped = 0;
let resultInserted = 0;
let resultSkipped = 0;
const errors = [];

for (const row of summary) {
  const ticker = row["Ticker"];
  const callOI = Math.round(row["Call OI"] ?? 0);
  const putOI = Math.round(row["Put OI"] ?? 0);
  const callVol = Math.round(row["Call Volume"] ?? 0);
  const putVol = Math.round(row["Put Volume"] ?? 0);
  const pcrVolume = parseFloat((row["PCR Volume"] ?? 0).toFixed(4));
  const pcrOI = parseFloat((row["PCR OI"] ?? 0).toFixed(4));
  const closingPrice = parseFloat((row["Last Price"] ?? 0).toFixed(4));

  const { signal, strength } = classifySignal(pcrVolume);
  const hint = strategyHint(signal);
  const rec = recommendation(signal, ticker);

  // ── 1. Insert into pcr_oi_snapshots (EOD) ──────────────────────────────────
  try {
    await conn.execute(
      `INSERT INTO pcr_oi_snapshots
         (ticker, snapshotDate, totalPutOI, totalCallOI, totalPutVolume, totalCallVolume,
          pcrVolume, pcrOI, closingPrice)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         totalPutOI = VALUES(totalPutOI),
         totalCallOI = VALUES(totalCallOI),
         totalPutVolume = VALUES(totalPutVolume),
         totalCallVolume = VALUES(totalCallVolume),
         pcrVolume = VALUES(pcrVolume),
         pcrOI = VALUES(pcrOI),
         closingPrice = VALUES(closingPrice)`,
      [ticker, runDate, putOI, callOI, putVol, callVol, pcrVolume, pcrOI, closingPrice]
    );
    snapshotInserted++;
    console.log(`  📸 Snapshot: ${ticker} PCR=${pcrVolume.toFixed(3)} OI=${pcrOI.toFixed(3)} price=$${closingPrice}`);
  } catch (err) {
    errors.push(`snapshot ${ticker}: ${err.message}`);
    snapshotSkipped++;
  }

  // ── 2. Insert into pcr_scheduled_results (intraday_scan) ───────────────────
  // We insert as "intraday_scan" so it appears in the History tab and sparklines.
  // pcrDeltaVsPrior is null since this is the baseline (no prior data).
  try {
    await conn.execute(
      `INSERT INTO pcr_scheduled_results
         (runDate, runType, ticker, pcr, pcrOI, signal, signalStrength,
          recommendation, strategyHint, totalPutVolume, totalCallVolume,
          ivSkew, pcrDeltaVsPrior, priorSignal,
          coiCallPct, coiPutPct, coiImbalancePct, coiSignal,
          atmStrike, isExpiryDay, isExpiryEve, expiration)
       VALUES (?, 'intraday_scan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL,
               50.00, 50.00, 0.00, 'NEUTRAL', 0.00, 0, 0, ?)
       ON DUPLICATE KEY UPDATE
         pcr = VALUES(pcr),
         pcrOI = VALUES(pcrOI),
         signal = VALUES(signal),
         signalStrength = VALUES(signalStrength),
         recommendation = VALUES(recommendation),
         strategyHint = VALUES(strategyHint),
         totalPutVolume = VALUES(totalPutVolume),
         totalCallVolume = VALUES(totalCallVolume)`,
      [
        runDate, ticker,
        pcrVolume.toFixed(4), pcrOI.toFixed(4),
        signal, strength,
        rec, hint,
        putVol, callVol,
        0.00, // ivSkew
        row["Options Expiry Used"] ?? "",
      ]
    );
    resultInserted++;
  } catch (err) {
    errors.push(`result ${ticker}: ${err.message}`);
    resultSkipped++;
  }
}

// ── 3. Also insert an EOD snapshot entry in pcr_scheduled_results ─────────────
// This populates the "EOD Snap" run type so the History tab shows both types.
for (const row of summary) {
  const ticker = row["Ticker"];
  const callOI = Math.round(row["Call OI"] ?? 0);
  const putOI = Math.round(row["Put OI"] ?? 0);
  const callVol = Math.round(row["Call Volume"] ?? 0);
  const putVol = Math.round(row["Put Volume"] ?? 0);
  const pcrVolume = parseFloat((row["PCR Volume"] ?? 0).toFixed(4));
  const pcrOI = parseFloat((row["PCR OI"] ?? 0).toFixed(4));
  const { signal, strength } = classifySignal(pcrVolume);
  const hint = strategyHint(signal);
  const rec = recommendation(signal, ticker);

  try {
    await conn.execute(
      `INSERT INTO pcr_scheduled_results
         (runDate, runType, ticker, pcr, pcrOI, signal, signalStrength,
          recommendation, strategyHint, totalPutVolume, totalCallVolume,
          ivSkew, pcrDeltaVsPrior, priorSignal,
          coiCallPct, coiPutPct, coiImbalancePct, coiSignal,
          atmStrike, isExpiryDay, isExpiryEve, expiration)
       VALUES (?, 'eod_snapshot', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL,
               50.00, 50.00, 0.00, 'NEUTRAL', 0.00, 0, 0, ?)
       ON DUPLICATE KEY UPDATE
         pcr = VALUES(pcr),
         pcrOI = VALUES(pcrOI),
         signal = VALUES(signal),
         signalStrength = VALUES(signalStrength)`,
      [
        runDate, ticker,
        pcrVolume.toFixed(4), pcrOI.toFixed(4),
        signal, strength,
        rec, hint,
        putVol, callVol,
        0.00,
        row["Options Expiry Used"] ?? "",
      ]
    );
  } catch (err) {
    // eod_snapshot duplicate is fine — just skip silently
  }
}

await conn.end();

console.log("\n─────────────────────────────────────────");
console.log(`✅ pcr_oi_snapshots:      ${snapshotInserted} inserted/updated, ${snapshotSkipped} skipped`);
console.log(`✅ pcr_scheduled_results: ${resultInserted} inserted/updated, ${resultSkipped} skipped`);
if (errors.length > 0) {
  console.log("\n⚠️  Errors:");
  errors.forEach(e => console.log("   ", e));
}
console.log("─────────────────────────────────────────");
console.log("🎉 Backfill complete!");
