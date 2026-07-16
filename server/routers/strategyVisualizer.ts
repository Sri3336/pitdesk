/**
 * Strategy Visualizer + Trade Setup Performance Explorer
 *
 * Provides:
 *  1. computePayoff  — real-time payoff curve for any multi-leg strategy
 *  2. getTradeHistory — historical trades from manualTrades table, enriched
 *     with reconstructed payoff curves for performance comparison
 *  3. getSetupStats  — aggregate win/loss/avg-pnl by strategy type
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { manualTrades } from "../../drizzle/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { bsPrice, bsGreeks } from "../analysisEngine";

// ─── Shared schemas ────────────────────────────────────────────────────────────

const LegSchema = z.object({
  id: z.string(),
  action: z.enum(["buy", "sell"]),
  type: z.enum(["call", "put"]),
  strike: z.number(),
  expiry: z.string(),           // ISO date "YYYY-MM-DD"
  premium: z.number(),          // per-share premium (mid price)
  iv: z.number(),               // implied vol as decimal e.g. 0.30
  contracts: z.number().default(1),
});

export type VisualizerLeg = z.infer<typeof LegSchema>;

// ─── Payoff computation helpers ────────────────────────────────────────────────

const R = 0.053; // risk-free rate

function daysToExpiry(expiry: string, fromDate?: Date): number {
  const from = fromDate ?? new Date();
  const exp  = new Date(expiry + "T16:00:00");
  return Math.max(0, (exp.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Compute the P&L of a multi-leg position at a given underlying price S,
 * with optional IV shift and time shift (days elapsed since entry).
 */
function legPnl(
  leg: VisualizerLeg,
  S: number,
  daysElapsed: number,
  ivShift: number,   // additive shift, e.g. +0.05 = +5% IV
): number {
  const dte0 = daysToExpiry(leg.expiry);
  const dteNow = Math.max(0, dte0 - daysElapsed);
  const T = dteNow / 365;
  const sigma = Math.max(0.01, leg.iv + ivShift);
  const theorPrice = bsPrice(S, leg.strike, T, R, sigma, leg.type);
  const entryPrice = leg.premium;
  const multiplier = leg.action === "sell" ? -1 : 1;
  // P&L per contract (100 shares)
  return multiplier * (theorPrice - entryPrice) * 100 * leg.contracts;
}

/** Expiration P&L (intrinsic only) */
function legExpirationPnl(leg: VisualizerLeg, S: number): number {
  const intrinsic = leg.type === "call"
    ? Math.max(0, S - leg.strike)
    : Math.max(0, leg.strike - S);
  const multiplier = leg.action === "sell" ? -1 : 1;
  return multiplier * (intrinsic - leg.premium) * 100 * leg.contracts;
}

/** Compute full payoff curve across a price range */
function computePayoffCurve(
  legs: VisualizerLeg[],
  currentPrice: number,
  daysElapsed: number,
  ivShift: number,
  points = 120,
): { price: number; pnlNow: number; pnlExpiry: number }[] {
  const range = currentPrice * 0.20; // ±20%
  const lo = currentPrice - range;
  const hi = currentPrice + range;
  const step = (hi - lo) / (points - 1);
  const curve = [];
  for (let i = 0; i < points; i++) {
    const price = lo + i * step;
    const pnlNow   = legs.reduce((sum, l) => sum + legPnl(l, price, daysElapsed, ivShift), 0);
    const pnlExpiry = legs.reduce((sum, l) => sum + legExpirationPnl(l, price), 0);
    curve.push({ price: Math.round(price * 100) / 100, pnlNow, pnlExpiry });
  }
  return curve;
}

/** Compute aggregate Greeks for the position */
function computePositionGreeks(legs: VisualizerLeg[], S: number, daysElapsed: number, ivShift: number) {
  let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;
  for (const leg of legs) {
    const dte0   = daysToExpiry(leg.expiry);
    const dteNow = Math.max(0, dte0 - daysElapsed);
    const T      = dteNow / 365;
    const sigma  = Math.max(0.01, leg.iv + ivShift);
    const g      = bsGreeks(S, leg.strike, T, R, sigma, leg.type);
    const mult   = (leg.action === "sell" ? -1 : 1) * leg.contracts * 100;
    delta += g.delta * mult;
    gamma += g.gamma * mult;
    theta += g.theta * mult;
    vega  += g.vega  * mult;
    rho   += g.rho   * mult;
  }
  return {
    delta: Math.round(delta * 1000) / 1000,
    gamma: Math.round(gamma * 10000) / 10000,
    theta: Math.round(theta * 100) / 100,
    vega:  Math.round(vega  * 100) / 100,
    rho:   Math.round(rho   * 100) / 100,
  };
}

