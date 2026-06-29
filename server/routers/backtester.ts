/**
 * Backtester Router — Strategy backtesting on stored 5-year OHLCV data
 *
 * Strategies:
 *   dux_5filter    — Steven Dux gap-up momentum
 *   velez_pullback — Velez-style 3-day pullback above 20-EMA
 *
 * Exit rules (configurable):
 *   Fixed profit target %, fixed stop loss %, max hold days (whichever first)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { priceBars } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BacktestTrade {
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  exitReason: "target" | "stop" | "time" | "end_of_data";
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcSMA(prices: number[], period: number): number[] {
  return prices.map((_, i) => {
    if (i < period - 1) return NaN;
    return prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { ema.push(NaN); continue; }
    if (i === period - 1) {
      ema.push(prices.slice(0, period).reduce((a, b) => a + b, 0) / period);
    } else {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
  }
  return ema;
}

// ─── Signal detectors ─────────────────────────────────────────────────────────

function detectDuxSignals(
  bars: OHLCVBar[],
  minGapPct: number,
  minVolMultiplier: number
): number[] {
  const signals: number[] = [];
  const avgVol = calcSMA(bars.map(b => b.volume), 20);
  for (let i = 2; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (isNaN(avgVol[i])) continue;
    const gapPct = ((bar.open - prev.close) / prev.close) * 100;
    if (gapPct < minGapPct) continue;
    if (bar.volume < avgVol[i] * minVolMultiplier) continue;
    const range = bar.high - bar.low;
    if (range > 0 && (bar.close - bar.low) / range < 0.70) continue;
    if (prev.close >= prev.open) continue;
    signals.push(i);
  }
  return signals;
}

function detectVelezSignals(bars: OHLCVBar[], emaPeriod: number): number[] {
  const signals: number[] = [];
  const ema = calcEMA(bars.map(b => b.close), emaPeriod);
  const avgVol = calcSMA(bars.map(b => b.volume), 20);
  for (let i = 8; i < bars.length; i++) {
    if (isNaN(ema[i]) || isNaN(avgVol[i])) continue;
    const pullback =
      bars[i - 2].close > bars[i - 1].close &&
      bars[i - 1].close > bars[i].close;
    if (!pullback) continue;
    if (bars[i].close < ema[i]) continue;
    const quietVol =
      bars[i].volume < avgVol[i] &&
      bars[i - 1].volume < avgVol[i - 1] &&
      bars[i - 2].volume < avgVol[i - 2];
    if (!quietVol) continue;
    if (bars[i - 4].close <= bars[i - 8].close) continue;
    signals.push(i);
  }
  return signals;
}

// ─── Trade simulator ──────────────────────────────────────────────────────────

function simulateTrades(
  ticker: string,
  bars: OHLCVBar[],
  signals: number[],
  profitTargetPct: number,
  stopLossPct: number,
  maxHoldDays: number
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  for (const sigIdx of signals) {
    const entryIdx = sigIdx + 1;
    if (entryIdx >= bars.length) continue;
    const entryPrice = bars[entryIdx].open;
    if (!entryPrice || entryPrice <= 0) continue;
    const target = entryPrice * (1 + profitTargetPct / 100);
    const stop = entryPrice * (1 - stopLossPct / 100);
    const maxExit = Math.min(entryIdx + maxHoldDays, bars.length - 1);
    let exitIdx = maxExit;
    let exitPrice = bars[maxExit].close;
    let exitReason: BacktestTrade["exitReason"] =
      exitIdx === bars.length - 1 ? "end_of_data" : "time";
    for (let j = entryIdx + 1; j <= maxExit; j++) {
      if (bars[j].high >= target) {
        exitPrice = target; exitIdx = j; exitReason = "target"; break;
      }
      if (bars[j].low <= stop) {
        exitPrice = stop; exitIdx = j; exitReason = "stop"; break;
      }
    }
    trades.push({
      ticker,
      entryDate: bars[entryIdx].date,
      exitDate: bars[exitIdx].date,
      entryPrice: Math.round(entryPrice * 100) / 100,
      exitPrice: Math.round(exitPrice * 100) / 100,
      pnlPct: Math.round(((exitPrice - entryPrice) / entryPrice) * 10000) / 100,
      exitReason,
    });
  }
  return trades;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function computeStats(trades: BacktestTrade[]) {
  if (!trades.length) return {
    winRate: 0, totalTrades: 0, wins: 0, losses: 0,
    avgWinPct: 0, avgLossPct: 0, profitFactor: 0,
    totalReturnPct: 0, maxDrawdownPct: 0,
    equityCurve: [] as { date: string; equity: number }[],
  };
  const sorted = [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const wins = sorted.filter(t => t.pnlPct > 0);
  const losses = sorted.filter(t => t.pnlPct <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));
  let equity = 10000, peak = 10000, maxDD = 0;
  const equityCurve: { date: string; equity: number }[] = [
    { date: sorted[0].entryDate, equity: 10000 },
  ];
  for (const t of sorted) {
    equity *= (1 + t.pnlPct / 100);
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
    equityCurve.push({ date: t.exitDate, equity: Math.round(equity * 100) / 100 });
  }
  return {
    winRate: Math.round((wins.length / sorted.length) * 1000) / 10,
    totalTrades: sorted.length,
    wins: wins.length,
    losses: losses.length,
    avgWinPct: wins.length ? Math.round(grossWin / wins.length * 100) / 100 : 0,
    avgLossPct: losses.length ? Math.round(-grossLoss / losses.length * 100) / 100 : 0,
    profitFactor: grossLoss > 0 ? Math.round(grossWin / grossLoss * 100) / 100 : grossWin > 0 ? 99 : 0,
    totalReturnPct: Math.round((equity - 10000) / 10000 * 10000) / 100,
    maxDrawdownPct: Math.round(maxDD * 100) / 100,
    equityCurve,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const backtesterRouter = router({
  runBacktest: protectedProcedure
    .input(z.object({
      strategy: z.enum(["dux_5filter", "velez_pullback"]),
      minGapPct: z.number().min(1).max(50).default(5),
      minVolMultiplier: z.number().min(1).max(10).default(2),
      emaPeriod: z.number().min(5).max(200).default(20),
      profitTargetPct: z.number().min(1).max(100).default(10),
      stopLossPct: z.number().min(0.5).max(50).default(5),
      maxHoldDays: z.number().min(1).max(60).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tickerRows = await db
        .selectDistinct({ ticker: priceBars.ticker })
        .from(priceBars);

      const allTrades: BacktestTrade[] = [];
      const tickerBreakdown: { ticker: string; trades: number; winRate: number }[] = [];

      for (const { ticker } of tickerRows) {
        const rows = await db
          .select()
          .from(priceBars)
          .where(and(eq(priceBars.ticker, ticker), eq(priceBars.interval, "1d")))
          .orderBy(priceBars.date);

        if (rows.length < 30) continue;

        const bars: OHLCVBar[] = rows.map(r => ({
          date: r.date,
          open: parseFloat(r.open as unknown as string),
          high: parseFloat(r.high as unknown as string),
          low: parseFloat(r.low as unknown as string),
          close: parseFloat(r.close as unknown as string),
          volume: Number(r.volume),
        }));

        const signals =
          input.strategy === "dux_5filter"
            ? detectDuxSignals(bars, input.minGapPct, input.minVolMultiplier)
            : detectVelezSignals(bars, input.emaPeriod);

        const trades = simulateTrades(
          ticker, bars, signals,
          input.profitTargetPct, input.stopLossPct, input.maxHoldDays
        );

        allTrades.push(...trades);
        if (trades.length > 0) {
          const w = trades.filter(t => t.pnlPct > 0).length;
          tickerBreakdown.push({
            ticker,
            trades: trades.length,
            winRate: Math.round((w / trades.length) * 1000) / 10,
          });
        }
      }

      const stats = computeStats(allTrades);
      return {
        ...stats,
        trades: allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
        tickerBreakdown: tickerBreakdown.sort((a, b) => b.trades - a.trades),
        tickersScanned: tickerRows.length,
        strategy: input.strategy,
        params: input,
      };
    }),

  getDataReadiness: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { tickersWithData: 0, totalBars: 0, oldestDate: null as string | null, newestDate: null as string | null };
    const result = await db
      .select({
        tickersWithData: sql<number>`COUNT(DISTINCT ${priceBars.ticker})`,
        totalBars: sql<number>`COUNT(*)`,
        oldestDate: sql<string>`MIN(${priceBars.date})`,
        newestDate: sql<string>`MAX(${priceBars.date})`,
      })
      .from(priceBars);
    return result[0] ?? { tickersWithData: 0, totalBars: 0, oldestDate: null, newestDate: null };
  }),
});
