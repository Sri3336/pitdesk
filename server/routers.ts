import { TRPCError } from "@trpc/server";
import { runIntradayScan, scoreIntradayTicker } from "./intradayScanner";
import { computeRV, computeIV30, computeAvgVolume, evaluateFilters, buildCalendarSpread } from "./earningsCalendarEngine";
import { fetchVCP, fetchVCPBatch } from "./vcpStrategy";
import { intradayScannerRouter } from "./routers/intradayScanner";
import { runAnalysis } from "./analysisEngine";
import type { PriceBar, OptionLeg, EarningsInfo } from "./analysisEngine";
import { generateExcelReport } from "./excelExport";
import { fetchEventImpact } from "./eventImpact";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { PCR_TICKERS } from "@shared/tickers";
import { INTRADAY_TICKER_SYMBOLS } from "@shared/intradayTickers";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  closeTrade,
  createPasswordResetToken,
  createUser,
  deleteUserById,
  deleteFibEmaAlert,
  getFibEmaAlertHistory,
  getFibEmaAlertsByUser,
  getManualTradesByUser,
  getValidPasswordResetToken,
  getUserByEmail,
  getUserById,
  insertFibEmaAlertHistory,
  insertManualTrade,
  listAllUsers,
  markPasswordResetTokenUsed,
  saveAnalysisRun,
  getAnalysisRunsByUser,
  deleteAnalysisRun,
  updateLastSignedIn,
  updateTradeNotes,
  updateEntryTime,
  updateUserPassword,
  updateUserProfile,
  updateUserRole,
  upsertFibEmaAlert,
  getCriteriaWeights,
  updateCriteriaWeight,
  resetCriteriaWeights,
  getScanOutcomes,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistNotes,
  getTrackedRecommendations,
  getAllTrackedRecommendations,
  saveTrackedRecommendation,
  deleteTrackedRecommendation,
  deleteTrackedRecommendations,
  adminDeleteTrackedRecommendations,
  updateTrackedRecommendationNotes,
  createIvrAlert,
  getAllIvrAlerts,
  getIvrAlerts,
  deleteIvrAlert,
  updateIvrAlertLastChecked,
  updateIvrAlertStatus,
  createVcpAlert,
  getAllVcpAlerts,
  getVcpAlerts,
  deleteVcpAlert,
  updateVcpAlertLastChecked,
  updateVcpAlertStatus,
} from "./db";
import { getGoogleAuthUrl } from "./_core/googleAuth";
import { sendEmail, buildFibEmaAlertEmail } from "./email";
import {
  calcFibExtensions,
  calcFibRetracements,
  calcTradeExtensionTargets,
  detectFibEmaConfluence,
  findSwingHighLow,
  calcAllEmas,
} from "./fibEngine";
import { runVelezDailyScanner, runVelezIntradayScanner } from "./velezScanner";
import { runOpeningRangeScalperScan, scanOpeningRangeScalper } from "./openingRangeScalper";
import { runPRPScanner, scanPreviousRangePullback } from "./previousRangeScanner";
import { brokerRouter, agentRouter, tradeLogRouter } from "./routers/agent";
import { tradeUploadRouter } from "./routers/tradeUpload";
import { positionsRouter } from "./routers/positions";
import { tradeAnalyticsRouter } from "./routers/tradeAnalytics";
import { preMarketChecklistRouter } from "./routers/preMarketChecklist";
import { morningSessionRouter } from "./routers/morningSession";
import { swingWatchlistRouter } from "./routers/swingWatchlist";
import { liquidityMapRouter } from "./routers/liquidityMap";
import { historicalDataRouter } from "./routers/historicalData";
import { backtesterRouter } from "./routers/backtester";
import { duxScannerRouter } from "./routers/duxScanner";
import { playbookRouter } from "./routers/playbook";
import { schwabRouter } from "./routers/schwab";
import { userAccountsRouter } from "./routers/userAccounts";
import { weeklyPicksRouter } from "./routers/weeklyPicks";
import { ictSupplyZoneRouter } from "./routers/ictSupplyZone";
import { emaPullbackRouter } from "./routers/emaPullback";
import { thetaMachineRouter } from "./routers/thetaMachine";
import { decisionBenchRouter } from "./routers/decisionBench";
import { pitAdvisorRouter } from "./routers/pitAdvisor";
import { optionsFlowRouter } from "./routers/optionsFlow";
import { catalystBreakoutRouter } from "./routers/catalystBreakout";
import { cotRouter } from "./routers/cot";
import { cotAlertsRouter } from "./routers/cotAlerts";
import { manualTradesRouter } from "./routers/manualTrades";
import { pcrAlertsRouter } from "./routers/pcrAlerts";
import {
  getLatestScheduledResults,
  getLatestOiSnapshots,
  runEodSnapshot,
  runIntradayScan as runPcrIntradayScan,
  countSnapshotDays,
  getMissingTickers,
  runEodSnapshotForTickers,
  getEodHistory,
  getHistoricalResults,
  getPCRHistoryForTicker,
  getBiggestMovers,
  getScanRunDates,
  getScanRunDetail,
  getDailyLandingTable,
  savePCRRecommendation,
  getPCRSavedRecommendations,
  getPCRTrendData,
} from "./pcrScheduler";
import { notifyOwner } from "./_core/notification";
import { callDataApi } from "./_core/dataApi";
import { getDb } from "./db";
import { intradayScanResults } from "../drizzle/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import type { CriterionResult } from "./intradayScanner";

const OWNER_EMAIL = "akulasridhar@gmail.com";

// ─── Analysis Engine Helpers ──────────────────────────────────────────────────

async function fetchPriceHistory(symbol: string): Promise<PriceBar[]> {
  const res: any = await callDataApi("YahooFinance/get_stock_chart", {
    query: {
      symbol,
      region: "US",
      interval: "1d",
      range: "1y",
      includeAdjustedClose: "true",
    },
  });
  const result = res?.chart?.result?.[0];
  if (!result) throw new Error(`No price data for ${symbol}`);
  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const bars: PriceBar[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    if (!quote.close[i]) continue;
    const d = new Date(timestamp[i] * 1000);
    bars.push({
      date: d.toISOString().split("T")[0],
      open: quote.open[i] ?? quote.close[i],
      high: quote.high[i] ?? quote.close[i],
      low: quote.low[i] ?? quote.close[i],
      close: quote.close[i],
      volume: quote.volume[i] ?? 0,
    });
  }
  return bars;
}

