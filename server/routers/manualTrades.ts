/**
 * manualTrades.ts — tRPC router for the manual trade journal.
 * Supports create, list, update (close/edit), and delete.
 * Completely independent of the agent proposal system.
 */
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { manualTrades } from "../../drizzle/schema";

const STRATEGY_TYPES = [
  "stock_long", "stock_short",
  "call_long", "put_long",
  "call_spread", "put_spread",
  "iron_condor", "calendar_spread",
  "straddle", "strangle",
  "covered_call", "cash_secured_put",
  "velez_25", "velez_50",
  "other",
] as const;

const ACCOUNTS = ["schwab_764", "etrade_2738", "etrade_4723", "other"] as const;
const SOURCES = ["velez_scanner", "pcr_signal", "earnings", "iron_condor", "manual", "other"] as const;

export const manualTradesRouter = router({
  // ── List trades ─────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "closed", "cancelled", "all"]).default("all"),
      account: z.enum([...ACCOUNTS, "all"]).default("all"),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(manualTrades.userId, ctx.user.id)];
      if (input.status !== "all") conditions.push(eq(manualTrades.status, input.status));
      if (input.account !== "all") conditions.push(eq(manualTrades.account, input.account));
      return db
        .select()
        .from(manualTrades)
        .where(and(...conditions))
        .orderBy(desc(manualTrades.entryDate), desc(manualTrades.createdAt))
        .limit(input.limit);
    }),

  // ── Performance stats ────────────────────────────────────────────────────────
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(manualTrades)
      .where(eq(manualTrades.userId, ctx.user.id));

    const closed = rows.filter(r => r.status === "closed" && r.realizedPnl !== null);
    const open = rows.filter(r => r.status === "open");
    const totalPnl = closed.reduce((s, r) => s + parseFloat(r.realizedPnl ?? "0"), 0);
    const wins = closed.filter(r => parseFloat(r.realizedPnl ?? "0") > 0);
    const losses = closed.filter(r => parseFloat(r.realizedPnl ?? "0") < 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + parseFloat(r.realizedPnl ?? "0"), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + parseFloat(r.realizedPnl ?? "0"), 0) / losses.length : 0;
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const expectancy = closed.length > 0 ? totalPnl / closed.length : 0;

    return {
      totalTrades: rows.length,
      openTrades: open.length,
      closedTrades: closed.length,
      totalPnl,
      winRate,
      wins: wins.length,
      losses: losses.length,
      avgWin,
      avgLoss,
      expectancy,
      profitFactor: Math.abs(avgLoss) > 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0,
    };
  }),

  // ── Create trade ─────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(20).toUpperCase(),
      strategyType: z.enum(STRATEGY_TYPES),
      account: z.enum(ACCOUNTS),
      entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      entryTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), // HH:MM in ET
      entryPrice: z.number().positive(),
      quantity: z.number().int().positive().default(1),
      targetPrice: z.number().positive().optional(),
      stopPrice: z.number().positive().optional(),
      maxLoss: z.number().optional(),
      maxProfit: z.number().optional(),
      expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      source: z.enum(SOURCES).default("manual"),
      notes: z.string().max(512).optional(),
      tags: z.string().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(manualTrades).values({
        userId: ctx.user.id,
        ticker: input.ticker,
        strategyType: input.strategyType,
        account: input.account,
        entryDate: input.entryDate,
        entryTime: input.entryTime ?? null,
        entryPrice: input.entryPrice.toFixed(4),
        quantity: input.quantity,
        targetPrice: input.targetPrice?.toFixed(4) ?? null,
        stopPrice: input.stopPrice?.toFixed(4) ?? null,
        maxLoss: input.maxLoss?.toFixed(4) ?? null,
        maxProfit: input.maxProfit?.toFixed(4) ?? null,
        expiryDate: input.expiryDate ?? null,
        source: input.source,
        notes: input.notes ?? null,
        tags: input.tags ?? null,
        status: "open",
      });
      return { id: (result as any).insertId as number };
    }),

  // ── Close trade ──────────────────────────────────────────────────────────────
  close: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      exitPrice: z.number(),
      notes: z.string().max(512).optional(),
      postTradeNotes: z.string().max(1024).optional(),
      lessonsLearned: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(manualTrades)
        .where(and(eq(manualTrades.id, input.id), eq(manualTrades.userId, ctx.user.id)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const trade = rows[0];
      const entryPrice = parseFloat(trade.entryPrice ?? "0");
      const qty = trade.quantity;
      const realizedPnl = (input.exitPrice - entryPrice) * qty * 100; // *100 for options contracts
      const realizedPnlPct = entryPrice !== 0 ? ((input.exitPrice - entryPrice) / Math.abs(entryPrice)) * 100 : 0;
      await db.update(manualTrades)
        .set({
          exitDate: input.exitDate,
          exitPrice: input.exitPrice.toFixed(4),
          realizedPnl: realizedPnl.toFixed(4),
          realizedPnlPct: realizedPnlPct.toFixed(4),
          status: "closed",
          notes: input.notes ?? trade.notes,
          postTradeNotes: input.postTradeNotes ?? null,
          lessonsLearned: input.lessonsLearned ?? null,
        })
        .where(eq(manualTrades.id, input.id));
      return { realizedPnl, realizedPnlPct };
    }),

  // ── Update post-trade journal notes ──────────────────────────────────────────────────────────────────────────
  updateNotes: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      postTradeNotes: z.string().max(1024).optional(),
      lessonsLearned: z.string().max(512).optional(),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(manualTrades)
        .set({
          ...(input.postTradeNotes !== undefined ? { postTradeNotes: input.postTradeNotes } : {}),
          ...(input.lessonsLearned !== undefined ? { lessonsLearned: input.lessonsLearned } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where(and(eq(manualTrades.id, input.id), eq(manualTrades.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── Time-of-day analytics ─────────────────────────────────────────────────────
  timeOfDay: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(manualTrades)
      .where(and(eq(manualTrades.userId, ctx.user.id), eq(manualTrades.status, "closed")));

    // Build hourly buckets 09:00–16:00 ET
    const HOURS = [
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
      "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
      "15:00", "15:30",
    ];
    const buckets: Record<string, { trades: number; wins: number; totalPnl: number }> = {};
    for (const h of HOURS) buckets[h] = { trades: 0, wins: 0, totalPnl: 0 };

    for (const r of rows) {
      if (!r.entryTime) continue;
      // Round down to nearest 30-min bucket
      const [hh, mm] = r.entryTime.split(":").map(Number);
      const bucket = mm < 30 ? `${String(hh).padStart(2, "0")}:00` : `${String(hh).padStart(2, "0")}:30`;
      if (!buckets[bucket]) continue;
      const pnl = parseFloat(r.realizedPnl ?? "0");
      buckets[bucket].trades++;
      buckets[bucket].totalPnl += pnl;
      if (pnl > 0) buckets[bucket].wins++;
    }

    return HOURS.map(h => ({
      hour: h,
      label: (() => {
        const [hh, mm] = h.split(":").map(Number);
        const period = hh < 12 ? "AM" : "PM";
        const displayH = hh > 12 ? hh - 12 : hh;
        return `${displayH}:${String(mm).padStart(2, "0")} ${period}`;
      })(),
      trades: buckets[h].trades,
      wins: buckets[h].wins,
      losses: buckets[h].trades - buckets[h].wins,
      winRate: buckets[h].trades > 0 ? (buckets[h].wins / buckets[h].trades) * 100 : null,
      totalPnl: buckets[h].totalPnl,
      avgPnl: buckets[h].trades > 0 ? buckets[h].totalPnl / buckets[h].trades : null,
      isNyOpenWindow: h >= "09:30" && h <= "10:00",
    }));
  }),

  // ── Delete trade ─────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(manualTrades)
        .where(and(eq(manualTrades.id, input.id), eq(manualTrades.userId, ctx.user.id)));
      return { success: true };
    }),
});
