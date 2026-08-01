/**
 * tradeSetup.ts
 * Returns a "Trade Setup Card" for any ticker:
 *   - Price action structure (trend, HH/HL or LH/LL)
 *   - Volume vs 20-day average (relative volume)
 *   - RSI(14) — only flags extremes
 *   - ATR(14) — suggested strike distance for options
 *   - IVR (IV Rank) — is premium expensive or cheap?
 *   - VWAP signal (intraday, market hours only)
 *   - Strategy suggestion based on the above
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchBars(ticker: string, interval: "1d" | "5m", range: string): Promise<PriceBar[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { ticker, interval, range },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = result;
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];
    const timestamps: number[] = chart.timestamp ?? [];
    const q = chart.indicators?.quote?.[0] ?? {};
    return timestamps
      .map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString(),
        open: q.open?.[i] ?? 0,
        high: q.high?.[i] ?? 0,
        low: q.low?.[i] ?? 0,
        close: q.close?.[i] ?? 0,
        volume: q.volume?.[i] ?? 0,
      }))
      .filter((b) => b.close > 0);
  } catch {
    return [];
  }
}

function calcRSI(bars: PriceBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const closes = bars.map((b) => b.close);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function calcATR(bars: PriceBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calcRelVolume(bars: PriceBar[]): number {
  if (bars.length < 2) return 1;
  const today = bars[bars.length - 1].volume;
  const lookback = bars.slice(-21, -1);
  if (lookback.length === 0) return 1;
  const avg = lookback.reduce((s, b) => s + b.volume, 0) / lookback.length;
  if (avg === 0) return 1;
  return Math.round((today / avg) * 100) / 100;
}

function calcVWAP(bars: PriceBar[]): number | null {
  if (bars.length === 0) return null;
  let cumPV = 0;
  let cumVol = 0;
  for (const b of bars) {
    const typical = (b.high + b.low + b.close) / 3;
    cumPV += typical * b.volume;
    cumVol += b.volume;
  }
  if (cumVol === 0) return null;
  return Math.round((cumPV / cumVol) * 100) / 100;
}

/**
 * Detect price action structure from last 20 daily bars.
 * Returns: UPTREND | DOWNTREND | CONSOLIDATION
 * Also returns last 3 swing highs and lows for HH/HL or LH/LL detection.
 */
function detectTrend(bars: PriceBar[]): {
  trend: "UPTREND" | "DOWNTREND" | "CONSOLIDATION";
  structure: string;
  ma20: number;
  ma50: number;
  priceVsMa20: "ABOVE" | "BELOW";
  priceVsMa50: "ABOVE" | "BELOW";
} {
  if (bars.length < 10) {
    return { trend: "CONSOLIDATION", structure: "Insufficient data", ma20: 0, ma50: 0, priceVsMa20: "BELOW", priceVsMa50: "BELOW" };
  }
  const closes = bars.map((b) => b.close);
  const current = closes[closes.length - 1];

  const ma20Slice = closes.slice(-20);
  const ma20 = ma20Slice.length > 0 ? Math.round(ma20Slice.reduce((s, v) => s + v, 0) / ma20Slice.length * 100) / 100 : 0;

  const ma50Slice = closes.slice(-50);
  const ma50 = ma50Slice.length > 0 ? Math.round(ma50Slice.reduce((s, v) => s + v, 0) / ma50Slice.length * 100) / 100 : 0;

  // Simple trend: compare first half vs second half of last 20 bars
  const half = Math.floor(closes.length / 2);
  const firstHalfAvg = closes.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const secondHalfAvg = closes.slice(half).reduce((s, v) => s + v, 0) / (closes.length - half);

  const pctChange = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

  // Detect HH/HL or LH/LL using recent 10 bars
  const recent = bars.slice(-10);
  const highs = recent.map((b) => b.high);
  const lows = recent.map((b) => b.low);
  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);
  const priorHigh = Math.max(...bars.slice(-20, -10).map((b) => b.high));
  const priorLow = Math.min(...bars.slice(-20, -10).map((b) => b.low));

  const hhhl = recentHigh > priorHigh && recentLow > priorLow;
  const lhll = recentHigh < priorHigh && recentLow < priorLow;

  let trend: "UPTREND" | "DOWNTREND" | "CONSOLIDATION";
  let structure: string;

  if (pctChange > 0.03 || hhhl) {
    trend = "UPTREND";
    structure = hhhl ? "Higher Highs + Higher Lows (HH/HL)" : "Rising price action";
  } else if (pctChange < -0.03 || lhll) {
    trend = "DOWNTREND";
    structure = lhll ? "Lower Highs + Lower Lows (LH/LL)" : "Falling price action";
  } else {
    trend = "CONSOLIDATION";
    structure = "Range-bound / No clear direction";
  }

  return {
    trend,
    structure,
    ma20,
    ma50,
    priceVsMa20: current >= ma20 ? "ABOVE" : "BELOW",
    priceVsMa50: current >= ma50 ? "ABOVE" : "BELOW",
  };
}