function buildSyntheticOptionChain(
  lastPrice: number,
  rv20: number,
  targetDte: number,
  meta: { fiftyTwoWeekHigh: number; fiftyTwoWeekLow: number }
): OptionLeg[] {
  const r = 0.045;
  const dte = Math.max(targetDte, 1);
  const T = dte / 365;
  const atmIV = rv20 * 1.2;
  const erf = (x: number) => {
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    const sign = x<0?-1:1; const ax=Math.abs(x);
    const t=1/(1+p*ax);
    return sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax));
  };
  const normCdf = (x: number) => 0.5*(1+erf(x/Math.SQRT2));
  const normPdf = (x: number) => Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);
  const bsPrice = (S: number, K: number, sigma: number, type: "call"|"put") => {
    if (T<=0) return Math.max(0, type==="call"?S-K:K-S);
    const sqrtT=Math.sqrt(T);
    const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*sqrtT);
    const d2=d1-sigma*sqrtT;
    if (type==="call") return S*normCdf(d1)-K*Math.exp(-r*T)*normCdf(d2);
    return K*Math.exp(-r*T)*normCdf(-d2)-S*normCdf(-d1);
  };
  const bsGreeks = (S: number, K: number, sigma: number, type: "call"|"put") => {
    if (T<=0) return { delta: type==="call"?(S>K?1:0):(S<K?-1:0), gamma:0, theta:0, vega:0, rho:0 };
    const sqrtT=Math.sqrt(T);
    const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*sqrtT);
    const d2=d1-sigma*sqrtT;
    const nd1=normPdf(d1);
    const Nd2=normCdf(d2);
    const delta = type==="call"?normCdf(d1):normCdf(d1)-1;
    const gamma = nd1/(S*sigma*sqrtT);
    const theta = (-(S*nd1*sigma)/(2*sqrtT)-r*K*Math.exp(-r*T)*(type==="call"?Nd2:normCdf(-d2)))/365;
    const vega = S*nd1*sqrtT/100;
    const rho = type==="call"
      ? K*T*Math.exp(-r*T)*Nd2/100
      : -K*T*Math.exp(-r*T)*normCdf(-d2)/100;
    return { delta, gamma, theta, vega, rho };
  };
  const legs: OptionLeg[] = [];
  const sqrtT = Math.sqrt(T);
  const d1_20delta = 0.842;
  const lnSK_20d = d1_20delta * atmIV * sqrtT - (r + 0.5 * atmIV * atmIV) * T;
  const requiredHalfRange = lastPrice * (Math.exp(Math.abs(lnSK_20d)) - 1) * 1.6;
  const strikeStep = Math.max(0.5, lastPrice * 0.005);
  const numStrikes = Math.max(60, Math.ceil(requiredHalfRange / strikeStep) + 5);
  for (let i = -numStrikes; i <= numStrikes; i++) {
    const K = Math.round((lastPrice + i * strikeStep) * 100) / 100;
    if (K <= 0) continue;
    const moneyness = Math.log(K / lastPrice);
    const skew = moneyness < 0 ? -moneyness * 0.3 : moneyness * 0.1;
    const iv = Math.max(0.05, atmIV + skew);
    for (const type of ["call", "put"] as const) {
      const mid = bsPrice(lastPrice, K, iv, type);
      const spread = Math.max(0.01, mid * 0.04);
      const bid = Math.max(0.01, mid - spread / 2);
      const ask = mid + spread / 2;
      const greeks = bsGreeks(lastPrice, K, iv, type);
      const oi = Math.round(Math.max(100, 5000 * Math.exp(-Math.abs(moneyness) * 10)));
      legs.push({
        strike: K,
        expiry: new Date(Date.now() + dte * 86400000).toISOString().split("T")[0],
        type,
        bid: Math.round(bid * 100) / 100,
        ask: Math.round(ask * 100) / 100,
        mid: Math.round(mid * 100) / 100,
        iv,
        delta: Math.round(greeks.delta * 10000) / 10000,
        gamma: Math.round(greeks.gamma * 10000) / 10000,
        theta: Math.round(greeks.theta * 10000) / 10000,
        vega: Math.round(greeks.vega * 10000) / 10000,
        rho: Math.round(greeks.rho * 10000) / 10000,
        openInterest: oi,
        volume: Math.round(oi * 0.1),
        dte,
      });
    }
  }
  return legs;
}

async function fetchOptionChain(symbol: string, targetDte: number, priceHistory: PriceBar[]): Promise<OptionLeg[]> {
  const closes = priceHistory.map(b => b.close);
  const n = Math.min(20, closes.length - 1);
  let sumSq = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const ret = Math.log(closes[i] / closes[i - 1]);
    sumSq += ret * ret;
  }
  const rv20 = Math.sqrt((sumSq / n) * 252);
  const lastPrice = closes[closes.length - 1];
  const hi52 = Math.max(...closes);
  const lo52 = Math.min(...closes);
  return buildSyntheticOptionChain(lastPrice, rv20, targetDte, { fiftyTwoWeekHigh: hi52, fiftyTwoWeekLow: lo52 });
}

async function fetchEarningsInfo(symbol: string, priceHistory: PriceBar[], medianIV: number): Promise<EarningsInfo | null> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, region: "US", interval: "1d", range: "2y", includeAdjustedClose: "true", events: "earnings" },
    });
    const result = res?.chart?.result?.[0];
    const earningsEvents = result?.events?.earnings;
    if (!earningsEvents) return null;
    const now = Date.now() / 1000;
    const futureEarnings = Object.values(earningsEvents as Record<string, any>)
      .filter((e: any) => e.date > now)
      .sort((a: any, b: any) => a.date - b.date);
    if (futureEarnings.length === 0) return null;
    const nextEarnings = futureEarnings[0] as any;
    const nextEarningsDate = new Date(nextEarnings.date * 1000).toISOString().split("T")[0];
    const daysToEarnings = Math.ceil((nextEarnings.date - now) / 86400);
    const closes = priceHistory.map(b => b.close);
    const pastEarnings = Object.values(earningsEvents as Record<string, any>)
      .filter((e: any) => e.date < now)
      .sort((a: any, b: any) => b.date - a.date)
      .slice(0, 8);
    const historicalMoves: number[] = [];
    for (const e of pastEarnings) {
      const idx = priceHistory.findIndex(b => new Date(b.date).getTime() / 1000 >= e.date);
      if (idx > 0) {
        const move = Math.abs((closes[idx] - closes[idx - 1]) / closes[idx - 1]);
        historicalMoves.push(move);
      }
    }
    const avgHistoricalMove = historicalMoves.length > 0
      ? historicalMoves.reduce((a, b) => a + b, 0) / historicalMoves.length
      : 0.05;
    const expectedEarningsMove = Math.max(avgHistoricalMove, medianIV * Math.sqrt(daysToEarnings / 365));
    return {
      nextEarningsDate,
      daysToEarnings,
      expectedEarningsMove,
      avgHistoricalMove,
      historicalEarningsMoves: historicalMoves,
    };
  } catch {
    return null;
  }
}

// ─── Opening Range Scalper Router ──────────────────────────────────────────────
const openingRangeScalperRouter = router({
  scan: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      return runOpeningRangeScalperScan(tickers);
    }),

  scanTicker: protectedProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      return scanOpeningRangeScalper(input.ticker.toUpperCase());
    }),

  // Okala 80/20 Calculator — fetch NQ and ES futures prices
  getFuturesPrice: protectedProcedure.query(async () => {
    const symbols = ["NQ=F", "ES=F"];
    const results: Record<string, { price: number; change: number; changePct: number; symbol: string }> = {};
    for (const sym of symbols) {
      try {
        const res: any = await callDataApi("YahooFinance/get_stock_chart", {
          query: { symbol: sym, region: "US", interval: "1m", range: "1d" },
        });
        const meta = res?.chart?.result?.[0]?.meta;
        if (meta) {
          const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
          const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
          results[sym] = {
            symbol: sym,
            price: Math.round(price * 100) / 100,
            change: Math.round((price - prevClose) * 100) / 100,
            changePct: prevClose ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0,
          };
        }
      } catch {
        // ignore individual symbol failures
      }
    }
    return results;
  }),
});

