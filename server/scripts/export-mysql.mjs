#!/usr/bin/env node
/**
 * Logical MySQL export for the PitDesk Railway staging rehearsal.
 *
 * Usage:
 *   DATABASE_URL='mysql://...' EXPORT_FILE=backups/pitdesk-staging.sql pnpm db:export
 *
 * This is intentionally export-only. It never writes to the source database.
 * SQL dumps contain private trading data; `backups/` is ignored by Git.
 */
import "dotenv/config";
import { createConnection } from "mysql2/promise";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";

const databaseUrl = process.env.DATABASE_URL;
const outputPath = resolve(process.env.EXPORT_FILE ?? `backups/pitdesk-${new Date().toISOString().slice(0, 10)}.sql`);
const batchSize = 2_000;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Refusing to export without an explicit source database.");
}

const quoteIdentifier = value => `\`${String(value).replaceAll("`", "``")}\``;

const sqlLiteral = value => {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  if (value instanceof Date) return `'${value.toISOString().slice(0, 23).replace("T", " ")}'`;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\u0000", "\\0")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")}'`;
};

const write = async (stream, value) => {
  if (!stream.write(value)) await once(stream, "drain");
};

const connection = await createConnection(databaseUrl);
mkdirSync(dirname(outputPath), { recursive: true });
const stream = createWriteStream(outputPath, { encoding: "utf8", mode: 0o600 });

try {
  await write(stream, [
    "-- PitDesk logical MySQL export (staging rehearsal only)",
    `-- Generated at ${new Date().toISOString()}`,
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS=0;",
    "START TRANSACTION;",
    "",
  ].join("\n"));

  const [tableRows] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const tables = tableRows.map(row => Object.values(row)[0]).filter(Boolean);

  for (const table of tables) {
    const safeTable = quoteIdentifier(table);
    const [[createRow]] = await connection.query(`SHOW CREATE TABLE ${safeTable}`);
    const createStatement = Object.values(createRow).find(value => typeof value === "string" && value.startsWith("CREATE TABLE"));
    if (!createStatement) throw new Error(`Could not read schema for ${table}`);

    await write(stream, `\nDROP TABLE IF EXISTS ${safeTable};\n${createStatement};\n`);
    const [[countRow]] = await connection.query(`SELECT COUNT(*) AS total FROM ${safeTable}`);
    const total = Number(countRow.total ?? 0);

    for (let offset = 0; offset < total; offset += batchSize) {
      const [rows] = await connection.query(`SELECT * FROM ${safeTable} LIMIT ${batchSize} OFFSET ${offset}`);
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const columnList = columns.map(quoteIdentifier).join(", ");
      const values = rows.map(row => `(${columns.map(column => sqlLiteral(row[column])).join(", ")})`).join(",\n");
      await write(stream, `INSERT INTO ${safeTable} (${columnList}) VALUES\n${values};\n`);
    }
  }

  await write(stream, "COMMIT;\nSET FOREIGN_KEY_CHECKS=1;\n");
  stream.end();
  await once(stream, "finish");
  console.log(`Exported ${tables.length} tables to ${outputPath}`);
} catch (error) {
  stream.destroy();
  throw error;
} finally {
  await connection.end();
}
