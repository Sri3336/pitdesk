/**
 * Seed script: insert positions + trade history for all 3 accounts directly into DB.
 * Schema uses auto-increment int IDs (not UUIDs).
 * Run: node scripts/seed_data.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const DB_URL = process.env.DATABASE_URL;
const OWNER_ID = 1; // Sridhar Akula — akulasridhar@gmail.com (actual DB user id)

const conn = await mysql.createConnection(DB_URL);
console.log('Connected to DB');

// ─── Helper ───────────────────────────────────────────────────────────────────
function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/[$,%]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function readCsv(path) {
  const content = readFileSync(path, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

// ─── 1. Clear existing data for owner ────────────────────────────────────────
console.log('\nClearing existing data for owner...');
await conn.execute('DELETE FROM positions WHERE userId = ?', [OWNER_ID]);
await conn.execute('DELETE FROM position_batches WHERE userId = ?', [OWNER_ID]);
await conn.execute('DELETE FROM uploaded_trades WHERE userId = ?', [OWNER_ID]);
await conn.execute('DELETE FROM trade_upload_batches WHERE userId = ?', [OWNER_ID]);
console.log('Cleared.\n');

// ─── 2. Insert positions ──────────────────────────────────────────────────────
const positionFiles = [
  { path: '/home/ubuntu/upload/etrade_4723_positions.csv', accountId: 'etrade-4723', accountLabel: 'E*TRADE -4723' },
  { path: '/home/ubuntu/upload/etrade_2738_positions.csv', accountId: 'etrade-2738', accountLabel: 'E*TRADE -2738' },
  { path: '/home/ubuntu/upload/schwab_positions.csv',      accountId: 'schwab',       accountLabel: 'Schwab' },
];

for (const { path, accountId, accountLabel } of positionFiles) {
  const rows = readCsv(path);
  const filename = path.split('/').pop();

  // Insert batch record
  const [batchResult] = await conn.execute(
    `INSERT INTO position_batches (userId, filename, rowCount, accountId, accountLabel)
     VALUES (?, ?, ?, ?, ?)`,
    [OWNER_ID, filename, rows.length, accountId, accountLabel]
  );
  const batchId = batchResult.insertId;

  // Insert positions
  let inserted = 0;
  for (const r of rows) {
    const qty = parseNum(r.Qty);
    // Skip watchlist/zero rows
    if (qty === 0 && parseNum(r.AvgCost) === 0) continue;

    // Map asset type to enum
    const rawAsset = (r.AssetType || 'stock').toLowerCase();
    const assetType = ['stock','option','etf','other'].includes(rawAsset) ? rawAsset : 'stock';

    await conn.execute(
      `INSERT INTO positions
        (userId, batchId, accountId, accountLabel, ticker, qty, avgCost,
         currentPrice, marketValue, unrealizedPnl, unrealizedPnlPct, assetType, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        OWNER_ID, batchId, accountId, accountLabel,
        r.Ticker, qty, parseNum(r.AvgCost),
        parseNum(r.CurrentPrice), parseNum(r.MarketValue),
        parseNum(r['UnrealizedPnL']), parseNum(r['UnrealizedPnL%']),
        assetType, r.Notes || ''
      ]
    );
    inserted++;
  }
  console.log(`✓ Positions ${accountLabel}: ${inserted} rows (batch #${batchId})`);
}

// ─── 3. Insert trade history ──────────────────────────────────────────────────
const tradeFiles = [
  { path: '/home/ubuntu/upload/etrade_4723_trades.csv', accountId: 'etrade-4723', accountLabel: 'E*TRADE -4723' },
  { path: '/home/ubuntu/upload/etrade_2738_trades.csv', accountId: 'etrade-2738', accountLabel: 'E*TRADE -2738' },
  { path: '/home/ubuntu/upload/schwab_trades.csv',      accountId: 'schwab',       accountLabel: 'Schwab' },
];

for (const { path, accountId, accountLabel } of tradeFiles) {
  const rows = readCsv(path);
  const filename = path.split('/').pop();

  // Insert batch record
  const [batchResult] = await conn.execute(
    `INSERT INTO trade_upload_batches (userId, filename, rowCount, source, status, accountId, accountLabel)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [OWNER_ID, filename, rows.length, 'csv', 'processed', accountId, accountLabel]
  );
  const batchId = batchResult.insertId;

  // Insert trades in chunks
  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    for (const r of chunk) {
      const entryPrice = parseNum(r.EntryPrice);
      if (!entryPrice) continue;

      const qty = parseNum(r.Qty);
      if (!qty) continue;

      // Normalize side to enum
      const sideRaw = (r.Side || 'BUY').toUpperCase();
      const side = ['BUY','SELL','LONG','SHORT'].includes(sideRaw) ? sideRaw : 'BUY';

      // Normalize asset type
      const rawAsset = (r.AssetType || 'stock').toLowerCase();
      const assetType = ['stock','option','etf','other'].includes(rawAsset) ? rawAsset : 'stock';

      // Trade date: keep as YYYY-MM-DD string, strip "as of" suffixes
      let rawDate = (r.Date || '2025-01-01').split(' as of')[0].trim();
      // Re-normalize to YYYY-MM-DD
      const dm = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const tradeDate = dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : rawDate.substring(0, 10);

      const pnl = parseNum(r.PnL);
      const isWin = pnl !== null ? (pnl > 0 ? 1 : 0) : null;

      const ticker = (r.Ticker || '').substring(0, 20);
      await conn.execute(
        `INSERT INTO uploaded_trades
          (userId, batchId, ticker, tradeDate, side, qty, entryPrice, exitPrice,
           pnl, pnlPct, strategy, assetType, notes, isWin, accountId, accountLabel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          OWNER_ID, batchId, ticker, tradeDate, side, qty,
          entryPrice, parseNum(r.ExitPrice) || null,
          pnl, parseNum(r['PnL%']) || null,
          r.Strategy || '', assetType,
          (r.Notes || '').substring(0, 200),
          isWin, accountId, accountLabel
        ]
      );
      inserted++;
    }
    process.stdout.write(`\r  ${accountLabel}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}...`);
  }
  console.log(`\n✓ Trades ${accountLabel}: ${inserted} rows (batch #${batchId})`);
}

await conn.end();
console.log('\n✅ Database seeded successfully.');