// ─── Previous Range Pullback Router ────────────────────────────────────────
const previousRangeRouter = router({
  scan: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      return runPRPScanner(tickers);
    }),
  scanTicker: protectedProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      return scanPreviousRangePullback(input.ticker.toUpperCase());
    }),
});

// ─── Velez Scanner Router ─────────────────────────────────────────────────────
const velezRouter = router({
  scanDaily: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
        thresholdPct: z.number().min(0.1).max(5).default(1.0),
        minPrice: z.number().min(0).max(10000).default(10),
        excludeOtc: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      // When excludeOtc is false, pass minPrice=0 to bypass price gate too
      const effectiveMinPrice = input.excludeOtc ? input.minPrice : 0;
      return runVelezDailyScanner(tickers, input.thresholdPct, effectiveMinPrice);
    }),

  scanIntraday: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
        thresholdPct: z.number().min(0.1).max(5).default(1.0),
        minPrice: z.number().min(0).max(10000).default(10),
        excludeOtc: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      const effectiveMinPrice = input.excludeOtc ? input.minPrice : 0;
      return runVelezIntradayScanner(tickers, input.thresholdPct, effectiveMinPrice);
    }),

  // Fetch Fib levels for a single ticker on demand
  getFibLevels: protectedProcedure
    .input(z.object({ ticker: z.string(), lookback: z.number().default(50) }))
    .query(async ({ input }) => {
      const result = await callDataApi("YahooFinance/get_stock_chart", {
        query: { symbol: input.ticker.toUpperCase(), region: "US", interval: "1d", range: "3mo" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = result;
      const chart = data?.chart?.result?.[0];
      if (!chart) throw new TRPCError({ code: "NOT_FOUND", message: "No data for ticker" });

      const timestamps: number[] = chart.timestamp ?? [];
      const q = chart.indicators?.quote?.[0] ?? {};
      const closes: number[] = timestamps.map((_: number, i: number) => q.close?.[i] ?? 0).filter((c: number) => c > 0);
      const highs: number[] = timestamps.map((_: number, i: number) => q.high?.[i] ?? 0).filter((h: number) => h > 0);
      const lows: number[] = timestamps.map((_: number, i: number) => q.low?.[i] ?? 0).filter((l: number) => l > 0);

      const { swingHigh, swingLow } = findSwingHighLow(highs, lows, input.lookback);
      const currentPrice = closes[closes.length - 1] ?? 0;

      return {
        ticker: input.ticker,
        currentPrice,
        swingHigh,
        swingLow,
        fibRetracements: calcFibRetracements(swingHigh, swingLow),
        fibExtensions: calcFibExtensions(swingHigh, swingLow),
        emas: calcAllEmas(closes),
        confluences: detectFibEmaConfluence(currentPrice, closes, swingHigh, swingLow),
      };
    }),
});

// ─── Manual Trades Router ─────────────────────────────────────────────────────
const tradesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getManualTradesByUser(ctx.user.id);
  }),

  add: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(16),
        strategy: z.string().optional(),
        direction: z.enum(["long", "short"]).default("long"),
        entryPrice: z.number().positive(),
        swingLow: z.number().positive().optional(),
        swingHigh: z.number().positive().optional(),
        quantity: z.number().int().positive().optional(),
        target1: z.number().positive().optional(),
        target2: z.number().positive().optional(),
        stopLoss: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await insertManualTrade({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        strategyType: (input.strategy ?? "other") as string,
        entryPrice: String(input.entryPrice),
        quantity: input.quantity ?? 1,
        targetPrice: input.target1 ? String(input.target1) : undefined,
        stopPrice: input.stopLoss ? String(input.stopLoss) : undefined,
      });
      return { success: true };
    }),

  close: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        exitPrice: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trades = await getManualTradesByUser(ctx.user.id);
      const trade = trades.find((t) => t.id === input.id);
      if (!trade) throw new TRPCError({ code: "NOT_FOUND" });
      const entryPrice = parseFloat(String(trade.entryPrice ?? "0"));
      const qty = trade.quantity ?? 1;
      const pnl = (input.exitPrice - entryPrice) * qty;
      await closeTrade(input.id, ctx.user.id, input.exitPrice, pnl);
      return { success: true, pnl };
    }),

    updateNotes: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        postTradeNotes: z.string(),
        lessonsLearned: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateTradeNotes(input.id, ctx.user.id, input.postTradeNotes, input.lessonsLearned);
      return { success: true };
    }),
  updateEntryTime: protectedProcedure
    .input(z.object({ id: z.number().int(), entryTime: z.string().regex(/^\d{2}:\d{2}$/).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await updateEntryTime(input.id, ctx.user.id, input.entryTime);
      return { success: true };
    }),
  // Auto-suggest Fib extension targets from entry + swing low
  getFibTargets: protectedProcedure
    .input(
      z.object({
        entryPrice: z.number().positive(),
        swingLow: z.number().positive(),
      })
    )
    .query(({ input }) => {
      if (input.swingLow >= input.entryPrice) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Swing low must be below entry price",
        });
      }
            return calcTradeExtensionTargets(input.entryPrice, input.swingLow);
    }),
  // Day-of-week analytics — win rate and P&L by weekday
  dayOfWeek: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const { manualTrades: mt } = await import("../drizzle/schema");
    const rows = await db
      .select()
      .from(mt)
      .where(and(eq(mt.userId, ctx.user.id), eq(mt.status, "closed")));
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const buckets: Record<string, { trades: number; wins: number; totalPnl: number }> = {};
    for (const d of DAYS) buckets[d] = { trades: 0, wins: 0, totalPnl: 0 };
    for (const r of rows) {
      if (!r.entryDate) continue;
      const date = new Date(r.entryDate + "T12:00:00Z");
      const dayIndex = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri
      if (dayIndex === 0 || dayIndex === 6) continue;
      const dayName = DAYS[dayIndex - 1];
      const pnl = parseFloat(r.realizedPnl ?? "0");
      buckets[dayName].trades++;
      buckets[dayName].totalPnl += pnl;
      if (pnl > 0) buckets[dayName].wins++;
    }
    return DAYS.map((day, i) => ({
      day,
      shortDay: DAY_SHORT[i],
      trades: buckets[day].trades,
      wins: buckets[day].wins,
      losses: buckets[day].trades - buckets[day].wins,
      winRate: buckets[day].trades > 0 ? (buckets[day].wins / buckets[day].trades) * 100 : null,
      totalPnl: buckets[day].totalPnl,
      avgPnl: buckets[day].trades > 0 ? buckets[day].totalPnl / buckets[day].trades : null,
    }));
  }),
  // Time-of-day analytics — win rate and P&L by 30-min session window
  timeOfDay: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const { manualTrades: mt } = await import("../drizzle/schema");
    const rows = await db
      .select()
      .from(mt)
      .where(and(eq(mt.userId, ctx.user.id), eq(mt.status, "closed")));
    const HOURS = [
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
      "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
      "15:00", "15:30",
    ];
    const buckets: Record<string, { trades: number; wins: number; totalPnl: number }> = {};
    for (const h of HOURS) buckets[h] = { trades: 0, wins: 0, totalPnl: 0 };
    for (const r of rows) {
      if (!r.entryTime) continue;
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
});
// ─── Fib + EMA Alerts Router ─────────────────────────────────────────────────
const fibAlertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getFibEmaAlertsByUser(ctx.user.id);
  }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().int().max(200).default(50) }))
    .query(async ({ input }) => {
      return getFibEmaAlertHistory(input.limit);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        ticker: z.string().min(1).max(16),
        enabled: z.boolean().default(true),
        proximityPct: z.number().min(0.1).max(5).default(1.0),
        fibLevels: z.array(z.number()).default([38.2, 61.8]),
        emaPeriods: z.array(z.number()).default([9, 20, 50, 200]),
        emailEnabled: z.boolean().default(true),
        pushEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertFibEmaAlert({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        enabled: input.enabled,
        proximityPct: input.proximityPct,
        fibLevels: JSON.stringify(input.fibLevels) as unknown as number[],
        emaPeriods: JSON.stringify(input.emaPeriods) as unknown as number[],
        emailEnabled: input.emailEnabled,
        pushEnabled: input.pushEnabled,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFibEmaAlert(input.id, ctx.user.id);
      return { success: true };
    }),

  // Scan all 60 PCR tickers for Fib+EMA confluence
  scan: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
        proximityPct: z.number().min(0.1).max(5).default(1.0),
        fibLevels: z.array(z.number()).default([38.2, 50.0, 61.8]),
        emaPeriods: z.array(z.number()).default([9, 20, 50, 200]),
      })
    )
    .mutation(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      const results: Array<{
        ticker: string;
        currentPrice: number;
        swingHigh: number;
        swingLow: number;
        confluences: ReturnType<typeof detectFibEmaConfluence>;
        hasConfluence: boolean;
      }> = [];

      await Promise.allSettled(
        tickers.map(async (ticker) => {
          try {
            const result = await callDataApi("YahooFinance/get_stock_chart", {
              query: { symbol: ticker.toUpperCase(), region: "US", interval: "1d", range: "3mo" },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = result;
            const chart = data?.chart?.result?.[0];
            if (!chart) return;

            const timestamps: number[] = chart.timestamp ?? [];
            const q = chart.indicators?.quote?.[0] ?? {};
            const closes: number[] = timestamps.map((_: number, i: number) => q.close?.[i] ?? 0).filter((c: number) => c > 0);
            const highs: number[] = timestamps.map((_: number, i: number) => q.high?.[i] ?? 0).filter((h: number) => h > 0);
            const lows: number[] = timestamps.map((_: number, i: number) => q.low?.[i] ?? 0).filter((l: number) => l > 0);

            if (closes.length < 20) return;

            const { swingHigh, swingLow } = findSwingHighLow(highs, lows, 50);
            const currentPrice = closes[closes.length - 1] ?? 0;
            const confluences = detectFibEmaConfluence(
              currentPrice,
              closes,
              swingHigh,
              swingLow,
              input.proximityPct,
              input.fibLevels,
              input.emaPeriods
            );

            results.push({
              ticker,
              currentPrice,
              swingHigh,
              swingLow,
              confluences,
              hasConfluence: confluences.length > 0,
            });
          } catch {
            // Skip failed tickers
          }
        })
      );

      return results.sort((a, b) => (b.hasConfluence ? 1 : 0) - (a.hasConfluence ? 1 : 0));
    }),

  // Send alerts for confluent tickers
  sendAlerts: protectedProcedure
    .input(
      z.object({
        ticker: z.string(),
        currentPrice: z.number(),
        fibLevel: z.number(),
        fibPrice: z.number(),
        emaPeriod: z.number(),
        emaValue: z.number(),
        proximityPct: z.number(),
        emailEnabled: z.boolean().default(true),
        pushEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      let emailSent = false;
      let pushSent = false;

      if (input.emailEnabled) {
        const html = buildFibEmaAlertEmail(
          input.ticker,
          input.currentPrice,
          input.fibLevel,
          input.fibPrice,
          input.emaPeriod,
          input.emaValue
        );
        emailSent = await sendEmail({
          to: OWNER_EMAIL,
          subject: `🎯 PitDesk: ${input.ticker} Fib+EMA Confluence at ${input.fibLevel}% / EMA-${input.emaPeriod}`,
          html,
        });
      }

      if (input.pushEnabled) {
        try {
          await notifyOwner({
            title: `${input.ticker} Fib+EMA Confluence`,
            content: `${input.ticker} @ $${input.currentPrice.toFixed(2)} — near ${input.fibLevel}% Fib ($${input.fibPrice.toFixed(2)}) & EMA-${input.emaPeriod} ($${input.emaValue.toFixed(2)})`,
          });
          pushSent = true;
        } catch {
          pushSent = false;
        }
      }

      // Log to history
      await insertFibEmaAlertHistory({
        ticker: input.ticker,
        currentPrice: input.currentPrice,
        swingHigh: 0,
        swingLow: 0,
        fibLevel: input.fibLevel,
        fibPrice: input.fibPrice,
        emaPeriod: input.emaPeriod,
        emaPrice: input.emaValue,
        proximityPct: input.proximityPct,
        notifiedEmail: emailSent,
        notifiedPush: pushSent,
      });

      return { emailSent, pushSent };
    }),
});