// IV Range table for IVR calculation (52-week typical ranges)
const IV_RANGES: Record<string, { low: number; high: number }> = {
  SPY: { low: 10, high: 35 }, QQQ: { low: 12, high: 40 }, IWM: { low: 15, high: 45 },
  AAPL: { low: 18, high: 55 }, MSFT: { low: 18, high: 50 }, NVDA: { low: 35, high: 90 },
  AMZN: { low: 22, high: 60 }, GOOGL: { low: 20, high: 55 }, META: { low: 25, high: 70 },
  TSLA: { low: 45, high: 120 }, AMD: { low: 40, high: 95 }, INTC: { low: 25, high: 70 },
  MU: { low: 35, high: 85 }, SNDK: { low: 40, high: 130 }, WDC: { low: 35, high: 90 },
  AVGO: { low: 25, high: 65 }, ORCL: { low: 20, high: 55 }, CRM: { low: 25, high: 65 },
  NFLX: { low: 28, high: 75 }, UBER: { low: 35, high: 80 }, COIN: { low: 60, high: 150 },
  MSTR: { low: 70, high: 180 }, PLTR: { low: 50, high: 120 }, SMCI: { low: 55, high: 140 },
  GLD: { low: 8, high: 22 }, TLT: { low: 10, high: 28 }, XLE: { low: 18, high: 45 },
  SOXL: { low: 80, high: 200 }, TQQQ: { low: 50, high: 130 }, DRAM: { low: 30, high: 80 },
};

function computeIVR(ticker: string, currentIV: number): number {
  const range = IV_RANGES[ticker.toUpperCase()] ?? { low: 20, high: 80 };
  if (range.high === range.low) return 50;
  const ivr = ((currentIV - range.low) / (range.high - range.low)) * 100;
  return Math.round(Math.max(0, Math.min(100, ivr)));
}

function strategyFromSignals(
  trend: string,
  rsi: number | null,
  ivr: number,
  relVol: number
): { strategy: string; rationale: string; confidence: "HIGH" | "MEDIUM" | "LOW" } {
  const highIV = ivr >= 50;
  const lowIV = ivr < 30;
  const oversold = rsi !== null && rsi < 30;
  const overbought = rsi !== null && rsi > 70;
  const strongVol = relVol >= 1.5;

  if (trend === "UPTREND" && highIV && !overbought) {
    return {
      strategy: "Sell Cash-Secured Put or Bull Put Spread",
      rationale: `Uptrend confirmed + IV Rank ${ivr}% (premium rich). Sell puts below support to collect elevated premium with bullish bias.`,
      confidence: "HIGH",
    };
  }
  if (trend === "UPTREND" && strongVol && oversold) {
    return {
      strategy: "Buy Call Debit Spread",
      rationale: `Oversold bounce setup in uptrend with strong volume (${relVol}x avg). Low IV favors buying spreads.`,
      confidence: "HIGH",
    };
  }
  if (trend === "DOWNTREND" && highIV && !oversold) {
    return {
      strategy: "Sell Bear Call Spread",
      rationale: `Downtrend + IV Rank ${ivr}% (premium rich). Sell calls above resistance to collect premium with bearish bias.`,
      confidence: "HIGH",
    };
  }
  if (trend === "CONSOLIDATION" && highIV) {
    return {
      strategy: "Short Strangle or Iron Condor",
      rationale: `Range-bound price action + IV Rank ${ivr}% (premium rich). Sell both sides to collect theta while stock stays in range.`,
      confidence: "MEDIUM",
    };
  }
  if (trend === "UPTREND" && lowIV && strongVol) {
    return {
      strategy: "Buy Call or Call Debit Spread",
      rationale: `Uptrend + low IV (${ivr}%) + strong volume (${relVol}x). Cheap options — buy directional exposure.`,
      confidence: "MEDIUM",
    };
  }
  if (oversold && trend !== "DOWNTREND") {
    return {
      strategy: "Watch for Reversal — Bull Put Spread on Confirmation",
      rationale: `RSI ${rsi} (oversold). Wait for price to reclaim 20-day MA before entering. Use defined-risk spread.`,
      confidence: "LOW",
    };
  }
  if (overbought && trend !== "UPTREND") {
    return {
      strategy: "Watch for Fade — Bear Call Spread on Confirmation",
      rationale: `RSI ${rsi} (overbought) in non-uptrend. Wait for price to break below 20-day MA before entering.`,
      confidence: "LOW",
    };
  }
  return {
    strategy: "No Clear Setup — Wait",
    rationale: "Mixed signals. Price action, volume, and IV do not align for a high-conviction trade. Sit on hands.",
    confidence: "LOW",
  };
}

