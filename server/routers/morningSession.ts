import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { morningSessionTrades, sessionSettings } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import type { MorningSessionTrade } from "../../drizzle/schema";

// ─── Session Settings ─────────────────────────────────────────────────────────

const getOrCreateSettings = async (userId: number) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [existing] = await db
    .select()
    .from(sessionSettings)
    .where(eq(sessionSettings.userId, userId));
  if (existing) return existing;
  await db.insert(sessionSettings).values({ userId });
  const [created] = await db
    .select()
    .from(sessionSettings)
    .where(eq(sessionSettings.userId, userId));
  return created!;
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const morningSessionRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    return getOrCreateSettings(ctx.user.id);
  }),

  saveSettings: protectedProcedure
    .input(
      z.object({
        accountSize: z.number().positive(),
        maxRiskPerTradePct: z.number().min(0.1).max(5),
        dailyLossLimitPct: z.number().min(0.5).max(10),
        maxTradesPerDay: z.number().int().min(1).max(10),
        swingRiskPerTradePct: z.number().min(0.1).max(5),
        maxConcurrentSwings: z.number().int().min(1).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOrCreateSettings(ctx.user.id);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db
        .update(sessionSettings)
        .set({
          accountSize: String(input.accountSize),
          maxRiskPerTradePct: String(input.maxRiskPerTradePct),
          dailyLossLimitPct: String(input.dailyLossLimitPct),
          maxTradesPerDay: input.maxTradesPerDay,
          swingRiskPerTradePct: String(input.swingRiskPerTradePct),
          maxConcurrentSwings: input.maxConcurrentSwings,
        })
        .where(eq(sessionSettings.id, existing.id));
      return { ok: true };
    }),

  // ── Add a new morning trade ──────────────────────────────────────────────────
  addTrade: protectedProcedure
    .input(
      z.object({
        date: z.string().length(10), // YYYY-MM-DD
        ticker: z.string().min(1).max(20).toUpperCase(),
        setupType: z.enum(["ORB", "GAP_GO", "VWAP_RECLAIM"]),
        direction: z.enum(["LONG", "SHORT"]),
        entryPrice: z.number().positive(),
        stopPrice: z.number().positive(),
        targetPrice: z.number().positive(),
        shares: z.number().int().positive(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const riskPerShare = Math.abs(input.entryPrice - input.stopPrice);
      const rewardPerShare = Math.abs(input.targetPrice - input.entryPrice);
      const riskAmount = riskPerShare * input.shares;
      const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(morningSessionTrades).values({
        userId: ctx.user.id,
        date: input.date,
        ticker: input.ticker,
        setupType: input.setupType,
        direction: input.direction,
        entryPrice: String(input.entryPrice),
        stopPrice: String(input.stopPrice),
        targetPrice: String(input.targetPrice),
        shares: input.shares,
        riskAmount: String(riskAmount.toFixed(2)),
        rrRatio: String(rrRatio.toFixed(2)),
        notes: input.notes ?? null,
        status: "ACTIVE",
      });
      return { id: (result as any).insertId as number };
    }),

  // ── Close a trade ────────────────────────────────────────────────────────────
  closeTrade: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        exitPrice: z.number().positive(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [trade] = await db
        .select()
        .from(morningSessionTrades)
        .where(
          and(
            eq(morningSessionTrades.id, input.id),
            eq(morningSessionTrades.userId, ctx.user.id)
          )
        );
      if (!trade) throw new Error("Trade not found");

      const entryPrice = parseFloat(String(trade.entryPrice));
      const pnl =
        trade.direction === "LONG"
          ? (input.exitPrice - entryPrice) * trade.shares
          : (entryPrice - input.exitPrice) * trade.shares;

      let status: "WIN" | "LOSS" | "SCRATCH" = "SCRATCH";
      if (pnl > 5) status = "WIN";
      else if (pnl < -5) status = "LOSS";

      await db
        .update(morningSessionTrades)
        .set({
          exitPrice: String(input.exitPrice),
          pnl: String(pnl.toFixed(2)),
          status,
          exitedAt: new Date(),
          notes: input.notes ?? trade.notes,
        })
        .where(eq(morningSessionTrades.id, input.id));
      return { ok: true, pnl };
    }),

  // ── Get today's session summary ───────────────────────────────────────────────
  sessionSummary: protectedProcedure
    .input(z.object({ date: z.string().length(10) }))
    .query(async ({ ctx, input }) => {
      const settings = await getOrCreateSettings(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const trades = await db
        .select()
        .from(morningSessionTrades)
        .where(
          and(
            eq(morningSessionTrades.userId, ctx.user.id),
            eq(morningSessionTrades.date, input.date)
          )
        )
        .orderBy(desc(morningSessionTrades.enteredAt));

      const accountSize = parseFloat(String(settings.accountSize));
      const maxRiskPct = parseFloat(String(settings.maxRiskPerTradePct));
      const dailyLossLimitPct = parseFloat(String(settings.dailyLossLimitPct));
      const maxTrades = settings.maxTradesPerDay;

      type Trade = typeof trades[number];
      const closedTrades = trades.filter((t: Trade) => t.status !== "ACTIVE");
      const activeTrades = trades.filter((t: Trade) => t.status === "ACTIVE");
      const sessionPnl = closedTrades.reduce(
        (sum: number, t: Trade) => sum + parseFloat(String(t.pnl ?? "0")),
        0
      );
      const totalRiskUsed = trades.reduce(
        (sum: number, t: Trade) => sum + parseFloat(String(t.riskAmount)),
        0
      );
      const dailyLossLimit = (accountSize * dailyLossLimitPct) / 100;
      const maxRiskPerTrade = (accountSize * maxRiskPct) / 100;
      const wins = closedTrades.filter((t: MorningSessionTrade) => t.status === "WIN").length;
      const losses = closedTrades.filter((t: MorningSessionTrade) => t.status === "LOSS").length;

      return {
        trades,
        activeTrades,
        closedTrades,
        sessionPnl,
        totalRiskUsed,
        tradesCount: trades.length,
        wins,
        losses,
        settings: {
          accountSize,
          maxRiskPerTrade,
          dailyLossLimit,
          maxTrades,
        },
        isLimitHit: sessionPnl <= -dailyLossLimit,
        isMaxTradesHit: trades.length >= maxTrades,
      };
    }),

  // ── Get history (last 30 days) ────────────────────────────────────────────────
  history: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db
      .select()
      .from(morningSessionTrades)
      .where(eq(morningSessionTrades.userId, ctx.user.id))
      .orderBy(desc(morningSessionTrades.enteredAt))
      .limit(200);
  }),
});
