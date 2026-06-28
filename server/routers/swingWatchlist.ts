import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { swingWatchlist, sessionSettings } from "../../drizzle/schema";
import { eq, and, desc, ne } from "drizzle-orm";

const getSettings = async (userId: number) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [s] = await db
    .select()
    .from(sessionSettings)
    .where(eq(sessionSettings.userId, userId));
  return s ?? null;
};

export const swingWatchlistRouter = router({
  // ── Add a new swing setup ─────────────────────────────────────────────────────
  addSetup: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(20).toUpperCase(),
        setupType: z.enum(["POST_EARNINGS", "CATALYST_BREAKOUT", "VCP", "GAP_FILL"]),
        direction: z.enum(["LONG", "SHORT"]).default("LONG"),
        entryPrice: z.number().positive(),
        stopPrice: z.number().positive(),
        targetPrice: z.number().positive(),
        accountId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get account size for position sizing
      const settings = await getSettings(ctx.user.id);
      const accountSize = parseFloat(String(settings?.accountSize ?? "350000"));
      const swingRiskPct = parseFloat(String(settings?.swingRiskPerTradePct ?? "1.5"));
      const maxRiskAmount = (accountSize * swingRiskPct) / 100;

      const riskPerShare = Math.abs(input.entryPrice - input.stopPrice);
      const rewardPerShare = Math.abs(input.targetPrice - input.entryPrice);
      const shares = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 1;
      const riskAmount = riskPerShare * shares;
      const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;

      const [result] = await db.insert(swingWatchlist).values({
        userId: ctx.user.id,
        ticker: input.ticker,
        setupType: input.setupType,
        direction: input.direction,
        entryPrice: String(input.entryPrice),
        stopPrice: String(input.stopPrice),
        targetPrice: String(input.targetPrice),
        shares,
        riskAmount: String(riskAmount.toFixed(2)),
        rrRatio: String(rrRatio.toFixed(2)),
        accountId: input.accountId ?? null,
        notes: input.notes ?? null,
        status: "WATCHING",
        dayCount: 0,
      });
      return { id: (result as any).insertId as number };
    }),

  // ── Activate a setup (mark as entered) ───────────────────────────────────────
  activateSetup: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        entryDate: z.string().length(10),
        entryPrice: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .update(swingWatchlist)
        .set({
          status: "ACTIVE",
          entryDate: input.entryDate,
          dayCount: 1,
          ...(input.entryPrice ? { entryPrice: String(input.entryPrice) } : {}),
        })
        .where(
          and(eq(swingWatchlist.id, input.id), eq(swingWatchlist.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  // ── Close a setup ─────────────────────────────────────────────────────────────
  closeSetup: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        exitPrice: z.number().positive(),
        exitDate: z.string().length(10),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [entry] = await db
        .select()
        .from(swingWatchlist)
        .where(
          and(eq(swingWatchlist.id, input.id), eq(swingWatchlist.userId, ctx.user.id))
        );
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });

      const entryPrice = parseFloat(String(entry.entryPrice));
      const pnl =
        entry.direction === "LONG"
          ? (input.exitPrice - entryPrice) * entry.shares
          : (entryPrice - input.exitPrice) * entry.shares;

      let status: "WIN" | "LOSS" | "SCRATCH" | "EXPIRED" = "SCRATCH";
      if (pnl > 10) status = "WIN";
      else if (pnl < -10) status = "LOSS";

      await db
        .update(swingWatchlist)
        .set({
          exitPrice: String(input.exitPrice),
          exitDate: input.exitDate,
          pnl: String(pnl.toFixed(2)),
          status,
          notes: input.notes ?? entry.notes,
        })
        .where(eq(swingWatchlist.id, input.id));
      return { ok: true, pnl };
    }),

  // ── Expire a setup (time stop — Day 3 passed, no move) ───────────────────────
  expireSetup: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .update(swingWatchlist)
        .set({ status: "EXPIRED" })
        .where(
          and(eq(swingWatchlist.id, input.id), eq(swingWatchlist.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  // ── Get active + watching setups ──────────────────────────────────────────────
  getWatchlist: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db
      .select()
      .from(swingWatchlist)
      .where(
        and(
          eq(swingWatchlist.userId, ctx.user.id),
          // Only active/watching — not closed
          ne(swingWatchlist.status, "WIN"),
        )
      )
      .orderBy(desc(swingWatchlist.createdAt));
  }),

  // ── Get closed history ────────────────────────────────────────────────────────
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db
      .select()
      .from(swingWatchlist)
      .where(eq(swingWatchlist.userId, ctx.user.id))
      .orderBy(desc(swingWatchlist.createdAt))
      .limit(200);
  }),

  // ── Stats per setup type ──────────────────────────────────────────────────────
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const all = await db
      .select()
      .from(swingWatchlist)
      .where(eq(swingWatchlist.userId, ctx.user.id));

    const closed = all.filter((e) =>
      ["WIN", "LOSS", "SCRATCH", "EXPIRED"].includes(e.status)
    );

    const byType: Record<string, { wins: number; losses: number; totalPnl: number; count: number }> = {};
    for (const e of closed) {
      if (!byType[e.setupType]) byType[e.setupType] = { wins: 0, losses: 0, totalPnl: 0, count: 0 };
      byType[e.setupType].count++;
      byType[e.setupType].totalPnl += parseFloat(String(e.pnl ?? "0"));
      if (e.status === "WIN") byType[e.setupType].wins++;
      else if (e.status === "LOSS") byType[e.setupType].losses++;
    }

    return {
      totalSetups: all.length,
      activeCount: all.filter((e) => e.status === "ACTIVE").length,
      watchingCount: all.filter((e) => e.status === "WATCHING").length,
      closedCount: closed.length,
      totalPnl: closed.reduce((s, e) => s + parseFloat(String(e.pnl ?? "0")), 0),
      byType,
    };
  }),
});
