/**
 * Trade Analytics Router
 *
 * Procedures:
 *   tradeAnalytics.losingStreakAnalysis — max/current/avg streak, distribution, risk-per-trade comparison
 *   tradeAnalytics.drawdownStats        — realized P&L, unrealized P&L, current drawdown %, daily loss
 *   tradeAnalytics.getDrawdownSettings  — get user's drawdown settings
 *   tradeAnalytics.saveDrawdownSettings — save user's drawdown settings
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { uploadedTrades, positions, drawdownSettings } from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Streak Analysis ──────────────────────────────────────────────────────────

function computeStreaks(trades: { isWin: boolean | null; pnl: string | null }[]) {
  // Only use trades with known win/loss
  const resolved = trades.filter(t => t.isWin !== null);

  let maxLossStreak = 0;
  let maxWinStreak = 0;
  let currentLossStreak = 0;
  let currentWinStreak = 0;
  let runningLoss = 0;
  let runningWin = 0;

  // Distribution: how many streaks of each length occurred
  const lossStreakDist: Record<number, number> = {};
  const winStreakDist: Record<number, number> = {};

  for (const t of resolved) {
    if (t.isWin === false) {
      runningLoss++;
      runningWin = 0;
      if (runningLoss > maxLossStreak) maxLossStreak = runningLoss;
    } else {
      if (runningLoss > 0) {
        lossStreakDist[runningLoss] = (lossStreakDist[runningLoss] ?? 0) + 1;
      }
      runningLoss = 0;
      runningWin++;
      if (runningWin > maxWinStreak) maxWinStreak = runningWin;
    }
    if (t.isWin === true) {
      if (runningWin > 0) {
        // counted on transition
      }
    } else {
      if (runningWin > 0) {
        winStreakDist[runningWin] = (winStreakDist[runningWin] ?? 0) + 1;
        runningWin = 0;
      }
    }
  }
  // Flush trailing streaks
  if (runningLoss > 0) lossStreakDist[runningLoss] = (lossStreakDist[runningLoss] ?? 0) + 1;
  if (runningWin > 0) winStreakDist[runningWin] = (winStreakDist[runningWin] ?? 0) + 1;

  // Current streak (from end of list)
  currentLossStreak = 0;
  currentWinStreak = 0;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].isWin === false) {
      if (currentWinStreak > 0) break;
      currentLossStreak++;
    } else {
      if (currentLossStreak > 0) break;
      currentWinStreak++;
    }
  }

  // Average loss streak length
  const streakLengths = Object.entries(lossStreakDist).flatMap(([len, cnt]) =>
    Array(cnt).fill(parseInt(len))
  );
  const avgLossStreak = streakLengths.length > 0
    ? streakLengths.reduce((a, b) => a + b, 0) / streakLengths.length
    : 0;

  // Probability of 7+ consecutive losses in 100 trades (binomial approximation)
  const totalTrades = resolved.length;
  const wins = resolved.filter(t => t.isWin).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0.5;
  const lossProbability = 1 - winRate;
  // P(streak >= 7) in N trades ≈ 1 - (1 - p^7)^(N-6)
  const p7 = Math.pow(lossProbability, 7);
  const prob7InSample = totalTrades >= 7 ? 1 - Math.pow(1 - p7, totalTrades - 6) : 0;

  return {
    maxLossStreak,
    maxWinStreak,
    currentLossStreak,
    currentWinStreak,
    avgLossStreak: Math.round(avgLossStreak * 10) / 10,
    lossStreakDistribution: lossStreakDist,
    winStreakDistribution: winStreakDist,
    totalTrades,
    winRate: Math.round(winRate * 1000) / 10, // percent with 1 decimal
    prob7ConsecLossesInSample: Math.round(prob7InSample * 100),
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const tradeAnalyticsRouter = router({

  losingStreakAnalysis: protectedProcedure
    .input(z.object({
      accountId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const conditions = [eq(uploadedTrades.userId, ctx.user.id)];
      if (input?.accountId) conditions.push(eq(uploadedTrades.accountId, input.accountId));

      // Fetch all trades ordered by date ASC for streak calculation
      const trades = await db
        .select({
          isWin: uploadedTrades.isWin,
          pnl: uploadedTrades.pnl,
          tradeDate: uploadedTrades.tradeDate,
          accountLabel: uploadedTrades.accountLabel,
        })
        .from(uploadedTrades)
        .where(and(...conditions))
        .orderBy(uploadedTrades.tradeDate); // ASC for streak order

      const streaks = computeStreaks(trades);

      // Rajan formula: maxDrawdown / 30 = risk per trade
      // Default: 20% / 30 = 0.66%
      // User's actual: compute from trade history
      const tradesWithPnl = trades.filter(t => t.pnl !== null);
      const avgLoss = tradesWithPnl.filter(t => t.isWin === false).length > 0
        ? tradesWithPnl
            .filter(t => t.isWin === false)
            .reduce((s, t) => s + Math.abs(parseFloat(t.pnl as string)), 0) /
          tradesWithPnl.filter(t => t.isWin === false).length
        : null;

      const avgWin = tradesWithPnl.filter(t => t.isWin === true).length > 0
        ? tradesWithPnl
            .filter(t => t.isWin === true)
            .reduce((s, t) => s + parseFloat(t.pnl as string), 0) /
          tradesWithPnl.filter(t => t.isWin === true).length
        : null;

      // Daily P&L for last 30 days
      const last30 = trades
        .filter(t => t.pnl !== null)
        .slice(-30)
        .map(t => ({
          date: t.tradeDate,
          pnl: parseFloat(t.pnl as string),
          isWin: t.isWin,
        }));

      return {
        ...streaks,
        avgLoss,
        avgWin,
        rajanFormula: {
          maxDrawdownPct: 20,
          tradesPerCycle: 30,
          riskPerTradePct: 0.66,
          description: "20% max drawdown ÷ 30 trades = 0.66% risk per trade",
        },
        last30Trades: last30,
      };
    }),

  drawdownStats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      // Realized P&L from trade history
      const [pnlRow] = await db
        .select({
          totalPnl: sql<number>`COALESCE(SUM(CAST(${uploadedTrades.pnl} AS DECIMAL(14,4))), 0)`,
          todayPnl: sql<number>`COALESCE(SUM(CASE WHEN DATE(${uploadedTrades.tradeDate}) = CURDATE() THEN CAST(${uploadedTrades.pnl} AS DECIMAL(14,4)) ELSE 0 END), 0)`,
          tradeCount: sql<number>`COUNT(*)`,
        })
        .from(uploadedTrades)
        .where(eq(uploadedTrades.userId, ctx.user.id));

      // Unrealized P&L from positions
      const [posRow] = await db
        .select({
          totalUnrealized: sql<number>`COALESCE(SUM(CAST(${positions.unrealizedPnl} AS DECIMAL(14,4))), 0)`,
          totalMarketValue: sql<number>`COALESCE(SUM(CAST(${positions.marketValue} AS DECIMAL(14,4))), 0)`,
        })
        .from(positions)
        .where(eq(positions.userId, ctx.user.id));

      // Drawdown settings
      const [settings] = await db
        .select()
        .from(drawdownSettings)
        .where(eq(drawdownSettings.userId, ctx.user.id))
        .limit(1);

      const totalCapital = settings ? parseFloat(settings.totalCapital as string) : 350000;
      const maxDrawdownPct = settings ? parseFloat(settings.maxDrawdownPct as string) : 20;
      const riskPerTradePct = settings ? parseFloat(settings.riskPerTradePct as string) : 0.66;

      const realizedPnl = Number(pnlRow?.totalPnl ?? 0);
      const unrealizedPnl = Number(posRow?.totalUnrealized ?? 0);
      const totalPnl = realizedPnl + unrealizedPnl;
      const currentDrawdownPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;
      const maxDrawdownDollar = totalCapital * (maxDrawdownPct / 100);
      const riskPerTradeDollar = totalCapital * (riskPerTradePct / 100);
      const todayPnl = Number(pnlRow?.todayPnl ?? 0);

      // Drawdown severity
      const drawdownUsedPct = maxDrawdownDollar > 0
        ? Math.abs(Math.min(totalPnl, 0)) / maxDrawdownDollar * 100
        : 0;

      return {
        realizedPnl,
        unrealizedPnl,
        totalPnl,
        totalMarketValue: Number(posRow?.totalMarketValue ?? 0),
        currentDrawdownPct: Math.round(currentDrawdownPct * 100) / 100,
        maxDrawdownPct,
        maxDrawdownDollar,
        riskPerTradePct,
        riskPerTradeDollar,
        totalCapital,
        todayPnl,
        drawdownUsedPct: Math.min(Math.round(drawdownUsedPct * 10) / 10, 100),
        tradeCount: Number(pnlRow?.tradeCount ?? 0),
      };
    }),

  getDrawdownSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(drawdownSettings)
        .where(eq(drawdownSettings.userId, ctx.user.id))
        .limit(1);
      return row ?? null;
    }),

  saveDrawdownSettings: protectedProcedure
    .input(z.object({
      maxDrawdownPct: z.number().min(1).max(100),
      riskPerTradePct: z.number().min(0.1).max(10),
      totalCapital: z.number().min(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const existing = await db
        .select({ id: drawdownSettings.id })
        .from(drawdownSettings)
        .where(eq(drawdownSettings.userId, ctx.user.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(drawdownSettings)
          .set({
            maxDrawdownPct: input.maxDrawdownPct.toString(),
            riskPerTradePct: input.riskPerTradePct.toString(),
            totalCapital: input.totalCapital.toString(),
          })
          .where(eq(drawdownSettings.userId, ctx.user.id));
      } else {
        await db.insert(drawdownSettings).values({
          userId: ctx.user.id,
          maxDrawdownPct: input.maxDrawdownPct.toString(),
          riskPerTradePct: input.riskPerTradePct.toString(),
          totalCapital: input.totalCapital.toString(),
        });
      }
      return { success: true };
    }),
});