// ─── PCR Router ─────────────────────────────────────────────────────────────
const pcrRouter = router({
  getBatch: protectedProcedure
    .input(z.object({ tickers: z.array(z.string().min(1).max(10)).min(1).max(100) }))
    .query(async ({ input }) => {
      const results = await Promise.allSettled(
        input.tickers.map(async (ticker) => {
          try {
            const res: any = await callDataApi("YahooFinance/get_stock_chart", {
              query: { symbol: ticker, region: "US", interval: "1d", range: "5d" },
            });
            const quote = res?.chart?.result?.[0];
            const callVol = Math.floor(Math.random() * 50000 + 10000);
            const putVol = Math.floor(Math.random() * 50000 + 10000);
            const pcrVol = putVol / callVol;
            const pcrOI = pcrVol * (0.9 + Math.random() * 0.2);
            let signal: string;
            if (pcrOI > 1.5) signal = "EXTREME_FEAR";
            else if (pcrOI > 1.2) signal = "FEAR";
            else if (pcrOI < 0.5) signal = "EXTREME_GREED";
            else if (pcrOI < 0.8) signal = "GREED";
            else signal = "NEUTRAL";
            const recommendation = signal === "EXTREME_FEAR" || signal === "FEAR" ? "Sell put premium / bull put spread" : signal === "EXTREME_GREED" || signal === "GREED" ? "Sell call premium / bear call spread" : "Iron condor / strangle";
            const strategyHint = signal === "EXTREME_FEAR" ? "CSP or bull put spread" : signal === "FEAR" ? "Bull put spread" : signal === "EXTREME_GREED" ? "Covered call or bear call spread" : signal === "GREED" ? "Bear call spread" : "Iron condor";
            return { ticker, pcr: Math.round(pcrVol * 100) / 100, pcrOI: Math.round(pcrOI * 100) / 100, signal, signalStrength: Math.abs(pcrOI - 1.0), recommendation, strategyHint, totalCallVolume: callVol, totalPutVolume: putVol, ivSkew: Math.random() * 0.1 - 0.05, lastPrice: quote?.meta?.regularMarketPrice ?? 0, error: undefined };
          } catch (e: any) {
            return { ticker, pcr: 0, pcrOI: 0, signal: "NEUTRAL", signalStrength: 0, recommendation: "N/A", strategyHint: "N/A", totalCallVolume: 0, totalPutVolume: 0, ivSkew: 0, lastPrice: 0, error: e.message };
          }
        })
      );
      return results.map((r, i) => r.status === "fulfilled" ? r.value : { ticker: input.tickers[i], pcr: 0, pcrOI: 0, signal: "NEUTRAL", signalStrength: 0, recommendation: "N/A", strategyHint: "N/A", totalCallVolume: 0, totalPutVolume: 0, ivSkew: 0, lastPrice: 0, error: "failed" });
    }),
  scan: protectedProcedure.query(async () => {
    const results: Array<{ ticker: string; pcr: number; callVolume: number; putVolume: number; signal: string }> = [];
    await Promise.allSettled(
      [...PCR_TICKERS].map(async (ticker) => {
        try {
          const result = await callDataApi("YahooFinance/get_options", {
            query: { ticker },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = result;
          const chain = data?.optionChain?.result?.[0];
          if (!chain) return;
          const options = chain.options?.[0];
          if (!options) return;
          const callVol = (options.calls ?? []).reduce((s: number, c: any) => s + (c.volume ?? 0), 0);
          const putVol = (options.puts ?? []).reduce((s: number, p: any) => s + (p.volume ?? 0), 0);
          const pcr = callVol > 0 ? putVol / callVol : 0;
          results.push({
            ticker,
            pcr,
            callVolume: callVol,
            putVolume: putVol,
            signal: pcr < 0.7 ? "bullish" : pcr > 1.0 ? "bearish" : "neutral",
          });
        } catch {
          // skip
        }
      })
    );
    return results.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }),
});

// ─── JWT helpers ─────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-dev-secret");
const SESSION_MAX_AGE = ONE_YEAR_MS;

async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
}

async function verifySessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.sub ? parseInt(payload.sub, 10) : null;
  } catch {
    return null;
  }
}

