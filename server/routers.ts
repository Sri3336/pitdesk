import { TRPCError } from "@trpc/server";
import { runIntradayScan, scoreIntradayTicker } from "./intradayScanner";
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
  updateUserPassword,
  updateUserProfile,
  updateUserRole,
  upsertFibEmaAlert,
  getCriteriaWeights,
  updateCriteriaWeight,
  resetCriteriaWeights,
  getScanOutcomes,
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
        strategy: input.strategy,
        direction: input.direction,
        entryPrice: String(input.entryPrice),
        swingLow: input.swingLow ? String(input.swingLow) : undefined,
        swingHigh: input.swingHigh ? String(input.swingHigh) : undefined,
        quantity: input.quantity,
        target1: input.target1 ? String(input.target1) : undefined,
        target2: input.target2 ? String(input.target2) : undefined,
        stopLoss: input.stopLoss ? String(input.stopLoss) : undefined,
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
      const pnl =
        trade.direction === "long"
          ? (input.exitPrice - entryPrice) * qty
          : (entryPrice - input.exitPrice) * qty;
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
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  admin: adminRouter,
  profile: profileRouter,
  chart: chartRouter,
  velez: velezRouter,
  intraday: intradayRouter,
  trades: tradesRouter,
  fibAlerts: fibAlertsRouter,
  pcr: pcrRouter,
  analysis: analysisRouter,
  pcrScheduled: pcrScheduledRouter,
});

export type AppRouter = typeof appRouter;
