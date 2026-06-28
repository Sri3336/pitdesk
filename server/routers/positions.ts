/**
 * Positions Router — current holdings per brokerage account
 *
 * Procedures:
 *   positions.parseCsv       — parse positions CSV, return preview
 *   positions.confirmUpload  — save rows to positions table (replaces prior batch for same account)
 *   positions.myPositions    — list positions with portfolio summary (all accounts or filtered)
 *   positions.myBatches      — list position upload batches
 *   positions.deleteBatch    — delete a batch and all its positions
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { positions, positionBatches } from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Column aliases for positions CSV ─────────────────────────────────────────

const POS_ALIASES: Record<string, string[]> = {
  ticker:           ["ticker", "symbol", "stock", "instrument", "security"],
  qty:              ["qty", "quantity", "shares", "contracts", "units", "position"],
  avgCost:          ["avgcost", "avg_cost", "averagecost", "average_cost", "costbasis", "cost_basis", "avgprice", "avg_price", "purchaseprice", "purchase_price"],
  currentPrice:     ["currentprice", "current_price", "lastprice", "last_price", "price", "marketprice", "market_price", "close", "closeprice"],
  marketValue:      ["marketvalue", "market_value", "value", "totalvalue", "total_value", "currentvalue", "current_value"],
  unrealizedPnl:    ["unrealizedpnl", "unrealized_pnl", "unrealizedgain", "unrealized_gain", "gainloss", "gain_loss", "pnl", "p&l", "openpl", "open_pl"],
  unrealizedPnlPct: ["unrealizedpnlpct", "unrealized_pnl_pct", "unrealized%", "gainpct", "gain_pct", "pnl%", "return%", "returnpct", "return_pct"],
  assetType:        ["assettype", "asset_type", "type", "instrumenttype", "instrument_type", "securitytype"],
  notes:            ["notes", "description", "comment"],
};

function detectCol(headers: string[], field: string): number {
  const aliases = POS_ALIASES[field] ?? [field];
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s_\-().]/g, "") === alias.replace(/[\s_\-().]/g, ""));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNum(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/[()]/g, m => m === "(" ? "-" : "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeAssetType(raw: string): "stock" | "option" | "etf" | "other" {
  const s = raw.toLowerCase().trim();
  if (s.includes("option") || s.includes("call") || s.includes("put") || s === "opt") return "option";
  if (s.includes("etf") || s.includes("fund")) return "etf";
  if (s.includes("stock") || s.includes("equity") || s === "eq") return "stock";
  return "other";
}

function parseRow(line: string): string[] {
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
}

function parsePositionsCsv(csvText: string) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row");

  const headers = parseRow(lines[0]);
  const colMap: Record<string, number> = {};
  for (const field of Object.keys(POS_ALIASES)) {
    const idx = detectCol(headers, field);
    if (idx !== -1) colMap[field] = idx;
  }

  const mappedIndices = new Set(Object.values(colMap));
  const unmappedColumns = headers.filter((_, i) => !mappedIndices.has(i));

  const rows = lines.slice(1).map(line => {
    const cells = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });

  const get = (row: Record<string, string>, field: string) =>
    colMap[field] !== undefined ? row[headers[colMap[field]]] ?? "" : "";

  const preview = rows.slice(0, 100).map(row => ({
    ticker: get(row, "ticker").toUpperCase().replace(/[^A-Z0-9.]/g, ""),
    qty: parseNum(get(row, "qty")),
    avgCost: parseNum(get(row, "avgCost")),
    currentPrice: parseNum(get(row, "currentPrice")),
    marketValue: parseNum(get(row, "marketValue")),
    unrealizedPnl: parseNum(get(row, "unrealizedPnl")),
    unrealizedPnlPct: parseNum(get(row, "unrealizedPnlPct")),
    assetType: normalizeAssetType(get(row, "assetType") || "stock"),
    notes: get(row, "notes").slice(0, 512),
  }));

  return { headers, colMap, rows, preview, unmappedColumns, detectedColumns: Object.keys(colMap) };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const positionsRouter = router({
  // Parse positions CSV — preview only, no save
  parseCsv: protectedProcedure
    .input(z.object({
      csvText: z.string().max(2_000_000),
      filename: z.string().max(255).default("positions.csv"),
      accountId: z.string().max(32),
      accountLabel: z.string().max(64),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = parsePositionsCsv(input.csvText);
        return {
          success: true,
          headers: result.headers,
          preview: result.preview,
          totalRows: result.rows.length,
          unmappedColumns: result.unmappedColumns,
          detectedColumns: result.detectedColumns,
        };
      } catch (err: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to parse positions CSV",
        });
      }
    }),

  // Confirm upload — replaces prior batch for the same account (delete old, insert new)
  confirmUpload: protectedProcedure
    .input(z.object({
      csvText: z.string().max(2_000_000),
      filename: z.string().max(255).default("positions.csv"),
      accountId: z.string().max(32),
      accountLabel: z.string().max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { rows, colMap, headers } = parsePositionsCsv(input.csvText);

      // Delete prior batches for this account (keep only latest)
      const priorBatches = await db
        .select({ id: positionBatches.id })
        .from(positionBatches)
        .where(and(
          eq(positionBatches.userId, ctx.user.id),
          eq(positionBatches.accountId, input.accountId),
        ));
      for (const b of priorBatches) {
        await db.delete(positions).where(eq(positions.batchId, b.id));
        await db.delete(positionBatches).where(eq(positionBatches.id, b.id));
      }

      // Create new batch
      const [batchResult] = await db.insert(positionBatches).values({
        userId: ctx.user.id,
        filename: input.filename,
        rowCount: rows.length,
        accountId: input.accountId,
        accountLabel: input.accountLabel,
      });
      const batchId = (batchResult as { insertId: number }).insertId;

      const get = (row: Record<string, string>, field: string) =>
        colMap[field] !== undefined ? row[headers[colMap[field]]] ?? "" : "";

      const posRows = rows
        .map(row => {
          const ticker = get(row, "ticker").toUpperCase().replace(/[^A-Z0-9.]/g, "");
          const qty = parseNum(get(row, "qty"));
          if (!ticker || !qty) return null;

          // Derive marketValue if not present
          const avgCost = parseNum(get(row, "avgCost"));
          const currentPrice = parseNum(get(row, "currentPrice"));
          let marketValue = parseNum(get(row, "marketValue"));
          if (marketValue == null && currentPrice != null && qty != null) {
            marketValue = currentPrice * qty;
          }

          // Derive unrealizedPnl if not present
          let unrealizedPnl = parseNum(get(row, "unrealizedPnl"));
          if (unrealizedPnl == null && avgCost != null && currentPrice != null && qty != null) {
            unrealizedPnl = (currentPrice - avgCost) * qty;
          }

          // Derive unrealizedPnlPct if not present
          let unrealizedPnlPct = parseNum(get(row, "unrealizedPnlPct"));
          if (unrealizedPnlPct == null && avgCost != null && currentPrice != null && avgCost !== 0) {
            unrealizedPnlPct = ((currentPrice - avgCost) / avgCost) * 100;
          }

          return {
            userId: ctx.user.id,
            batchId,
            accountId: input.accountId,
            accountLabel: input.accountLabel,
            ticker,
            qty: qty.toString(),
            avgCost: avgCost?.toString() ?? null,
            currentPrice: currentPrice?.toString() ?? null,
            marketValue: marketValue?.toString() ?? null,
            unrealizedPnl: unrealizedPnl?.toString() ?? null,
            unrealizedPnlPct: unrealizedPnlPct?.toString() ?? null,
            assetType: normalizeAssetType(get(row, "assetType") || "stock") as "stock" | "option" | "etf" | "other",
            notes: get(row, "notes").slice(0, 512) || null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      for (let i = 0; i < posRows.length; i += 100) {
        const chunk = posRows.slice(i, i + 100);
        if (chunk.length > 0) await db.insert(positions).values(chunk);
      }

      return { success: true, batchId, rowsInserted: posRows.length };
    }),

  // List current user's positions — optionally filtered by accountId
  myPositions: protectedProcedure
    .input(z.object({ accountId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { positions: [], portfolioSummary: null, byAccount: [] };

      const conditions = [eq(positions.userId, ctx.user.id)];
      if (input?.accountId) conditions.push(eq(positions.accountId, input.accountId));

      const rows = await db
        .select()
        .from(positions)
        .where(and(...conditions))
        .orderBy(positions.accountId, positions.ticker);

      // Portfolio summary
      const withValue = rows.filter(p => p.marketValue != null);
      const totalMarketValue = withValue.reduce((s, p) => s + parseFloat(p.marketValue as string), 0);
      const withPnl = rows.filter(p => p.unrealizedPnl != null);
      const totalUnrealizedPnl = withPnl.reduce((s, p) => s + parseFloat(p.unrealizedPnl as string), 0);

      // Per-account breakdown
      const accountMap: Record<string, { accountLabel: string; marketValue: number; unrealizedPnl: number; positionCount: number }> = {};
      for (const p of rows) {
        if (!accountMap[p.accountId]) {
          accountMap[p.accountId] = { accountLabel: p.accountLabel, marketValue: 0, unrealizedPnl: 0, positionCount: 0 };
        }
        accountMap[p.accountId].positionCount++;
        if (p.marketValue != null) accountMap[p.accountId].marketValue += parseFloat(p.marketValue as string);
        if (p.unrealizedPnl != null) accountMap[p.accountId].unrealizedPnl += parseFloat(p.unrealizedPnl as string);
      }

      const byAccount = Object.entries(accountMap).map(([accountId, data]) => ({
        accountId,
        ...data,
      }));

      return {
        positions: rows,
        portfolioSummary: {
          totalPositions: rows.length,
          totalMarketValue,
          totalUnrealizedPnl,
          totalUnrealizedPnlPct: totalMarketValue > 0
            ? (totalUnrealizedPnl / (totalMarketValue - totalUnrealizedPnl)) * 100
            : null,
        },
        byAccount,
      };
    }),

  // List position upload batches
  myBatches: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(positionBatches)
      .where(eq(positionBatches.userId, ctx.user.id))
      .orderBy(desc(positionBatches.uploadedAt))
      .limit(20);
  }),

  // Delete a batch
  deleteBatch: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [batch] = await db
        .select({ id: positionBatches.id })
        .from(positionBatches)
        .where(and(eq(positionBatches.id, input.batchId), eq(positionBatches.userId, ctx.user.id)));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });

      await db.delete(positions).where(and(
        eq(positions.batchId, input.batchId),
        eq(positions.userId, ctx.user.id),
      ));
      await db.delete(positionBatches).where(eq(positionBatches.id, input.batchId));
      return { success: true };
    }),
});