// ─── Auth Router ─────────────────────────────────────────────────────────────
const authRouter = router({
  register: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(100).trim(),
      email: z.string().email().toLowerCase(),
      password: z.string().min(8).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "An account with this email already exists." });
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await createUser({ name: input.name, email: input.email, passwordHash });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account." });
      const token = await createSessionToken(user.id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      await updateLastSignedIn(user.id);
      const token = await createSessionToken(user.id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true } as const;
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    const userId = await verifySessionToken(token);
    if (!userId) return null;
    const user = await getUserById(userId);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
  }),

  googleAuthUrl: publicProcedure.query(() => {
    return { url: getGoogleAuthUrl() };
  }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email().toLowerCase() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email);
      if (!user) return { success: true }; // anti-enumeration
      const { randomBytes } = await import("crypto");
      const tokenBytes = randomBytes(32).toString("hex");
      await createPasswordResetToken(user.id, tokenBytes);
      const appOrigin = process.env.NODE_ENV === "production"
        ? "https://trading.akulaz.ai"
        : "http://localhost:3000";
      const resetUrl = `${appOrigin}/reset-password?token=${tokenBytes}`;
      await notifyOwner({
        title: `Password Reset — ${user.email}`,
        content: `Reset link for ${user.name ?? user.email} (${user.email}):\n${resetUrl}\n\nExpires in 1 hour.`,
      }).catch(() => console.warn("[PasswordReset] Notification failed"));
      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), password: z.string().min(8).max(128) }))
    .mutation(async ({ input }) => {
      const record = await getValidPasswordResetToken(input.token);
      if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link is invalid or has expired." });
      const passwordHash = await bcrypt.hash(input.password, 12);
      await updateUserPassword(record.userId, passwordHash);
      await markPasswordResetTokenUsed(input.token);
      return { success: true };
    }),
});

// ─── Candlestick Chart Router ───────────────────────────────────────────────
const chartRouter = router({
  candles: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(16),
        interval: z.enum(["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"]).default("1d"),
        range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"]).default("3mo"),
      })
    )
    .query(async ({ input }) => {
      const result = await callDataApi("YahooFinance/get_stock_chart", {
        query: {
          symbol: input.ticker.toUpperCase(),
          region: "US",
          interval: input.interval,
          range: input.range,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = result;
      const chart = data?.chart?.result?.[0];
      if (!chart) throw new TRPCError({ code: "NOT_FOUND", message: `No data for ${input.ticker}` });

      const timestamps: number[] = chart.timestamp ?? [];
      const q = chart.indicators?.quote?.[0] ?? {};
      const adjClose: number[] = chart.indicators?.adjclose?.[0]?.adjclose ?? [];

      const candles = timestamps
        .map((ts: number, i: number) => ({
          time: ts as number,
          open: q.open?.[i] as number,
          high: q.high?.[i] as number,
          low: q.low?.[i] as number,
          close: q.close?.[i] as number,
          volume: q.volume?.[i] as number,
          adjClose: adjClose[i] as number,
        }))
        .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);

      const meta = chart.meta ?? {};
      return {
        ticker: input.ticker.toUpperCase(),
        currency: meta.currency ?? "USD",
        exchangeName: meta.exchangeName ?? "",
        regularMarketPrice: meta.regularMarketPrice ?? null,
        previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
        candles,
      };
    }),
});

// ─── Admin Router ───────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    return listAllUsers();
  }),
  updateRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account" });
      await deleteUserById(input.userId);
      return { success: true };
    }),
});

// ─── Profile Router ───────────────────────────────────────────────────────────
const profileRouter = router({
  update: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100).trim() }))
    .mutation(async ({ input, ctx }) => {
      await updateUserProfile(ctx.user.id, { name: input.name });
      return { success: true };
    }),
  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (!user.passwordHash) throw new TRPCError({ code: "BAD_REQUEST", message: "Account uses social login — set a password via Forgot Password" });
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await updateUserPassword(ctx.user.id, newHash);
      return { success: true };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────

// ─── Intraday Scanner Router ──────────────────────────────────────────────────
// Delegates to the full intradayScannerRouter (server/routers/intradayScanner.ts)
// which uses the rich schema with self-learning weights, backtest stats, etc.
const intradayRouter = intradayScannerRouter;

// ─── PCR Scheduled Router ─────────────────────────────────────────────────────────────

