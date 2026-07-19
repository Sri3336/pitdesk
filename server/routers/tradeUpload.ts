/**
 * Trade Upload Router
 *
 * Procedures:
 *   tradeUpload.parseCsv         — parse CSV text, auto-detect columns, return preview rows
 *   tradeUpload.confirmUpload    — save parsed rows to uploaded_trades for current user
 *   tradeUpload.myTrades         — list current user's uploaded trades with P&L summary
 *   tradeUpload.myBatches        — list current user's upload batches
 *   tradeUpload.deleteBatch      — delete a batch and all its trades
 *   tradeUpload.communityInsights — anonymized aggregated insights per ticker
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { uploadedTrades, tradeUploadBatches } from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Known Accounts ────────────────────────────────────────────────────────────

export const KNOWN_ACCOUNTS = [
  { id: "etrade-4723", label: "E*TRADE -4723" },
  { id: "etrade-2738", label: "E*TRADE -2738" },
  { id: "schwab",      label: "Schwab" },
] as const;

// ─── CSV Parser ───────────────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  ticker:      ["ticker", "symbol", "stock", "instrument", "security", "asset"],
  tradeDate:   ["date", "tradedate", "trade_date", "transactiondate", "transaction_date", "opendate", "open_date", "closedate", "close_date", "time"],
  side:        ["side", "action", "type", "direction", "buysell", "buy_sell", "transactiontype", "transaction_type"],
  qty:         ["qty", "quantity", "shares", "contracts", "amount", "size", "units"],
  entryPrice:  ["entryprice", "entry_price", "entry", "price", "buyprice", "buy_price", "open_price", "openprice", "avgprice", "avg_price", "avgcost", "avg_cost"],
  exitPrice:   ["exitprice", "exit_price", "exit", "sellprice", "sell_price", "close_price", "closeprice"],
  pnl:         ["pnl", "p&l", "profit", "profit_loss", "profitloss", "gain", "gain_loss", "gainloss", "net", "netpnl", "net_pnl", "realized", "realizedpnl", "realized_pnl"],
  pnlPct:      ["pnlpct", "pnl_pct", "pnl%", "return", "return%", "returnpct", "return_pct", "gain%", "profit%"],
  strategy:    ["strategy", "setup", "pattern", "type", "tradetype", "trade_type"],
  assetType:   ["assettype", "asset_type", "instrumenttype", "instrument_type", "securitytype", "security_type"],
  notes:       ["notes", "comment", "comments", "description", "memo", "reason"],
};

function detectColumn(headers: string[], field: string): number {
  const aliases = COLUMN_ALIASES[field] ?? [field];
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s_-]/g, "") === alias.replace(/[\s_-]/g, ""));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(raw: string): string {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const eu = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (eu) {
    const year = eu[3].length === 2 ? `20${eu[3]}` : eu[3];
    return `${year}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}`;
  }
  return raw.slice(0, 10);
}

function normalizeSide(raw: string): "BUY" | "SELL" | "LONG" | "SHORT" {
  const s = raw.toUpperCase().trim();
  if (s.includes("BUY") || s === "B" || s === "LONG" || s === "L") return "BUY";
  if (s.includes("SELL") || s === "S" || s === "SHORT") return "SELL";
  return "BUY";
}

function normalizeAssetType(raw: string): "stock" | "option" | "etf" | "other" {
  const s = raw.toLowerCase().trim();
  if (s.includes("option") || s.includes("call") || s.includes("put") || s === "opt") return "option";
  if (s.includes("etf") || s.includes("fund")) return "etf";
  if (s.includes("stock") || s.includes("equity") || s === "eq") return "stock";
  return "other";
}

function parseNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/[()]/g, (m) => m === "(" ? "-" : "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseCsvText(csvText: string) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row");

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { result.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const columnMap: Record<string, number> = {};
  for (const field of Object.keys(COLUMN_ALIASES)) {
    const idx = detectColumn(headers, field);
    if (idx !== -1) columnMap[field] = idx;
  }

  const mappedIndices = new Set(Object.values(columnMap));
  const unmappedColumns = headers.filter((_, i) => !mappedIndices.has(i));

  const rows = lines.slice(1).map(line => {
    const cells = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });

  const preview = rows.slice(0, 100).map(row => {
    const get = (field: string) => columnMap[field] !== undefined ? row[headers[columnMap[field]]] ?? "" : "";
    return {
      ticker: get("ticker").toUpperCase().replace(/[^A-Z0-9.]/g, ""),
      tradeDate: parseDate(get("tradeDate")),
      side: normalizeSide(get("side") || "BUY"),
      qty: parseNumber(get("qty")),
      entryPrice: parseNumber(get("entryPrice")),
      exitPrice: parseNumber(get("exitPrice")) ?? null,
      pnl: parseNumber(get("pnl")) ?? null,
      pnlPct: parseNumber(get("pnlPct")) ?? null,
      strategy: get("strategy").slice(0, 64),
      assetType: normalizeAssetType(get("assetType") || "stock"),
      notes: get("notes").slice(0, 512),
      _raw: row,
    };
  });

  return { headers, columnMap, rows, preview, unmappedColumns };
}

// ─── FIFO Round-Trip P&L Matching Engine ────────────────────────────────────

export interface RoundTrip {
  ticker: string;
  accountId: string | null;
  accountLabel: string | null;
  assetType: string;
  openDate: string;
  closeDate: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;         // realized P&L in dollars
  pnlPct: number;      // percentage return
  isWin: boolean;
}

/**
 * FIFO round-trip matching:
 * Groups all trades by (ticker, accountId), sorts by date ASC,
 * then pairs BUY lots with SELL lots in FIFO order.
 * Handles partial fills (e.g., buy 10, sell 5, sell 5 → 2 round trips).
 */