export const tradeSetupRouter = router({
  getSetup: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }) => {
      const { ticker } = input;

      // Fetch 3 months of daily bars for trend, RSI, ATR, volume
      const dailyBars = await fetchBars(ticker, "1d", "3mo");

      // Fetch today's intraday bars for VWAP
      const intradayBars = await fetchBars(ticker, "5m", "1d");

      // Current price
      const currentPrice = dailyBars.length > 0 ? dailyBars[dailyBars.length - 1].close : 0;
      const todayBar = dailyBars[dailyBars.length - 1];

      // Price action / trend
      const trendData = detectTrend(dailyBars);

      // RSI(14) on daily
      const rsi = calcRSI(dailyBars);

      // ATR(14) on daily
      const atr = Math.round(calcATR(dailyBars) * 100) / 100;
      const atrPct = currentPrice > 0 ? Math.round((atr / currentPrice) * 10000) / 100 : 0;

      // Suggested strike distance: 1.5x ATR for strangles, 1x ATR for spreads
      const suggestedStrangleDistance = Math.round(atr * 1.5);
      const suggestedSpreadDistance = Math.round(atr * 1.0);

      // Relative volume
      const relVol = calcRelVolume(dailyBars);

      // VWAP (intraday)
      const vwap = calcVWAP(intradayBars);
      const vwapSignal: "ABOVE" | "BELOW" | "N/A" =
        vwap === null ? "N/A" : currentPrice >= vwap ? "ABOVE" : "BELOW";

      // IV / IVR — fetch from quote
      let iv30 = 0;
      let ivr = 0;
      try {
        const quoteResult = await callDataApi("YahooFinance/get_stock_quote", {
          query: { symbol: ticker },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = (quoteResult as any)?.quoteResponse?.result?.[0] ?? quoteResult;
        iv30 = Math.round((q?.impliedSharesOutstanding ?? q?.impliedVolatility ?? 0) * 100) / 100;
        // Yahoo's impliedVolatility is sometimes in the options chain, not quote
        // Use a fallback: annualized HV from last 20 days as proxy for IV
        if (iv30 === 0 && dailyBars.length >= 21) {
          const closes = dailyBars.slice(-21).map((b) => b.close);
          const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
          const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
          const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / returns.length;
          iv30 = Math.round(Math.sqrt(variance * 252) * 100);
        }
        ivr = computeIVR(ticker, iv30);
      } catch {
        ivr = 50; // neutral fallback
      }

      // Strategy suggestion
      const suggestion = strategyFromSignals(trendData.trend, rsi, ivr, relVol);

      // RSI label
      let rsiLabel: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT" | "N/A" = "N/A";
      if (rsi !== null) {
        if (rsi < 30) rsiLabel = "OVERSOLD";
        else if (rsi > 70) rsiLabel = "OVERBOUGHT";
        else rsiLabel = "NEUTRAL";
      }

      // Volume label
      let volLabel: "STRONG" | "NORMAL" | "WEAK";
      if (relVol >= 1.5) volLabel = "STRONG";
      else if (relVol >= 0.7) volLabel = "NORMAL";
      else volLabel = "WEAK";

      return {
        ticker,
        currentPrice,
        dayChange: todayBar ? Math.round((todayBar.close - todayBar.open) * 100) / 100 : 0,
        dayChangePct: todayBar && todayBar.open > 0
          ? Math.round(((todayBar.close - todayBar.open) / todayBar.open) * 10000) / 100
          : 0,

        // Price action
        trend: trendData.trend,
        trendStructure: trendData.structure,
        ma20: trendData.ma20,
        ma50: trendData.ma50,
        priceVsMa20: trendData.priceVsMa20,
        priceVsMa50: trendData.priceVsMa50,

        // Volume
        relVol,
        volLabel,

        // RSI
        rsi,
        rsiLabel,

        // ATR
        atr,
        atrPct,
        suggestedStrangleDistance,
        suggestedSpreadDistance,

        // IV / IVR
        iv30,
        ivr,
        ivrLabel: ivr >= 50 ? "RICH" : ivr >= 30 ? "NORMAL" : "CHEAP",

        // VWAP
        vwap,
        vwapSignal,

        // Strategy
        suggestedStrategy: suggestion.strategy,
        strategyRationale: suggestion.rationale,
        strategyConfidence: suggestion.confidence,

        dataAsOf: new Date().toISOString(),
      };
    }),
});