const pcrScheduledRouter = router({
  getIntradayResults: protectedProcedure
    .input(z.object({ runDate: z.string().optional() }))
    .query(async ({ input }) => getLatestScheduledResults("intraday_scan", input.runDate)),
  getEodSnapshot: protectedProcedure
    .input(z.object({ snapshotDate: z.string().optional() }))
    .query(async ({ input }) => getLatestOiSnapshots(input.snapshotDate)),
  triggerEodSnapshot: adminProcedure
    .mutation(async () => runEodSnapshot()),
  triggerIntradayScan: adminProcedure
    .mutation(async () => runPcrIntradayScan()),
  countSnapshotDays: protectedProcedure
    .query(async () => { const days = await countSnapshotDays(); return { days }; }),
  getMissingTickers: protectedProcedure
    .input(z.object({ snapshotDate: z.string().optional() }))
    .query(async ({ input }) => { const missing = await getMissingTickers(input.snapshotDate); return { missing, count: missing.length }; }),
  getHistoricalResults: protectedProcedure
    .input(z.object({ days: z.number().optional() }))
    .query(async ({ input }) => getHistoricalResults(input.days ?? 30)),
  getEodHistory: protectedProcedure
    .input(z.object({ ticker: z.string(), days: z.number().optional() }))
    .query(async ({ input }) => getEodHistory(input.ticker, input.days ?? 30)),
  getPCRHistory: protectedProcedure
    .input(z.object({ ticker: z.string(), days: z.number().optional() }))
    .query(async ({ input }) => getPCRHistoryForTicker(input.ticker, input.days ?? 7)),
  getBiggestMovers: protectedProcedure
    .input(z.object({ runDate: z.string().optional() }))
    .query(async ({ input }) => getBiggestMovers(input.runDate)),
  getScanRunDates: protectedProcedure
    .query(async () => getScanRunDates()),
  getScanRunDetail: protectedProcedure
    .input(z.object({ runDate: z.string() }))
    .query(async ({ input }) => getScanRunDetail(input.runDate)),
  retryMissingTickers: adminProcedure
    .input(z.object({ snapshotDate: z.string().optional() }))
    .mutation(async ({ input }) => {
      const missing = await getMissingTickers(input.snapshotDate);
      if (!missing.length) return { saved: 0, errors: 0, stillMissing: [], message: "No missing tickers" };
      return runEodSnapshotForTickers(missing);
    }),
  getDailyLandingTable: protectedProcedure
    .input(z.object({ runDate: z.string().optional() }))
    .query(async ({ input }) => getDailyLandingTable(input.runDate)),
  savePCRRecommendation: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).toUpperCase(),
      signal: z.string(),
      strategyHint: z.string(),
      recommendation: z.string(),
      pcr: z.string(),
      pcrDeltaVsPrior: z.string().nullable(),
      priorSignal: z.string().nullable(),
      runDate: z.string(),
      closingPrice: z.string().nullable(),
    }))
    .mutation(async ({ input, ctx }) => savePCRRecommendation({ ...input, userId: ctx.user.id })),
  getPCRSavedRecommendations: protectedProcedure
    .input(z.object({ ticker: z.string().optional() }))
    .query(async ({ input, ctx }) => getPCRSavedRecommendations(ctx.user.id, input.ticker)),
  getPCRTrend: protectedProcedure
    .input(z.object({ ticker: z.string(), days: z.number().optional() }))
    .query(async ({ input }) => getPCRTrendData(input.ticker, input.days ?? 30)),
});

// ─── Analysis Router ────────────────────────────────────────────────────────────────

const analysisRouter = router({
  run: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).toUpperCase(),
      targetDte: z.number().int().min(1).max(365).default(30),
      accountSize: z.number().min(1000).max(10_000_000).default(50000),
      minCredit: z.number().min(0).max(10000).optional(),
      strategyCategory: z.enum(["all", "credit", "debit"]).default("all"),
    }))
    .mutation(async ({ input, ctx }) => {
      const { ticker, targetDte, accountSize, minCredit, strategyCategory } = input;
      const priceHistory = await fetchPriceHistory(ticker);
      if (priceHistory.length < 20) throw new Error(`Insufficient price history for ${ticker}`);
      const optionChain = await fetchOptionChain(ticker, targetDte, priceHistory);
      if (optionChain.length < 4) throw new Error(`Insufficient option chain data for ${ticker}`);
      const closes = priceHistory.map(b => b.close);
      const n20 = Math.min(20, closes.length - 1);
      let sumSq20 = 0;
      for (let i = closes.length - n20; i < closes.length; i++) {
        const ret = Math.log(closes[i] / closes[i - 1]);
        sumSq20 += ret * ret;
      }
      const rv20forEarnings = Math.sqrt((sumSq20 / n20) * 252);
      const medianIVforEarnings = rv20forEarnings * 1.2;
      const earningsInfo = await fetchEarningsInfo(ticker, priceHistory, medianIVforEarnings);
      const result = runAnalysis(ticker, targetDte, accountSize, priceHistory, optionChain, minCredit, strategyCategory, earningsInfo);
      try {
        await saveAnalysisRun({
          userId: ctx.user.id,
          ticker,
          analysisJson: JSON.stringify(result),
          topStrategy: result.recommendation?.name ?? null,
          score: result.recommendation?.compositeScore != null ? String(result.recommendation.compositeScore) : null,
        });
      } catch (e) {
        console.warn("[Analysis] Failed to save run:", e);
      }
      return result;
    }),
  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return getAnalysisRunsByUser(ctx.user.id, input?.limit ?? 50);
    }),
  deleteOne: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteAnalysisRun(input.id, ctx.user.id);
      return { success: true };
    }),
  exportExcel: protectedProcedure
    .input(z.object({ resultJson: z.string() }))
    .mutation(async ({ input }) => {
      const result = JSON.parse(input.resultJson);
      const base64 = await generateExcelReport(result);
      return { base64 };
    }),
    getEvents: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }) => {
      return fetchEventImpact(input.ticker);
    }),
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      let deleted = 0;
      for (const id of input.ids) {
        try { await deleteAnalysisRun(id, ctx.user.id); deleted++; } catch {}
      }
      return { deleted };
    }),
});
// ─── Watchlist Router ────────────────────────────────────────────────────────
const watchlistRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getWatchlist(ctx.user.id);
  }),
  add: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(10), notes: z.string().max(512).optional() }))
    .mutation(async ({ ctx, input }) => {
      await addToWatchlist(ctx.user.id, input.ticker, input.notes);
      return { success: true };
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await removeFromWatchlist(input.id, ctx.user.id);
      return { success: true };
    }),
  updateNotes: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), notes: z.string().max(512) }))
    .mutation(async ({ ctx, input }) => {
      await updateWatchlistNotes(input.id, ctx.user.id, input.notes);
      return { success: true };
    }),
});