export function computeRoundTrips(trades: Array<{
  ticker: string;
  tradeDate: string;
  side: string;
  qty: string | number;
  entryPrice: string | number;
  accountId: string | null;
  accountLabel: string | null;
  assetType: string;
}>): RoundTrip[] {
  // Group by (ticker, accountId)
  const groups = new Map<string, typeof trades>();
  for (const t of trades) {
    const key = `${t.ticker}::${t.accountId ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const roundTrips: RoundTrip[] = [];

  for (const [, group] of Array.from(groups)) {
    // Sort chronologically
    const sorted = [...group].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    // FIFO queue of open lots: { date, price, qty }
    const openLots: Array<{ date: string; price: number; qty: number }> = [];

    for (const trade of sorted) {
      const side = trade.side.toUpperCase();
      const qty = Math.abs(parseFloat(String(trade.qty)));
      const price = parseFloat(String(trade.entryPrice));
      if (!qty || !price || isNaN(qty) || isNaN(price)) continue;

      if (side === "BUY" || side === "LONG") {
        openLots.push({ date: trade.tradeDate, price, qty });
      } else if (side === "SELL" || side === "SHORT") {
        // Match against open lots (FIFO)
        let remaining = qty;
        while (remaining > 0 && openLots.length > 0) {
          const lot = openLots[0];
          const matched = Math.min(remaining, lot.qty);
          const pnlPerShare = price - lot.price;
          const pnl = pnlPerShare * matched;
          const pnlPct = lot.price !== 0 ? (pnlPerShare / lot.price) * 100 : 0;

          roundTrips.push({
            ticker: trade.ticker,
            accountId: trade.accountId,
            accountLabel: trade.accountLabel,
            assetType: trade.assetType,
            openDate: lot.date,
            closeDate: trade.tradeDate,
            qty: matched,
            entryPrice: lot.price,
            exitPrice: price,
            pnl: Math.round(pnl * 100) / 100,
            pnlPct: Math.round(pnlPct * 100) / 100,
            isWin: pnl > 0,
          });

          lot.qty -= matched;
          remaining -= matched;
          if (lot.qty <= 0.0001) openLots.shift();
        }
        // If remaining > 0 after all lots, it's a short-sell open position — skip
      }
    }
  }

  return roundTrips;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const tradeUploadRouter = router({
  // List known accounts
  knownAccounts: publicProcedure.query(() => KNOWN_ACCOUNTS),

  // Parse CSV text — returns preview without saving
  parseCsv: protectedProcedure
    .input(z.object({
      csvText: z.string().max(5_000_000),
      filename: z.string().max(255).default("trades.csv"),
      accountId: z.string().max(32).optional(),
      accountLabel: z.string().max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = parseCsvText(input.csvText);
        return {
          success: true,
          headers: result.headers,
          columnMap: result.columnMap,
          preview: result.preview,
          totalRows: result.rows.length,
          unmappedColumns: result.unmappedColumns,
          detectedColumns: Object.keys(result.columnMap),
        };
      } catch (err: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to parse CSV",
        });
      }
    }),

  // Confirm upload — save all rows to DB
  confirmUpload: protectedProcedure
    .input(z.object({
      csvText: z.string().max(5_000_000),
      filename: z.string().max(255).default("trades.csv"),
      accountId: z.string().max(32).optional(),
      accountLabel: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { rows, columnMap, headers } = parseCsvText(input.csvText);

      const [batchResult] = await db.insert(tradeUploadBatches).values({
        userId: ctx.user.id,
        filename: input.filename,
        rowCount: rows.length,
        source: "csv",
        status: "processed",
        accountId: input.accountId ?? null,
        accountLabel: input.accountLabel ?? null,
      });
      const batchId = (batchResult as { insertId: number }).insertId;

      const get = (row: Record<string, string>, field: string) =>
        columnMap[field] !== undefined ? row[headers[columnMap[field]]] ?? "" : "";

      const tradeRows = rows
        .map(row => {
          const ticker = get(row, "ticker").toUpperCase().replace(/[^A-Z0-9.]/g, "");
          const entryPrice = parseNumber(get(row, "entryPrice"));
          const qty = parseNumber(get(row, "qty"));
          if (!ticker || !entryPrice || !qty) return null;

          const pnl = parseNumber(get(row, "pnl"));
          const pnlPct = parseNumber(get(row, "pnlPct"));
          const isWin = pnl !== null ? pnl > 0 : null;

          return {
            userId: ctx.user.id,
            batchId,
            ticker,
            tradeDate: parseDate(get(row, "tradeDate")) || new Date().toISOString().slice(0, 10),
            side: normalizeSide(get(row, "side") || "BUY") as "BUY" | "SELL" | "LONG" | "SHORT",
            qty: qty.toString(),
            entryPrice: entryPrice.toString(),
            exitPrice: parseNumber(get(row, "exitPrice"))?.toString() ?? null,
            pnl: pnl?.toString() ?? null,
            pnlPct: pnlPct?.toString() ?? null,
            strategy: get(row, "strategy").slice(0, 64) || null,
            assetType: normalizeAssetType(get(row, "assetType") || "stock") as "stock" | "option" | "etf" | "other",
            notes: get(row, "notes").slice(0, 512) || null,
            isWin,
            accountId: input.accountId ?? null,
            accountLabel: input.accountLabel ?? null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      for (let i = 0; i < tradeRows.length; i += 100) {
        const chunk = tradeRows.slice(i, i + 100);
        if (chunk.length > 0) {
          await db.insert(uploadedTrades).values(chunk);
        }
      }

      return { success: true, batchId, rowsInserted: tradeRows.length };
    }),

  // List current user's trades — filterable by accountId
  myTrades: protectedProcedure
    .input(z.object({
      batchId: z.number().optional(),
      ticker: z.string().optional(),
      accountId: z.string().optional(),
      limit: z.number().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { trades: [], summary: null };

      const conditions = [eq(uploadedTrades.userId, ctx.user.id)];
      if (input.batchId) conditions.push(eq(uploadedTrades.batchId, input.batchId));
      if (input.ticker) conditions.push(eq(uploadedTrades.ticker, input.ticker.toUpperCase()));
      if (input.accountId) conditions.push(eq(uploadedTrades.accountId, input.accountId));

      const trades = await db
        .select()
        .from(uploadedTrades)
        .where(and(...conditions))
        .orderBy(desc(uploadedTrades.tradeDate))
        .limit(input.limit);

      const withPnl = trades.filter(t => t.pnl !== null);
      const wins = withPnl.filter(t => t.isWin === true);
      const totalPnl = withPnl.reduce((s, t) => s + parseFloat(t.pnl as string), 0);
      const summary = {
        totalTrades: trades.length,
        tradesWithPnl: withPnl.length,
        wins: wins.length,
        losses: withPnl.filter(t => t.isWin === false).length,
        winRate: withPnl.length > 0 ? (wins.length / withPnl.length) * 100 : null,
        totalPnl,
        avgPnl: withPnl.length > 0 ? totalPnl / withPnl.length : null,
        bestTrade: withPnl.length > 0 ? Math.max(...withPnl.map(t => parseFloat(t.pnl as string))) : null,
        worstTrade: withPnl.length > 0 ? Math.min(...withPnl.map(t => parseFloat(t.pnl as string))) : null,
      };

      return { trades, summary };
    }),

  // List upload batches — filterable by accountId
  myBatches: protectedProcedure
    .input(z.object({ accountId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(tradeUploadBatches.userId, ctx.user.id)];
      if (input?.accountId) conditions.push(eq(tradeUploadBatches.accountId, input.accountId));
      return db
        .select()
        .from(tradeUploadBatches)
        .where(and(...conditions))
        .orderBy(desc(tradeUploadBatches.createdAt))
        .limit(50);
    }),

  // Delete a batch
  deleteBatch: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [batch] = await db
        .select({ id: tradeUploadBatches.id })
        .from(tradeUploadBatches)
        .where(and(eq(tradeUploadBatches.id, input.batchId), eq(tradeUploadBatches.userId, ctx.user.id)));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });

      await db.delete(uploadedTrades).where(and(
        eq(uploadedTrades.batchId, input.batchId),
        eq(uploadedTrades.userId, ctx.user.id),
      ));
      await db.delete(tradeUploadBatches).where(eq(tradeUploadBatches.id, input.batchId));
      return { success: true };
    }),

  // Community insights — anonymized aggregation across ALL users
  communityInsights: protectedProcedure
    .input(z.object({
      minTrades: z.number().min(1).default(3),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          ticker: uploadedTrades.ticker,
          totalTrades: sql<number>`COUNT(*)`,
          wins: sql<number>`SUM(CASE WHEN ${uploadedTrades.isWin} = 1 THEN 1 ELSE 0 END)`,
          tradesWithPnl: sql<number>`SUM(CASE WHEN ${uploadedTrades.pnl} IS NOT NULL THEN 1 ELSE 0 END)`,
          totalPnl: sql<number>`SUM(CAST(${uploadedTrades.pnl} AS DECIMAL(12,4)))`,
          avgPnlPct: sql<number>`AVG(CAST(${uploadedTrades.pnlPct} AS DECIMAL(8,4)))`,
          uniqueTraders: sql<number>`COUNT(DISTINCT ${uploadedTrades.userId})`,
        })
        .from(uploadedTrades)
        .groupBy(uploadedTrades.ticker)
        .having(sql`COUNT(*) >= ${input.minTrades}`)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(input.limit);

      return rows.map(r => ({
        ticker: r.ticker,
        totalTrades: Number(r.totalTrades),
        uniqueTraders: Number(r.uniqueTraders),
        winRate: r.tradesWithPnl > 0 ? (Number(r.wins) / Number(r.tradesWithPnl)) * 100 : null,
        totalPnl: r.totalPnl !== null ? Number(r.totalPnl) : null,
        avgPnlPct: r.avgPnlPct !== null ? Number(r.avgPnlPct) : null,
      }));
    }),

  /**
   * FIFO round-trip P&L analysis.
   * Matches BUY rows with SELL rows in chronological order per (ticker, account).
   * Returns matched round trips with realized P&L, plus a performance summary.
   */
  myRoundTrips: protectedProcedure
    .input(z.object({
      accountId: z.string().optional(),
      ticker: z.string().optional(),
      limit: z.number().min(1).max(2000).default(500),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { roundTrips: [], summary: null };

      const conditions = [eq(uploadedTrades.userId, ctx.user.id)];
      if (input.accountId) conditions.push(eq(uploadedTrades.accountId, input.accountId));
      if (input.ticker) conditions.push(eq(uploadedTrades.ticker, input.ticker.toUpperCase()));

      // Fetch all trades (no limit — we need all rows for FIFO matching)
      const trades = await db
        .select()
        .from(uploadedTrades)
        .where(and(...conditions))
        .orderBy(uploadedTrades.tradeDate);

      const roundTrips = computeRoundTrips(trades);

      // Sort by closeDate desc, limit for display
      const sorted = roundTrips
        .sort((a, b) => b.closeDate.localeCompare(a.closeDate))
        .slice(0, input.limit);

      // Summary stats
      const wins = roundTrips.filter(r => r.isWin);
      const losses = roundTrips.filter(r => !r.isWin);
      const totalPnl = roundTrips.reduce((s, r) => s + r.pnl, 0);
      const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r.pnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + r.pnl, 0) / losses.length : 0;
      const winRate = roundTrips.length > 0 ? (wins.length / roundTrips.length) * 100 : 0;
      const expectancy = roundTrips.length > 0 ? totalPnl / roundTrips.length : 0;
      const profitFactor = losses.length > 0 && Math.abs(avgLoss) > 0
        ? Math.abs(wins.reduce((s, r) => s + r.pnl, 0) / losses.reduce((s, r) => s + r.pnl, 0))
        : wins.length > 0 ? Infinity : 0;

      // Best/worst trades
      const bestTrade = roundTrips.length > 0 ? roundTrips.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
      const worstTrade = roundTrips.length > 0 ? roundTrips.reduce((a, b) => b.pnl < a.pnl ? b : a) : null;

      // Per-ticker breakdown
      const byTicker = new Map<string, { ticker: string; trades: number; wins: number; totalPnl: number }>();
      for (const rt of roundTrips) {
        const existing = byTicker.get(rt.ticker) ?? { ticker: rt.ticker, trades: 0, wins: 0, totalPnl: 0 };
        existing.trades++;
        if (rt.isWin) existing.wins++;
        existing.totalPnl += rt.pnl;
        byTicker.set(rt.ticker, existing);
      }
      const tickerBreakdown = Array.from(byTicker.values())
        .map(t => ({ ...t, winRate: t.trades > 0 ? (t.wins / t.trades) * 100 : 0, totalPnl: Math.round(t.totalPnl * 100) / 100 }))
        .sort((a, b) => b.totalPnl - a.totalPnl)
        .slice(0, 20);

      return {
        roundTrips: sorted,
        summary: {
          totalRoundTrips: roundTrips.length,
          wins: wins.length,
          losses: losses.length,
          winRate: Math.round(winRate * 10) / 10,
          totalPnl: Math.round(totalPnl * 100) / 100,
          avgWin: Math.round(avgWin * 100) / 100,
          avgLoss: Math.round(avgLoss * 100) / 100,
          expectancy: Math.round(expectancy * 100) / 100,
          profitFactor: isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : null,
          bestTrade: bestTrade ? { ticker: bestTrade.ticker, pnl: bestTrade.pnl, date: bestTrade.closeDate } : null,
          worstTrade: worstTrade ? { ticker: worstTrade.ticker, pnl: worstTrade.pnl, date: worstTrade.closeDate } : null,
          tickerBreakdown,
        },
      };
    }),
});
