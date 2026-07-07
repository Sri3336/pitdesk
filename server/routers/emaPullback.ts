/**
 * EMA Pullback Scanner — 200/50 EMA Trend-Pullback with RSI Confirmation
 *
 * Strategy rules (from video analysis):
 *  1. Trend filter: price > 200 EMA AND 50 EMA > 200 EMA (confirmed uptrend with "daylight")
 *  2. Pullback: price retraces to touch/pierce the 50 EMA
 *  3. Momentum: RSI dips near/below 40 at the touch point
 *  4. Trigger: bullish reversal candle (engulfing or pin bar/hammer) closes at 50 EMA
 *  5. Entry on candle close, stop below pullback low, target 1.5–2× R:R
 *
 * Timeframes: 1H (primary) and 1D (swing confirmation)
 * Data: Yahoo Finance via callDataApi
 */

import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { callDataApi } from "../_core/dataApi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SignalStrength = "STRONG" | "MODERATE" | "WATCH" | "NONE";
export type CandlePattern = "BULLISH_ENGULFING" | "HAMMER" | "PIN_BAR" | "NONE";

export interface EmaPullbackSignal {
  ticker: string;
  timeframe: "1H" | "1D";
  signalStrength: SignalStrength;
  // EMA values
  ema50: number;
  ema200: number;
  currentPrice: number;
  // Trend
  trendConfirmed: boolean;   // price > 200 EMA AND 50 EMA > 200 EMA
  emaGap: number;            // % gap between 50 and 200 EMA (higher = stronger trend)
  // Pullback
  touchingEma50: boolean;    // price within 1.5% of 50 EMA
  pullbackDepth: number;     // % below recent swing high
  // Momentum
  rsi: number;
  rsiExhausted: boolean;     // RSI < 45 (dipping toward 40)
  // Candle pattern
  candlePattern: CandlePattern;
  hasBullishCandle: boolean;
  // Trade math
  entryPrice: number;
  stopLoss: number;          // below pullback low
  target1: number;           // 1.5× R:R
  target2: number;           // 2× R:R
  riskDollars: number;       // per share
  rewardDollars1: number;
  rewardDollars2: number;
  rrRatio1: number;
  rrRatio2: number;
  // Context
  dayChangePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  // Directional bias for options (useful for premium selling)
  optionsBias: "SELL_PUTS" | "WAIT" | "AVOID";
  optionsBiasReason: string;
}

// ─── Default scan universe ─────────────────────────────────────────────────────

const DEFAULT_TICKERS = [
  // Mega-cap tech
  "AAPL", "MSFT", "NVDA", "META", "GOOGL", "AMZN", "TSLA",
  // Semis
  "AMD", "AVGO", "MU", "QCOM", "AMAT", "LRCX",
  // Cloud / SaaS
  "CRM", "NOW", "SNOW", "PLTR",
  // Financials
  "JPM", "GS", "MS",
  // ETFs
  "SPY", "QQQ", "IWM", "XLK", "SMH",
  // Sri's active tickers
  "SNDK", "WDC", "ASML", "DRAM",
];

// ─── Math helpers ──────────────────────────────────────────────────────────────

function calcEMA(bars: PriceBar[], period: number): number[] {
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let ema = bars[0].close;
  emas.push(ema);
  for (let i = 1; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

function calcRSI(bars: PriceBar[], period = 14): number[] {
  const rsis: number[] = new Array(period).fill(50);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsis.push(100 - 100 / (1 + rs));
  }
  return rsis;
}

function detectCandlePattern(bar: PriceBar, prevBar: PriceBar): CandlePattern {
  const bodySize = Math.abs(bar.close - bar.open);
  const totalRange = bar.high - bar.low;
  if (totalRange === 0) return "NONE";

  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const bodyRatio = bodySize / totalRange;
  const lowerWickRatio = lowerWick / totalRange;

  // Bullish engulfing: current bullish candle body engulfs prior bearish candle body
  const prevBody = Math.abs(prevBar.close - prevBar.open);
  if (
    bar.close > bar.open &&                        // current is bullish
    prevBar.close < prevBar.open &&                // prev was bearish
    bar.open < prevBar.close &&                    // opens below prev close
    bar.close > prevBar.open &&                    // closes above prev open
    bodySize > prevBody * 0.8                      // body is substantial
  ) {
    return "BULLISH_ENGULFING";
  }

  // Hammer: small body at top, long lower wick (>= 2× body), little upper wick
  if (
    lowerWickRatio >= 0.55 &&
    upperWick <= bodySize * 0.5 &&
    bodyRatio <= 0.35
  ) {
    return "HAMMER";
  }

  // Pin bar: very long lower wick, tiny body
  if (lowerWickRatio >= 0.65 && bodyRatio <= 0.2) {
    return "PIN_BAR";
  }

  return "NONE";
}

// ─── Data fetcher ──────────────────────────────────────────────────────────────

async function fetchBars(symbol: string, interval: "1h" | "1d", range: string): Promise<PriceBar[]> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, region: "US", interval, range, includeAdjustedClose: "true" },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return [];
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const bars: PriceBar[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      if (!quote.close[i]) continue;
      bars.push({
        date: new Date(timestamp[i] * 1000).toISOString(),
        open: quote.open[i] ?? quote.close[i],
        high: quote.high[i] ?? quote.close[i],
        low: quote.low[i] ?? quote.close[i],
        close: quote.close[i],
        volume: quote.volume[i] ?? 0,
      });
    }
    return bars;
  } catch {
    return [];
  }
}