// ─── Recommendations Router ───────────────────────────────────────────────────
const recommendationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") return getAllTrackedRecommendations(input?.limit ?? 1000);
      const rows = await getTrackedRecommendations(ctx.user.id, input?.limit ?? 200);
      return rows.map(r => ({ ...r, userName: null as string | null, userEmail: null as string | null }));
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") await adminDeleteTrackedRecommendations([input.id]);
      else await deleteTrackedRecommendation(input.id, ctx.user.id);
      return { success: true };
    }),
  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") await adminDeleteTrackedRecommendations(input.ids);
      else await deleteTrackedRecommendations(input.ids, ctx.user.id);
      return { success: true };
    }),
  resolve: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await getTrackedRecommendations(ctx.user.id, 500);
      const rec = rows.find(r => r.id === input.id);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Recommendation not found" });
      return { success: true, alreadyResolved: rec.status === "resolved" };
    }),
  updateNotes: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), notes: z.string().max(1024) }))
    .mutation(async ({ ctx, input }) => {
      await updateTrackedRecommendationNotes(input.id, ctx.user.id, input.notes);
      return { success: true };
    }),
  add: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10),
      strategy: z.string().min(1).max(64),
      entryDate: z.string(),
      expiryDate: z.string(),
      entryPrice: z.number().positive(),
      netCredit: z.number(),
      bpRequired: z.number().positive(),
      maxProfit: z.number().optional(),
      maxLoss: z.number().optional(),
      compositeScore: z.number().min(0).max(100).default(50),
      pop: z.number().min(0).max(1).default(0.5),
      exitPrice: z.number().optional(),
      actualPnl: z.number().optional(),
      outcome: z.enum(["win", "loss", "breakeven"]).optional(),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isResolved = input.outcome != null;
      const dte = Math.max(0, Math.round(
        (new Date(input.expiryDate).getTime() - new Date(input.entryDate).getTime()) / 86400000
      ));
      const pnlPct = input.actualPnl != null && input.bpRequired > 0
        ? String((input.actualPnl / input.bpRequired) * 100)
        : null;
      await saveTrackedRecommendation({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        strategy: input.strategy,
        targetDte: dte,
        entryDate: new Date(input.entryDate),
        expiryDate: new Date(input.expiryDate),
        entryPrice: String(input.entryPrice),
        netCredit: String(input.netCredit),
        maxProfit: input.maxProfit != null ? String(input.maxProfit) : null,
        maxLoss: input.maxLoss != null ? String(input.maxLoss) : null,
        breakevens: "[]",
        legsJson: "[]",
        compositeScore: String(input.compositeScore),
        pop: String(input.pop),
        bpRequired: String(input.bpRequired),
        status: isResolved ? "resolved" : "open",
        exitPrice: input.exitPrice != null ? String(input.exitPrice) : null,
        actualPnl: input.actualPnl != null ? String(input.actualPnl / 100) : null,
        actualPnlPct: pnlPct,
        outcome: input.outcome ?? null,
        resolvedAt: isResolved ? new Date() : null,
        notes: input.notes ?? null,
      });
      return { success: true };
    }),
});

// ─── IVR Alerts Router ────────────────────────────────────────────────────────
const ivrAlertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getIvrAlerts(ctx.user.id);
  }),
  create: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10),
      ivrThreshold: z.number().min(0).max(200),
      direction: z.enum(["above", "below"]),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await createIvrAlert({ userId: ctx.user.id, ticker: input.ticker.toUpperCase(), condition: input.direction, threshold: String(input.ivrThreshold), notes: input.notes ?? null });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteIvrAlert(input.id, ctx.user.id);
      return { success: true };
    }),
  togglePause: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateIvrAlertStatus(input.id, input.paused ? "paused" : "active");
      return { success: true };
    }),
  checkAll: protectedProcedure.mutation(async ({ ctx }) => {
    const alerts = await getIvrAlerts(ctx.user.id);
    const active = alerts.filter(a => a.status === "active");
    const triggered: typeof active = [];
    for (const alert of active) {
      try {
        const res: any = await callDataApi("YahooFinance/get_stock_chart", {
          query: { symbol: alert.ticker, region: "US", interval: "1d", range: "1mo" },
        });
        const closes: number[] = res?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        const validCloses = closes.filter((c: number) => c != null && !isNaN(c));
        if (validCloses.length < 20) continue;
        const hv20 = Math.sqrt(validCloses.slice(-20).reduce((sum: number, c: number, i: number, arr: number[]) => {
          if (i === 0) return sum;
          return sum + Math.pow(Math.log(c / arr[i - 1]), 2);
        }, 0) / 19) * Math.sqrt(252) * 100;
        const currentIVR = hv20;
        const threshold = parseFloat(alert.threshold);
        const triggered_now = alert.condition === "above" ? currentIVR >= threshold : currentIVR <= threshold;
        await updateIvrAlertLastChecked(alert.id, currentIVR);
        if (triggered_now) {
          triggered.push(alert);
          await updateIvrAlertStatus(alert.id, "triggered", new Date());
          await sendEmail({
            to: "akulasridhar@gmail.com",
            subject: `IVR Alert: ${alert.ticker} IVR is ${currentIVR.toFixed(1)}% (${alert.condition} ${threshold}%)`,
            html: `<h2>IVR Alert Triggered</h2><p>Your alert for <strong>${alert.ticker}</strong> has been triggered.</p><ul><li><strong>Condition:</strong> IVR ${alert.condition} ${threshold}%</li><li><strong>Current IVR:</strong> ${currentIVR.toFixed(1)}%</li><li><strong>Triggered at:</strong> ${new Date().toUTCString()}</li></ul>`,
          });
        }
      } catch { /* skip */ }
    }
    return { checked: active.length, triggered: triggered.length, tickers: triggered.map(a => a.ticker) };
  }),
});

// ─── VCP Alerts Router ────────────────────────────────────────────────────────
const vcpAlertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getVcpAlerts(ctx.user.id);
  }),
  create: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10),
      notes: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await createVcpAlert({ userId: ctx.user.id, ticker: input.ticker.toUpperCase(), notes: input.notes ?? null });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteVcpAlert(input.id, ctx.user.id);
      return { success: true };
    }),
  togglePause: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateVcpAlertStatus(input.id, input.paused ? "paused" : "active");
      return { success: true };
    }),
  checkAll: protectedProcedure.mutation(async ({ ctx }) => {
    const alerts = await getVcpAlerts(ctx.user.id);
    const active = alerts.filter(a => a.status === "active");
    const triggered: typeof active = [];
    for (const alert of active) {
      try {
        const vcpResult = await fetchVCP(alert.ticker);
        // VCP qualifies if stage is VCP_PIVOT or BREAKOUT
        const qualifies = vcpResult.stage === "VCP_PIVOT" || vcpResult.stage === "BREAKOUT" || vcpResult.vcpScore >= 7;
        await updateVcpAlertLastChecked(alert.id, vcpResult.distanceToPivot);
        if (qualifies) {
          triggered.push(alert);
          await updateVcpAlertStatus(alert.id, "triggered", new Date());
          await sendEmail({
            to: "akulasridhar@gmail.com",
            subject: `VCP Alert: ${alert.ticker} — ${vcpResult.stage} (Score: ${vcpResult.vcpScore}/10)`,
            html: `<h2>VCP Alert Triggered</h2><p>Your VCP watch on <strong>${alert.ticker}</strong> has triggered.</p><ul><li><strong>Stage:</strong> ${vcpResult.stage}</li><li><strong>VCP Score:</strong> ${vcpResult.vcpScore}/10</li><li><strong>Distance to Pivot:</strong> ${vcpResult.distanceToPivot?.toFixed(2)}%</li><li><strong>Triggered at:</strong> ${new Date().toUTCString()}</li></ul>`,
          });
        }
      } catch { /* skip */ }
    }
    return { checked: active.length, triggered: triggered.length, tickers: triggered.map(a => a.ticker) };
  }),
});

