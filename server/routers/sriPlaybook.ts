import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { traderLessons, tradeGateChecks } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { callDataApi } from "../_core/dataApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

async function fetchQQQRegime(): Promise<{
  regime: "bullish" | "bearish" | "neutral";
  ma10: number | null;
  ma20: number | null;
  note: string;
}> {
  try {
    const resp: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: "QQQ", region: "US", interval: "1d", range: "3mo" },
    });
    const closes: number[] = resp?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c: number) => c != null && !isNaN(c));
    const ma10 = calcSMA(validCloses, 10);
    const ma20 = calcSMA(validCloses, 20);
    if (ma10 === null || ma20 === null) {
      return { regime: "neutral", ma10, ma20, note: "Insufficient data" };
    }
    const regime = ma10 > ma20 ? "bullish" : ma10 < ma20 * 0.995 ? "bearish" : "neutral";
    const note =
      regime === "bullish"
        ? `QQQ 10-day MA ($${ma10.toFixed(2)}) above 20-day MA ($${ma20.toFixed(2)}) — green light for premium selling`
        : regime === "bearish"
        ? `QQQ 10-day MA ($${ma10.toFixed(2)}) below 20-day MA ($${ma20.toFixed(2)}) — avoid naked puts, use spreads`
        : `QQQ 10-day MA ($${ma10.toFixed(2)}) near 20-day MA ($${ma20.toFixed(2)}) — caution, regime transitioning`;
    return { regime, ma10, ma20, note };
  } catch {
    return { regime: "neutral", ma10: null, ma20: null, note: "QQQ data unavailable" };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const sriPlaybookRouter = router({
  // ── QQQ Regime ──────────────────────────────────────────────────────────────
  getQQQRegime: protectedProcedure.query(async () => {
    return fetchQQQRegime();
  }),

  // ── Trader Lessons ──────────────────────────────────────────────────────────
  getLessons: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(traderLessons)
      .where(eq(traderLessons.userId, ctx.user.id))
      .orderBy(desc(traderLessons.createdAt));
  }),

  addLesson: protectedProcedure
    .input(
      z.object({
        traderName: z.string().min(1).max(100),
        sourceUrl: z.string().max(500).optional(),
        sourceType: z.enum(["youtube", "article", "book", "podcast", "other"]).default("youtube"),
        title: z.string().min(1).max(200),
        keyInsight: z.string().min(1),
        adoptDecision: z.enum(["adopt", "partial", "skip", "studying"]).default("studying"),
        adoptReason: z.string().optional(),
        applicableStrategies: z.string().optional(),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(traderLessons).values({
        userId: ctx.user.id,
        traderName: input.traderName,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType,
        title: input.title,
        keyInsight: input.keyInsight,
        adoptDecision: input.adoptDecision,
        adoptReason: input.adoptReason,
        applicableStrategies: input.applicableStrategies,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true, id: (result as any).insertId };
    }),

  updateLesson: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        adoptDecision: z.enum(["adopt", "partial", "skip", "studying"]).optional(),
        adoptReason: z.string().optional(),
        keyInsight: z.string().optional(),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(traderLessons)
        .set({ ...updates, updatedAt: Date.now() })
        .where(and(eq(traderLessons.id, id), eq(traderLessons.userId, ctx.user.id)));
      return { ok: true };
    }),

  deleteLesson: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .delete(traderLessons)
        .where(and(eq(traderLessons.id, input.id), eq(traderLessons.userId, ctx.user.id)));
      return { ok: true };
    }),

  // ── Trade Gate Checks ────────────────────────────────────────────────────────
  getGateChecks: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(tradeGateChecks)
      .where(eq(tradeGateChecks.userId, ctx.user.id))
      .orderBy(desc(tradeGateChecks.createdAt))
      .limit(50);
  }),

  saveGateCheck: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(20),
        strategy: z.string().min(1).max(50),
        checkDate: z.string(),
        ivGatePass: z.boolean(),
        ivRank: z.number().optional(),
        regimeGatePass: z.boolean(),
        qqqRegimeNote: z.string().optional(),
        rangeGatePass: z.boolean(),
        rangeNote: z.string().optional(),
        catalystGatePass: z.boolean(),
        catalystNote: z.string().optional(),
        decision: z.enum(["entered", "skipped", "watching", "pending"]).default("pending"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const gatesPassed = [
        input.ivGatePass,
        input.regimeGatePass,
        input.rangeGatePass,
        input.catalystGatePass,
      ].filter(Boolean).length;

      const overallGrade =
        gatesPassed === 4 ? "A+" :
        gatesPassed === 3 ? "A" :
        gatesPassed === 2 ? "B" : "skip";

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(tradeGateChecks).values({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        strategy: input.strategy,
        checkDate: input.checkDate,
        ivGatePass: input.ivGatePass ? 1 : 0,
        ivRank: input.ivRank,
        regimeGatePass: input.regimeGatePass ? 1 : 0,
        qqqRegimeNote: input.qqqRegimeNote,
        rangeGatePass: input.rangeGatePass ? 1 : 0,
        rangeNote: input.rangeNote,
        catalystGatePass: input.catalystGatePass ? 1 : 0,
        catalystNote: input.catalystNote,
        overallGrade,
        gatesPassedCount: gatesPassed,
        decision: input.decision,
        notes: input.notes,
        createdAt: Date.now(),
      });
      return { ok: true, grade: overallGrade, gatesPassed, id: (result as any).insertId };
    }),
});