// ─── Core analysis ────────────────────────────────────────────────────────────

async function analyzeEmaPullback(ticker: string, timeframe: "1H" | "1D"): Promise<EmaPullbackSignal | null> {
  const interval = timeframe === "1H" ? "1h" : "1d";
  // Need enough bars: 200 EMA needs 200+ bars; for 1H that's ~200 hours (~25 trading days)
  const range = timeframe === "1H" ? "60d" : "1y";

  const bars = await fetchBars(ticker, interval, range);
  if (bars.length < 220) return null;

  const ema50arr = calcEMA(bars, 50);
  const ema200arr = calcEMA(bars, 200);
  const rsiArr = calcRSI(bars, 14);

  const last = bars.length - 1;
  const prev = last - 1;

  const currentBar = bars[last];
  const prevBar = bars[prev];

  const ema50 = ema50arr[last];
  const ema200 = ema200arr[last];
  const rsi = rsiArr[last];
  const currentPrice = currentBar.close;

  // ── 1. Trend filter ──────────────────────────────────────────────────────────
  const priceAbove200 = currentPrice > ema200;
  const ema50Above200 = ema50 > ema200;
  const trendConfirmed = priceAbove200 && ema50Above200;
  const emaGap = ema200 > 0 ? ((ema50 - ema200) / ema200) * 100 : 0;

  // ── 2. Pullback — is price near the 50 EMA? ──────────────────────────────────
  const distFromEma50 = Math.abs(currentPrice - ema50) / ema50 * 100;
  const touchingEma50 = distFromEma50 <= 2.0; // within 2% of 50 EMA

  // Find recent swing high (last 20 bars)
  const lookback = Math.min(20, last);
  const recentHigh = Math.max(...bars.slice(last - lookback, last + 1).map(b => b.high));
  const pullbackDepth = recentHigh > 0 ? ((recentHigh - currentPrice) / recentHigh) * 100 : 0;

  // ── 3. RSI momentum exhaustion ───────────────────────────────────────────────
  const rsiExhausted = rsi <= 45 && rsi >= 25; // dipping toward 40, not crashed

  // ── 4. Candle pattern ────────────────────────────────────────────────────────
  const candlePattern = detectCandlePattern(currentBar, prevBar);
  const hasBullishCandle = candlePattern !== "NONE";

  // ── 5. Signal strength ───────────────────────────────────────────────────────
  let signalStrength: SignalStrength = "NONE";
  if (trendConfirmed && touchingEma50 && rsiExhausted && hasBullishCandle) {
    signalStrength = emaGap >= 3 ? "STRONG" : "MODERATE";
  } else if (trendConfirmed && touchingEma50 && (rsiExhausted || hasBullishCandle)) {
    signalStrength = "WATCH";
  } else if (trendConfirmed && touchingEma50) {
    signalStrength = "WATCH";
  }

  // ── 6. Trade math ────────────────────────────────────────────────────────────
  const entryPrice = currentPrice;
  // Stop: below the pullback low (lowest low in last 5 bars)
  const recentLow = Math.min(...bars.slice(last - 5, last + 1).map(b => b.low));
  const stopBuffer = (entryPrice - recentLow) * 0.1; // 10% buffer below low
  const stopLoss = recentLow - stopBuffer;
  const riskDollars = entryPrice - stopLoss;
  const target1 = entryPrice + riskDollars * 1.5;
  const target2 = entryPrice + riskDollars * 2.0;
  const rewardDollars1 = target1 - entryPrice;
  const rewardDollars2 = target2 - entryPrice;
  const rrRatio1 = riskDollars > 0 ? rewardDollars1 / riskDollars : 0;
  const rrRatio2 = riskDollars > 0 ? rewardDollars2 / riskDollars : 0;

  // ── 7. Volume ────────────────────────────────────────────────────────────────
  const recentVolumes = bars.slice(last - 20, last).map(b => b.volume).filter(v => v > 0);
  const avgVolume = recentVolumes.length > 0
    ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
    : 0;
  const relativeVolume = avgVolume > 0 ? currentBar.volume / avgVolume : 1;

  // Day change
  const dayChangePercent = prevBar.close > 0
    ? ((currentBar.close - prevBar.close) / prevBar.close) * 100
    : 0;

  // ── 8. Options bias ──────────────────────────────────────────────────────────
  let optionsBias: "SELL_PUTS" | "WAIT" | "AVOID" = "AVOID";
  let optionsBiasReason = "Trend not confirmed — avoid premium selling";
  if (trendConfirmed && signalStrength !== "NONE") {
    if (signalStrength === "STRONG" || signalStrength === "MODERATE") {
      optionsBias = "SELL_PUTS";
      optionsBiasReason = "Strong uptrend with 50 EMA support — selling puts below EMA is favorable";
    } else {
      optionsBias = "WAIT";
      optionsBiasReason = "Trend intact but pullback not confirmed — wait for RSI/candle trigger";
    }
  } else if (!trendConfirmed) {
    optionsBias = "AVOID";
    optionsBiasReason = "Price below 200 EMA or 50/200 EMA not aligned — avoid selling puts";
  }

  return {
    ticker,
    timeframe,
    signalStrength,
    ema50: Math.round(ema50 * 100) / 100,
    ema200: Math.round(ema200 * 100) / 100,
    currentPrice: Math.round(currentPrice * 100) / 100,
    trendConfirmed,
    emaGap: Math.round(emaGap * 100) / 100,
    touchingEma50,
    pullbackDepth: Math.round(pullbackDepth * 100) / 100,
    rsi: Math.round(rsi * 10) / 10,
    rsiExhausted,
    candlePattern,
    hasBullishCandle,
    entryPrice: Math.round(entryPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    target1: Math.round(target1 * 100) / 100,
    target2: Math.round(target2 * 100) / 100,
    riskDollars: Math.round(riskDollars * 100) / 100,
    rewardDollars1: Math.round(rewardDollars1 * 100) / 100,
    rewardDollars2: Math.round(rewardDollars2 * 100) / 100,
    rrRatio1: Math.round(rrRatio1 * 100) / 100,
    rrRatio2: Math.round(rrRatio2 * 100) / 100,
    dayChangePercent: Math.round(dayChangePercent * 100) / 100,
    volume: currentBar.volume,
    avgVolume: Math.round(avgVolume),
    relativeVolume: Math.round(relativeVolume * 100) / 100,
    optionsBias,
    optionsBiasReason,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const emaPullbackRouter = router({
  scan: publicProcedure
    .input(z.object({
      tickers: z.array(z.string()).optional(),
      timeframe: z.enum(["1H", "1D"]).default("1D"),
      minStrength: z.enum(["STRONG", "MODERATE", "WATCH", "NONE"]).default("WATCH"),
    }))
    .query(async ({ input }) => {
      const tickers = (input.tickers && input.tickers.length > 0)
        ? input.tickers.map(t => t.toUpperCase())
        : DEFAULT_TICKERS;

      // Process in parallel batches of 6 to avoid rate limits
      const results: EmaPullbackSignal[] = [];
      const batchSize = 6;
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(t => analyzeEmaPullback(t, input.timeframe))
        );
        for (const r of batchResults) {
          if (r) results.push(r);
        }
      }

      // Filter by minimum signal strength
      const strengthOrder: Record<SignalStrength, number> = {
        STRONG: 3, MODERATE: 2, WATCH: 1, NONE: 0,
      };
      const minStrengthVal = strengthOrder[input.minStrength];
      const filtered = results.filter(r => strengthOrder[r.signalStrength] >= minStrengthVal);

      // Sort: STRONG first, then MODERATE, then WATCH; within same strength sort by emaGap desc
      filtered.sort((a, b) => {
        const strengthDiff = strengthOrder[b.signalStrength] - strengthOrder[a.signalStrength];
        if (strengthDiff !== 0) return strengthDiff;
        return b.emaGap - a.emaGap;
      });

      return {
        signals: filtered,
        scannedCount: results.length,
        signalCount: filtered.length,
        timeframe: input.timeframe,
        scannedAt: new Date().toISOString(),
      };
    }),

  analyzeTicker: publicProcedure
    .input(z.object({
      ticker: z.string(),
      timeframe: z.enum(["1H", "1D"]).default("1D"),
    }))
    .query(async ({ input }) => {
      const signal = await analyzeEmaPullback(input.ticker.toUpperCase(), input.timeframe);
      return signal;
    }),
});