// ─── VCP Strategy Router ──────────────────────────────────────────────────────
const vcpRouter = router({
  analyze: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }) => {
      return fetchVCP(input.ticker);
    }),
  batch: protectedProcedure
    .input(z.object({ tickers: z.array(z.string().min(1).max(10)).min(1).max(50) }))
    .query(async ({ input }) => {
      return fetchVCPBatch(input.tickers.map(t => t.toUpperCase()));
    }),
  // alias for pages that call trpc.vcp.getBatch
  getBatch: protectedProcedure
    .input(z.object({ tickers: z.array(z.string().min(1).max(10)).min(1).max(50) }))
    .query(async ({ input }) => {
      return fetchVCPBatch(input.tickers.map(t => t.toUpperCase()));
    }),
});

// ─── Earnings Calendar Router ─────────────────────────────────────────────────
const earningsCalendarRouter = router({
  analyze: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).toUpperCase(),
      portfolioSize: z.number().min(1000).max(10000000).optional().default(10000),
      earningsDateOverride: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const { ticker, portfolioSize, earningsDateOverride } = input;
      const priceHistory = await fetchPriceHistory(ticker);
      if (priceHistory.length < 30) throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient price history for ${ticker}` });
      const closes = priceHistory.map(b => b.close);
      const volumes = priceHistory.map(b => b.volume);
      const lastPrice = closes[closes.length - 1];
      const rv30 = computeRV(closes, 30);
      const iv30 = computeIV30(closes, rv30);
      const avgVolume30d = computeAvgVolume(volumes, 30);
      const filter = evaluateFilters({ rv30, iv30, avgVolume30d, nearDte: 7, backDte: 37, lastPrice });
      let nextEarningsDate: string | null = earningsDateOverride ?? null;
      let daysToEarnings: number | null = null;
      let historicalMoves: number[] = [];
      if (earningsDateOverride) {
        const earningsTs = new Date(earningsDateOverride + 'T20:00:00Z').getTime();
        daysToEarnings = Math.max(0, Math.round((earningsTs - Date.now()) / 86400000));
        const earningsInfo = await fetchEarningsInfo(ticker, priceHistory, iv30);
        historicalMoves = earningsInfo?.historicalEarningsMoves ?? [];
      } else {
        const earningsInfo = await fetchEarningsInfo(ticker, priceHistory, iv30);
        nextEarningsDate = earningsInfo?.nextEarningsDate ?? null;
        daysToEarnings = earningsInfo?.daysToEarnings ?? null;
        historicalMoves = earningsInfo?.historicalEarningsMoves ?? [];
      }
      const result = buildCalendarSpread({ ticker, lastPrice, rv30, iv30, nearDte: 7, backDte: 37, nextEarningsDate, daysToEarnings, historicalMoves, filter });
      const costPerContract = result.netDebit * 100;
      const allocationAmount = portfolioSize * result.portfolioAllocation;
      const contracts = costPerContract > 0 ? Math.floor(allocationAmount / costPerContract) : 0;
      return { ...result, portfolioSize, allocationAmount: Math.round(allocationAmount * 100) / 100, recommendedContracts: contracts, priceHistory: priceHistory.slice(-60) };
    }),
  scanTickers: protectedProcedure
    .input(z.object({ tickers: z.array(z.string()).min(1).max(20) }))
    .mutation(async ({ input }) => {
      const results = [];
      for (const ticker of input.tickers) {
        try {
          const priceHistory = await fetchPriceHistory(ticker);
          if (priceHistory.length < 30) { results.push({ ticker, lastPrice: 0, nextEarningsDate: null, daysToEarnings: null, allPass: false, termStructurePass: false, liquidityPass: false, ivRvRatioPass: false, ivRvRatio: 0, netDebit: 0, error: 'Insufficient data' }); continue; }
          const closes = priceHistory.map(b => b.close);
          const volumes = priceHistory.map(b => b.volume);
          const lastPrice = closes[closes.length - 1];
          const rv30 = computeRV(closes, 30);
          const iv30 = computeIV30(closes, rv30);
          const avgVolume30d = computeAvgVolume(volumes, 30);
          const filter = evaluateFilters({ rv30, iv30, avgVolume30d, nearDte: 7, backDte: 37, lastPrice });
          const earningsInfo = await fetchEarningsInfo(ticker, priceHistory, iv30);
          const spread = buildCalendarSpread({ ticker, lastPrice, rv30, iv30, nearDte: 7, backDte: 37, nextEarningsDate: earningsInfo?.nextEarningsDate ?? null, daysToEarnings: earningsInfo?.daysToEarnings ?? null, historicalMoves: earningsInfo?.historicalEarningsMoves ?? [], filter });
          results.push({ ticker, lastPrice, nextEarningsDate: earningsInfo?.nextEarningsDate ?? null, daysToEarnings: earningsInfo?.daysToEarnings ?? null, allPass: filter.allPass, termStructurePass: filter.termStructurePass, liquidityPass: filter.liquidityPass, ivRvRatioPass: filter.ivRvRatioPass, ivRvRatio: filter.ivRvRatio, netDebit: spread.netDebit });
        } catch (e: any) {
          results.push({ ticker, lastPrice: 0, nextEarningsDate: null, daysToEarnings: null, allPass: false, termStructurePass: false, liquidityPass: false, ivRvRatioPass: false, ivRvRatio: 0, netDebit: 0, error: e.message });
        }
      }
      return results;
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  admin: adminRouter,
  profile: profileRouter,
  chart: chartRouter,
  velez: velezRouter,
  intraday: intradayRouter,
  intradayScanner: intradayScannerRouter,
  trades: tradesRouter,
  fibAlerts: fibAlertsRouter,
  pcr: pcrRouter,
  analysis: analysisRouter,
  pcrScheduled: pcrScheduledRouter,
  broker: brokerRouter,
  agent: agentRouter,
  tradeLog: tradeLogRouter,
  catalystBreakout: catalystBreakoutRouter,
  cot: cotRouter,
  cotAlerts: cotAlertsRouter,
  manualTrades: manualTradesRouter,
  pcrAlerts: pcrAlertsRouter,
  watchlist: watchlistRouter,
  recommendations: recommendationsRouter,
  ivrAlerts: ivrAlertsRouter,
  vcpAlerts: vcpAlertsRouter,
  vcp: vcpRouter,
  earningsCalendar: earningsCalendarRouter,
  openingRangeScalper: openingRangeScalperRouter,
    previousRange: previousRangeRouter,
  tradeUpload: tradeUploadRouter,
  positions: positionsRouter,
  tradeAnalytics: tradeAnalyticsRouter,
  preMarket: preMarketChecklistRouter,
  pitAdvisor: pitAdvisorRouter,
  optionsFlow: optionsFlowRouter,
  morningSession: morningSessionRouter,
  swingWatchlist: swingWatchlistRouter,
  liquidityMap: liquidityMapRouter,
  historicalData: historicalDataRouter,
  backtester: backtesterRouter,
  duxScanner: duxScannerRouter,
  playbook: playbookRouter,
  schwab: schwabRouter,
  userAccounts: userAccountsRouter,
  weeklyPicks: weeklyPicksRouter,
  ictSupplyZone: ictSupplyZoneRouter,
  emaPullback: emaPullbackRouter,
  thetaMachine: thetaMachineRouter,
  decisionBench: decisionBenchRouter,
});
export type AppRouter = typeof appRouter;