/** Net credit / debit for the position */
function netCredit(legs: VisualizerLeg[]): number {
  return legs.reduce((sum, l) => {
    return sum + (l.action === "sell" ? 1 : -1) * l.premium * 100 * l.contracts;
  }, 0);
}

/** Find breakeven prices (sign changes in expiry P&L curve) */
function findBreakevens(curve: { price: number; pnlExpiry: number }[]): number[] {
  const bvs: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i];
    if (a.pnlExpiry * b.pnlExpiry < 0) {
      // Linear interpolation
      const frac = Math.abs(a.pnlExpiry) / (Math.abs(a.pnlExpiry) + Math.abs(b.pnlExpiry));
      bvs.push(Math.round((a.price + frac * (b.price - a.price)) * 100) / 100);
    }
  }
  return bvs;
}

/** Max profit and max loss from expiry curve */
function maxProfitLoss(curve: { price: number; pnlExpiry: number }[]) {
  const pnls = curve.map(c => c.pnlExpiry);
  return {
    maxProfit: Math.max(...pnls),
    maxLoss:   Math.min(...pnls),
  };
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const strategyVisualizerRouter = router({

  /**
   * Compute payoff curve + Greeks for a set of legs.
   * Called on every slider change — must be fast (pure math, no DB/API).
   */
  computePayoff: protectedProcedure
    .input(z.object({
      legs:         z.array(LegSchema),
      currentPrice: z.number().positive(),
      daysElapsed:  z.number().min(0).default(0),
      ivShift:      z.number().default(0),   // e.g. -0.05 for -5% IV
    }))
    .query(({ input }) => {
      const { legs, currentPrice, daysElapsed, ivShift } = input;
      if (legs.length === 0) return null;

      const curve      = computePayoffCurve(legs, currentPrice, daysElapsed, ivShift);
      const greeks     = computePositionGreeks(legs, currentPrice, daysElapsed, ivShift);
      const credit     = netCredit(legs);
      const breakevens = findBreakevens(curve);
      const { maxProfit, maxLoss } = maxProfitLoss(curve);

      // Current P&L (at currentPrice, with time/IV shifts)
      const currentPnl = legs.reduce((sum, l) => sum + legPnl(l, currentPrice, daysElapsed, ivShift), 0);

      // Probability of profit: fraction of expiry curve with pnlExpiry > 0
      const profitPoints = curve.filter(c => c.pnlExpiry > 0).length;
      const pop = Math.round((profitPoints / curve.length) * 100);

      return {
        curve,
        greeks,
        netCredit: Math.round(credit * 100) / 100,
        breakevens,
        maxProfit:  Math.round(maxProfit * 100) / 100,
        maxLoss:    Math.round(maxLoss   * 100) / 100,
        currentPnl: Math.round(currentPnl * 100) / 100,
        pop,
      };
    }),

  /**
   * Fetch historical trades from manualTrades, reconstruct payoff curves
   * for closed trades so we can overlay "what happened" on the chart.
   */
  getTradeHistory: protectedProcedure
    .input(z.object({
      strategyType: z.string().optional(),
      ticker:       z.string().optional(),
      status:       z.enum(["open", "closed", "all"]).default("all"),
      limit:        z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(manualTrades.userId, ctx.user.id)];
      if (input.status !== "all") {
        conditions.push(eq(manualTrades.status, input.status as "open" | "closed" | "cancelled"));
      }
      if (input.ticker) {
        conditions.push(eq(manualTrades.ticker, input.ticker.toUpperCase()));
      }

      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(manualTrades)
        .where(and(...conditions))
        .orderBy(desc(manualTrades.createdAt))
        .limit(input.limit);

      // Filter by strategyType if provided
      const filtered = input.strategyType
        ? rows.filter(r => r.strategyType?.toLowerCase().includes(input.strategyType!.toLowerCase()))
        : rows;

      return filtered.map((t: typeof rows[number]) => ({
        id:            t.id,
        ticker:        t.ticker,
        strategyType:  t.strategyType,
        account:       t.account,
        entryDate:     t.entryDate,
        exitDate:      t.exitDate,
        entryPrice:    t.entryPrice ? Number(t.entryPrice) : null,
        exitPrice:     t.exitPrice  ? Number(t.exitPrice)  : null,
        quantity:      t.quantity,
        expiryDate:    t.expiryDate,
        maxLoss:       t.maxLoss    ? Number(t.maxLoss)    : null,
        maxProfit:     t.maxProfit  ? Number(t.maxProfit)  : null,
        realizedPnl:   t.realizedPnl ? Number(t.realizedPnl) : null,
        realizedPnlPct: t.realizedPnlPct ? Number(t.realizedPnlPct) : null,
        status:        t.status,
        notes:         t.notes,
        postTradeNotes: t.postTradeNotes,
        lessonsLearned: t.lessonsLearned,
        tags:          t.tags,
        // Outcome classification
        outcome: t.realizedPnl
          ? Number(t.realizedPnl) > 0 ? "win"
          : Number(t.realizedPnl) < 0 ? "loss"
          : "breakeven"
          : t.status === "open" ? "open" : "unknown",
        // P&L as % of max risk
        pnlPct: (t.realizedPnl && t.maxLoss && Number(t.maxLoss) !== 0)
          ? Math.round((Number(t.realizedPnl) / Math.abs(Number(t.maxLoss))) * 1000) / 10
          : null,
      }));
    }),

  /**
   * Aggregate statistics by strategy type — win rate, avg P&L, best/worst.
   */
  getSetupStats: protectedProcedure
    .query(async ({ ctx }) => {
      const db2 = await getDb();
      if (!db2) return [];
      const rows = await db2
        .select()
        .from(manualTrades)
        .where(
          and(
            eq(manualTrades.userId, ctx.user.id),
            eq(manualTrades.status, "closed"),
            isNotNull(manualTrades.realizedPnl),
          )
        )
        .orderBy(desc(manualTrades.createdAt));

      // Group by strategyType
      const groups: Record<string, {
        trades: number; wins: number; losses: number; breakevens: number;
        totalPnl: number; bestPnl: number; worstPnl: number;
        avgDte: number; dteCount: number;
        pnlList: number[];
      }> = {};

      for (const t of (rows as typeof rows)) {
        const key = t.strategyType || "Other";
        if (!groups[key]) {
          groups[key] = { trades: 0, wins: 0, losses: 0, breakevens: 0, totalPnl: 0, bestPnl: -Infinity, worstPnl: Infinity, avgDte: 0, dteCount: 0, pnlList: [] };
        }
        const g = groups[key];
        const pnl = Number(t.realizedPnl);
        g.trades++;
        g.totalPnl += pnl;
        g.pnlList.push(pnl);
        if (pnl > 0) g.wins++;
        else if (pnl < 0) g.losses++;
        else g.breakevens++;
        if (pnl > g.bestPnl)  g.bestPnl  = pnl;
        if (pnl < g.worstPnl) g.worstPnl = pnl;
        // DTE at entry
        if (t.entryDate && t.expiryDate) {
          const dte = daysToExpiry(t.expiryDate, new Date(t.entryDate));
          g.avgDte += dte; g.dteCount++;
        }
      }

      return Object.entries(groups).map(([strategy, g]) => ({
        strategy,
        trades:    g.trades,
        wins:      g.wins,
        losses:    g.losses,
        breakevens: g.breakevens,
        winRate:   g.trades > 0 ? Math.round((g.wins / g.trades) * 1000) / 10 : 0,
        totalPnl:  Math.round(g.totalPnl * 100) / 100,
        avgPnl:    Math.round((g.totalPnl / g.trades) * 100) / 100,
        bestPnl:   g.bestPnl === -Infinity ? 0 : Math.round(g.bestPnl * 100) / 100,
        worstPnl:  g.worstPnl === Infinity ? 0 : Math.round(g.worstPnl * 100) / 100,
        avgDte:    g.dteCount > 0 ? Math.round(g.avgDte / g.dteCount) : null,
        // Profit factor
        grossWins:   g.pnlList.filter(p => p > 0).reduce((a, b) => a + b, 0),
        grossLosses: Math.abs(g.pnlList.filter(p => p < 0).reduce((a, b) => a + b, 0)),
      })).sort((a, b) => b.trades - a.trades);
    }),

  /**
   * Get distinct tickers and strategy types from trade history (for filters).
   */
  getFilterOptions: protectedProcedure
    .query(async ({ ctx }) => {
      const db3 = await getDb();
      if (!db3) return { tickers: [], strategies: [] };
      const rows = await db3
        .select({ ticker: manualTrades.ticker, strategyType: manualTrades.strategyType })
        .from(manualTrades)
        .where(eq(manualTrades.userId, ctx.user.id));

      const tickers   = Array.from(new Set(rows.map((r: { ticker: string; strategyType: string | null }) => r.ticker))).sort();
      const strategies = Array.from(new Set(rows.map((r: { ticker: string; strategyType: string | null }) => r.strategyType || "Other"))).sort();
      return { tickers, strategies };
    }),
});
