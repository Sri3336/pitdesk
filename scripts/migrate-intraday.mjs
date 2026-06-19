/**
 * One-time migration: add rich columns to intraday_scan_results
 * Run: node scripts/migrate-intraday.mjs
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const columns = [
  "ALTER TABLE intraday_scan_results ADD COLUMN scannedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE intraday_scan_results ADD COLUMN weightedScore DECIMAL(6,2) NOT NULL DEFAULT 0",
  "ALTER TABLE intraday_scan_results ADD COLUMN maxScore DECIMAL(6,2) NOT NULL DEFAULT 11",
  "ALTER TABLE intraday_scan_results ADD COLUMN price DECIMAL(12,4) NOT NULL DEFAULT 0",
  "ALTER TABLE intraday_scan_results ADD COLUMN rvol DECIMAL(6,2)",
  "ALTER TABLE intraday_scan_results ADD COLUMN rsi DECIMAL(6,2)",
  "ALTER TABLE intraday_scan_results ADD COLUMN entryLow DECIMAL(12,4)",
  "ALTER TABLE intraday_scan_results ADD COLUMN entryHigh DECIMAL(12,4)",
  "ALTER TABLE intraday_scan_results ADD COLUMN stopLevel DECIMAL(12,4)",
  "ALTER TABLE intraday_scan_results ADD COLUMN target1 DECIMAL(12,4)",
  "ALTER TABLE intraday_scan_results ADD COLUMN target2 DECIMAL(12,4)",
  "ALTER TABLE intraday_scan_results ADD COLUMN criteriaJson TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE intraday_scan_results ADD COLUMN trapDetected BOOLEAN NOT NULL DEFAULT FALSE",
  "ALTER TABLE intraday_scan_results ADD COLUMN trapType VARCHAR(64)",
  "ALTER TABLE intraday_scan_results ADD COLUMN trapDetails VARCHAR(256)",
  "ALTER TABLE intraday_scan_results ADD COLUMN optionStrategy VARCHAR(64)",
  "ALTER TABLE intraday_scan_results ADD COLUMN optionStrike DECIMAL(12,4)",
  "ALTER TABLE intraday_scan_results ADD COLUMN optionExpiry VARCHAR(12)",
  "ALTER TABLE intraday_scan_results ADD COLUMN optionDebit DECIMAL(8,2)",
  "ALTER TABLE intraday_scan_results ADD COLUMN optionMaxProfit DECIMAL(8,2)",
  "ALTER TABLE intraday_scan_results ADD COLUMN optionMaxLoss DECIMAL(8,2)",
  "ALTER TABLE intraday_scan_results ADD COLUMN alertSent BOOLEAN NOT NULL DEFAULT FALSE",
  "ALTER TABLE intraday_scan_results ADD COLUMN createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
];

for (const sql of columns) {
  const col = sql.match(/ADD COLUMN (\w+)/)?.[1] ?? "?";
  try {
    await conn.execute(sql);
    console.log(`✅ Added column: ${col}`);
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message?.includes("Duplicate column")) {
      console.log(`⏭  Already exists: ${col}`);
    } else {
      console.error(`❌ Failed ${col}: ${err.message}`);
    }
  }
}

await conn.end();
console.log("Migration complete.");
