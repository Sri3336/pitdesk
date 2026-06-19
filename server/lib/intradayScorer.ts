/**
 * PitDesk Intraday Trend Scanner — Scoring Engine
 *
 * Implements the 9-criteria weighted scoring model with institutional trap detection.
 * Each criterion has a configurable weight; the default weights are defined below.
 * The self-tuning engine updates weights in the criteria_weights DB table over time.
 *
 * Scoring:
 *   A Setup  ≥ 9.0 weighted points (no trap)
 *   B Setup  6.5–8.9 (or A downgraded by trap)
 *   C Setup  4.0–6.4 (or B downgraded by trap)
 *   No Trade < 4.0
 */

import { callDataApi } from "../_core/dataApi";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Grade = "A" | "B" | "C" | "none";
export type Direction = "bullish" | "bearish" | "neutral";

export interface CriterionResult {
  pass: boolean;
  value: number | string;
  weight: number;
  points: number; // weight if pass, 0 if fail
  description: string;
}

export interface TrapSignal {
  detected: boolean;
  type?: "stop_hunt" | "false_breakout" | "absorption" | "gap_fill";
  details?: string;
}

export interface ScanSetup {
  ticker: string;
  scannedAt: Date;
  price: number;
  vwap: number;
  rvol: number;
  rsi: number;
  atr: number;
  direction: Direction;
  weightedScore: number;
  maxScore: number;
  grade: Grade;
  criteria: Record<string, CriterionResult>;
  trap: TrapSignal;
  // Trade setup levels
  entryLow: number;
  entryHigh: number;
  stopLevel: number;
  target1: number;
  target2: number;
  // Options suggestion
  optionStrategy: string;
  optionStrike: number;
  optionExpiry: string;
  optionDebit: number;
  optionMaxProfit: number;
  optionMaxLoss: number;
  // Raw bar data for charts
  intradayBars: IntradayBar[];
  dailyBars: DailyBar[];
}

export interface IntradayBar {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DailyBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Default Weights ──────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: Record<string, number> = {
  dailyTrend:       1.5,  // price vs SMA20 (daily trend)
  emaStack15m:      1.5,  // EMA9 vs EMA21 on 15-min (momentum)
  vwapPosition:     1.0,  // price vs intraday VWAP
  relativeVolume:   1.5,  // RVOL ≥ 1.5x (institutional participation)
  rsiMomentum:      1.0,  // RSI 50–70 bull / 30–50 bear
  priceStructure:   1.0,  // higher highs/lows (daily swing structure)
  entryQuality:        1.0,  // price within 0.5 ATR of VWAP or SMA20 (not chasing)
  candleConfirm:        2.0,  // last 15-min bar closes in top 60% (bull) / bottom 40% (bear) — highest weight PA signal
  keyLevelProximity:    1.0,  // price within 0.25 ATR of prior swing high/low or round number (VCP-style)
  atrExpansion:         1.0,  // ATR ≥ 1.2x 5-day avg (volatility expanding)
};

export const MAX_SCORE = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0); // 12.0 (10 criteria)

// ─── Technical Helpers ────────────────────────────────────────────────────────

function sma(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeVWAP(bars: IntradayBar[]): number {
  let cumTPV = 0, cumVol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumTPV += tp * b.volume;
    cumVol += b.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : bars[bars.length - 1]?.close ?? 0;
}

function computeATR(bars: DailyBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  return sma(trs, period);
}

function computeRVOL(todayVolume: number, avgVolume: number): number {
  if (avgVolume === 0) return 1;
  return todayVolume / avgVolume;
}

// ─── Trap Detector ────────────────────────────────────────────────────────────

function detectTrap(
  bars15m: IntradayBar[],
  dailyBars: DailyBar[],
  currentPrice: number,
  vwap: number
): TrapSignal {
  if (bars15m.length < 4 || dailyBars.length < 2) return { detected: false };

  const recent = bars15m.slice(-4);
  const prevClose = dailyBars[dailyBars.length - 2]?.close ?? currentPrice;
  const todayOpen = dailyBars[dailyBars.length - 1]?.open ?? currentPrice;

  // 1. Gap Fill Trap: gap > 3% and volume declining in first 30 min
  const gapPct = Math.abs(todayOpen - prevClose) / prevClose;
  if (gapPct > 0.03 && bars15m.length >= 3) {
    const firstBarVol = bars15m[0].volume;
    const secondBarVol = bars15m[1]?.volume ?? firstBarVol;
    const thirdBarVol = bars15m[2]?.volume ?? secondBarVol;
    if (thirdBarVol < secondBarVol && secondBarVol < firstBarVol) {
      return {
        detected: true,
        type: "gap_fill",
        details: `Gap of ${(gapPct * 100).toFixed(1)}% with declining volume — potential gap fill reversal`,
      };
    }
  }

  // 2. Stop Hunt: wick spike below/above key level with no follow-through
  const lastBar = recent[recent.length - 1];
  const prevBar = recent[recent.length - 2];
  const wickDown = lastBar.low < prevBar.low * 0.998 && lastBar.close > (lastBar.low + lastBar.high) / 2;
  const wickUp   = lastBar.high > prevBar.high * 1.002 && lastBar.close < (lastBar.low + lastBar.high) / 2;
  if (wickDown || wickUp) {
    const volSpike = lastBar.volume > (recent.slice(0, -1).reduce((a, b) => a + b.volume, 0) / Math.max(recent.length - 1, 1)) * 1.8;
    if (volSpike) {
      return {
        detected: true,
        type: "stop_hunt",
        details: wickDown
          ? "Volume spike on downward wick — possible stop hunt below support"
          : "Volume spike on upward wick — possible stop hunt above resistance",
      };
    }
  }

  // 3. False Breakout: breakout bar closes back inside range within 2 bars
  if (recent.length >= 3) {
    const breakoutBar = recent[recent.length - 3];
    const followBar1  = recent[recent.length - 2];
    const followBar2  = recent[recent.length - 1];
    const rangeHigh = Math.max(...recent.slice(0, -3).map(b => b.high));
    const rangeLow  = Math.min(...recent.slice(0, -3).map(b => b.low));
    const brokeUp   = breakoutBar.close > rangeHigh && followBar2.close < rangeHigh;
    const brokeDown = breakoutBar.close < rangeLow  && followBar2.close > rangeLow;
    if ((brokeUp || brokeDown) && breakoutBar.volume < followBar1.volume * 1.5) {
      return {
        detected: true,
        type: "false_breakout",
        details: brokeUp
          ? "Price broke above range but closed back inside — low-volume false breakout"
          : "Price broke below range but closed back inside — low-volume false breakdown",
      };
    }
  }

  // 4. Absorption: price stalls at level with rising volume but no progress
  if (recent.length >= 3) {
    const priceRange = Math.max(...recent.map(b => b.high)) - Math.min(...recent.map(b => b.low));
    const avgPrice   = recent.reduce((a, b) => a + b.close, 0) / recent.length;
    const stalling   = priceRange / avgPrice < 0.005; // less than 0.5% range
    const volRising  = recent[recent.length - 1].volume > recent[0].volume * 1.3;
    if (stalling && volRising) {
      return {
        detected: true,
        type: "absorption",
        details: "Price stalling with rising volume — possible institutional absorption/distribution",
      };
    }
  }

  return { detected: false };
}

// ─── Grade Calculator ─────────────────────────────────────────────────────────

function calculateGrade(score: number, maxScore: number, trapDetected: boolean): Grade {
  const pct = score / maxScore;
  let grade: Grade;
  if (pct >= 9.0 / 11.5)      grade = "A";
  else if (pct >= 6.5 / 11.5) grade = "B";
  else if (pct >= 4.0 / 11.5) grade = "C";
  else                          grade = "none";

  // Downgrade by one level if trap detected
  if (trapDetected) {
    if (grade === "A") grade = "B";
    else if (grade === "B") grade = "C";
    else if (grade === "C") grade = "none";
  }
  return grade;
}

// ─── Options Suggestion ───────────────────────────────────────────────────────

function suggestOption(
  direction: Direction,
  price: number,
  atr: number,
  grade: Grade
): { strategy: string; strike: number; expiry: string; debit: number; maxProfit: number; maxLoss: number } {
  // Next monthly expiry (3rd Friday, ~21–35 DTE)
  const now = new Date();
  const expDate = new Date(now);
  expDate.setDate(expDate.getDate() + 28);
  // Round to nearest Friday
  const day = expDate.getDay();
  expDate.setDate(expDate.getDate() + (5 - day + 7) % 7);
  const expiry = expDate.toISOString().split("T")[0];

  if (direction === "bullish") {
    // Bull Call Spread: buy ATM call, sell 5% OTM call
    const buyStrike  = Math.round(price / 5) * 5; // round to nearest $5
    const sellStrike = Math.round(price * 1.05 / 5) * 5;
    const spreadWidth = sellStrike - buyStrike;
    const debit = parseFloat((spreadWidth * 0.35).toFixed(2)); // ~35% of width
    return {
      strategy: "Bull Call Spread",
      strike: buyStrike,
      expiry,
      debit,
      maxProfit: parseFloat((spreadWidth - debit).toFixed(2)),
      maxLoss: debit,
    };
  } else if (direction === "bearish") {
    // Bear Put Spread: buy ATM put, sell 5% OTM put
    const buyStrike  = Math.round(price / 5) * 5;
    const sellStrike = Math.round(price * 0.95 / 5) * 5;
    const spreadWidth = buyStrike - sellStrike;
    const debit = parseFloat((spreadWidth * 0.35).toFixed(2));
    return {
      strategy: "Bear Put Spread",
      strike: buyStrike,
      expiry,
      debit,
      maxProfit: parseFloat((spreadWidth - debit).toFixed(2)),
      maxLoss: debit,
    };
  } else {
    // Neutral: Iron Condor suggestion
    const callSell = Math.round(price * 1.03 / 5) * 5;
    const putSell  = Math.round(price * 0.97 / 5) * 5;
    const credit   = parseFloat((atr * 0.8).toFixed(2));
    return {
      strategy: "Iron Condor",
      strike: callSell,
      expiry,
      debit: -credit, // negative = credit received
      maxProfit: credit,
      maxLoss: parseFloat(((callSell - putSell) - credit).toFixed(2)),
    };
  }
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

export async function scoreTicker(
  symbol: string,
  weights: Record<string, number> = DEFAULT_WEIGHTS
): Promise<ScanSetup | null> {
  try {
    // Fetch daily bars (60 days for SMA-20, SMA-50, ATR, RVOL)
    const dailyResp = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol,
        interval: "1d",
        range: "3mo",
        region: "US",
        includeAdjustedClose: "true",
      },
    });

    const dailyResult = (dailyResp as any)?.chart?.result?.[0];
    if (!dailyResult) return null;

    const dailyTimestamps: number[] = dailyResult.timestamp ?? [];
    const dailyQuotes = dailyResult.indicators?.quote?.[0];
    if (!dailyQuotes || dailyTimestamps.length < 21) return null;

    const dailyBars: DailyBar[] = dailyTimestamps.map((t: number, i: number) => ({
      time: t * 1000,
      open:   dailyQuotes.open?.[i]   ?? 0,
      high:   dailyQuotes.high?.[i]   ?? 0,
      low:    dailyQuotes.low?.[i]    ?? 0,
      close:  dailyQuotes.close?.[i]  ?? 0,
      volume: dailyQuotes.volume?.[i] ?? 0,
    })).filter(b => b.close > 0);

    // Fetch 15-min intraday bars (today)
    const intradayResp = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol,
        interval: "15m",
        range: "1d",
        region: "US",
      },
    });

    const intradayResult = (intradayResp as any)?.chart?.result?.[0];
    const intradayTimestamps: number[] = intradayResult?.timestamp ?? [];
    const intradayQuotes = intradayResult?.indicators?.quote?.[0];

    const intradayBars: IntradayBar[] = intradayTimestamps.length > 0 && intradayQuotes
      ? intradayTimestamps.map((t: number, i: number) => ({
          time:   t * 1000,
          open:   intradayQuotes.open?.[i]   ?? 0,
          high:   intradayQuotes.high?.[i]   ?? 0,
          low:    intradayQuotes.low?.[i]    ?? 0,
          close:  intradayQuotes.close?.[i]  ?? 0,
          volume: intradayQuotes.volume?.[i] ?? 0,
        })).filter(b => b.close > 0)
      : [];

    // ── Compute Indicators ──────────────────────────────────────────────────

    const closes = dailyBars.map(b => b.close);
    const volumes = dailyBars.map(b => b.volume);
    const currentPrice = closes[closes.length - 1];

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);

    // EMA stack on 15-min
    const intraCloses = intradayBars.map(b => b.close);
    const ema9_15m  = intraCloses.length >= 9  ? ema(intraCloses, 9)  : currentPrice;
    const ema21_15m = intraCloses.length >= 21 ? ema(intraCloses, 21) : currentPrice;

    // VWAP (intraday)
    const vwap = intradayBars.length > 0 ? computeVWAP(intradayBars) : currentPrice;

    // RVOL
    const avgVol20 = sma(volumes.slice(0, -1), 20); // exclude today
    const todayVol = volumes[volumes.length - 1];
    const rvol = computeRVOL(todayVol, avgVol20);

    // RSI on daily closes
    const rsiValue = rsi(closes, 14);

    // ATR
    const atrValue = computeATR(dailyBars, 14);
    const atrAvg5  = computeATR(dailyBars.slice(-7), 5);

    // Price structure: higher highs + higher lows (last 3 daily swings)
    const last3Highs = dailyBars.slice(-4).map(b => b.high);
    const last3Lows  = dailyBars.slice(-4).map(b => b.low);
    const higherHighs = last3Highs[3] > last3Highs[2] && last3Highs[2] > last3Highs[1];
    const higherLows  = last3Lows[3]  > last3Lows[2]  && last3Lows[2]  > last3Lows[1];
    const lowerLows   = last3Lows[3]  < last3Lows[2]  && last3Lows[2]  < last3Lows[1];
    const lowerHighs  = last3Highs[3] < last3Highs[2] && last3Highs[2] < last3Highs[1];

    // Volume trend: up-bars have more volume than down-bars (last 5 intraday bars)
    const last5 = intradayBars.slice(-5);
    let upVol = 0, downVol = 0;
    for (let i = 1; i < last5.length; i++) {
      if (last5[i].close >= last5[i - 1].close) upVol += last5[i].volume;
      else downVol += last5[i].volume;
    }

    // ── Price Action: Entry Quality ─────────────────────────────────────────
    // Is price within 0.5 ATR of VWAP or SMA20? Rewards buying near the level,
    // penalises chasing an extended move.
    const distToVwap  = Math.abs(currentPrice - vwap);
    const distToSma20 = Math.abs(currentPrice - sma20);
    const entryNearLevel = distToVwap <= atrValue * 0.5 || distToSma20 <= atrValue * 0.5;
    const closerLevel = distToVwap <= distToSma20 ? `VWAP $${vwap.toFixed(2)}` : `SMA20 $${sma20.toFixed(2)}`;
    const closerDist  = Math.min(distToVwap, distToSma20);

    // ── Price Action: Candle Confirmation ───────────────────────────────────
    // Last completed 15-min bar: close in top 60% of bar range = bullish PA.
    // Close in bottom 40% = bearish PA. Uses daily last bar when no intraday.
    const lastIntraBar = intradayBars[intradayBars.length - 1];
    const lastDailyBar = dailyBars[dailyBars.length - 1];
    const confirmBar   = lastIntraBar ?? lastDailyBar;
    const barRange     = confirmBar ? confirmBar.high - confirmBar.low : 0;
    const closePos     = barRange > 0
      ? (confirmBar.close - confirmBar.low) / barRange  // 0 = bottom, 1 = top
      : 0.5;
    // Bull confirmation: close in top 60% (closePos ≥ 0.40)
    // Bear confirmation: close in bottom 40% (closePos ≤ 0.40)
    const candleBullish = closePos >= 0.40;
    const candleBearish = closePos <= 0.40;

    // ── Price Action: Key Level Proximity ──────────────────────────────────
    // Is price within 0.25 ATR of a prior swing high/low (last 20 daily bars)
    // or a round number ($5 increments)? Catches VCP-style tight consolidation
    // at resistance/support — the Velez setup.
    const swingWindow = dailyBars.slice(-21, -1); // last 20 bars excluding today
    const swingHighs  = swingWindow.map(b => b.high);
    const swingLows   = swingWindow.map(b => b.low);
    // Identify swing pivot highs (local maxima) and lows (local minima)
    const pivotHighs: number[] = [];
    const pivotLows:  number[] = [];
    for (let i = 1; i < swingHighs.length - 1; i++) {
      if (swingHighs[i] >= swingHighs[i - 1] && swingHighs[i] >= swingHighs[i + 1]) {
        pivotHighs.push(swingHighs[i]);
      }
      if (swingLows[i] <= swingLows[i - 1] && swingLows[i] <= swingLows[i + 1]) {
        pivotLows.push(swingLows[i]);
      }
    }
    // Round numbers: nearest $5 and $10 levels
    const nearestFive = Math.round(currentPrice / 5) * 5;
    const roundLevels = [nearestFive - 5, nearestFive, nearestFive + 5];
    // Combine all key levels
    const allKeyLevels = [...pivotHighs, ...pivotLows, ...roundLevels];
    const proximityThreshold = atrValue * 0.25;
    const nearestKeyLevel = allKeyLevels.reduce((best, lvl) => {
      const dist = Math.abs(currentPrice - lvl);
      return dist < Math.abs(currentPrice - best) ? lvl : best;
    }, allKeyLevels[0] ?? currentPrice);
    const distToKeyLevel  = Math.abs(currentPrice - (nearestKeyLevel ?? currentPrice));
    const atKeyLevel      = distToKeyLevel <= proximityThreshold;
    const keyLevelType    = pivotHighs.includes(nearestKeyLevel) ? "swing high"
                          : pivotLows.includes(nearestKeyLevel)  ? "swing low"
                          : "round number";

    // ── Determine Direction ─────────────────────────────────────────────────
    const bullSignals = [
      currentPrice > sma20,
      ema9_15m > ema21_15m,
      currentPrice > vwap,
      rsiValue > 50 && rsiValue < 70,
    ].filter(Boolean).length;

    const bearSignals = [
      currentPrice < sma20,
      ema9_15m < ema21_15m,
      currentPrice < vwap,
      rsiValue < 50 && rsiValue > 30,
    ].filter(Boolean).length;

    const direction: Direction =
      bullSignals >= 3 ? "bullish" :
      bearSignals >= 3 ? "bearish" : "neutral";

    // ── Score 9 Criteria ────────────────────────────────────────────────────

    const w = weights;

    const criteriaResults: Record<string, CriterionResult> = {
      dailyTrend: {
        pass: direction === "bullish" ? currentPrice > sma20 : direction === "bearish" ? currentPrice < sma20 : false,
        value: `Price $${currentPrice.toFixed(2)} vs SMA20 $${sma20.toFixed(2)}`,
        weight: w.dailyTrend,
        points: 0,
        description: "Daily trend: price above/below 20-day SMA",
      },
      emaStack15m: {
        pass: direction === "bullish" ? ema9_15m > ema21_15m : direction === "bearish" ? ema9_15m < ema21_15m : false,
        value: `EMA9 ${ema9_15m.toFixed(2)} vs EMA21 ${ema21_15m.toFixed(2)}`,
        weight: w.emaStack15m,
        points: 0,
        description: "15-min EMA stack: EMA9 vs EMA21 alignment",
      },
      vwapPosition: {
        pass: direction === "bullish" ? currentPrice > vwap : direction === "bearish" ? currentPrice < vwap : false,
        value: `Price $${currentPrice.toFixed(2)} vs VWAP $${vwap.toFixed(2)}`,
        weight: w.vwapPosition,
        points: 0,
        description: "Intraday VWAP: price above/below VWAP",
      },
      relativeVolume: {
        pass: rvol >= 1.5,
        value: `RVOL ${rvol.toFixed(2)}x`,
        weight: w.relativeVolume,
        points: 0,
        description: "Relative volume ≥ 1.5x 20-day average",
      },
      rsiMomentum: {
        pass: direction === "bullish" ? (rsiValue >= 50 && rsiValue <= 70) :
              direction === "bearish" ? (rsiValue >= 30 && rsiValue <= 50) : false,
        value: `RSI ${rsiValue.toFixed(1)}`,
        weight: w.rsiMomentum,
        points: 0,
        description: "RSI momentum: 50–70 bullish, 30–50 bearish",
      },
      priceStructure: {
        pass: direction === "bullish" ? (higherHighs || higherLows) :
              direction === "bearish" ? (lowerLows || lowerHighs) : false,
        value: direction === "bullish"
          ? `HH: ${higherHighs}, HL: ${higherLows}`
          : `LL: ${lowerLows}, LH: ${lowerHighs}`,
        weight: w.priceStructure,
        points: 0,
        description: "Price structure: higher highs/lows (bull) or lower lows/highs (bear)",
      },
      entryQuality: {
        // Price within 0.5 ATR of VWAP or SMA20 — rewards buying near the level,
        // penalises chasing an extended move.
        pass: entryNearLevel,
        value: `$${closerDist.toFixed(2)} from ${closerLevel} (0.5 ATR = $${(atrValue * 0.5).toFixed(2)})`,
        weight: w.entryQuality,
        points: 0,
        description: "Entry quality: price within 0.5 ATR of VWAP or SMA20 — not chasing",
      },
      candleConfirm: {
        // Last 15-min (or daily) bar closes in top 60% of range for bull,
        // bottom 40% for bear — classic price action confirmation.
        pass: direction === "bullish" ? candleBullish :
              direction === "bearish" ? candleBearish : false,
        value: `Close position ${(closePos * 100).toFixed(0)}% of bar range (${confirmBar === lastIntraBar ? "15m" : "daily"} bar)`,
        weight: w.candleConfirm,
        points: 0,
        description: "Candle confirmation: close in top 60% of bar (bull) or bottom 40% (bear)",
      },
      keyLevelProximity: {
        // Price within 0.25 ATR of a prior swing high/low or round number.
        // Catches VCP-style tight consolidation at resistance/support.
        pass: atKeyLevel,
        value: atKeyLevel
          ? `$${distToKeyLevel.toFixed(2)} from ${keyLevelType} $${(nearestKeyLevel ?? currentPrice).toFixed(2)} (≤ 0.25 ATR = $${proximityThreshold.toFixed(2)})`
          : `$${distToKeyLevel.toFixed(2)} from nearest ${keyLevelType} $${(nearestKeyLevel ?? currentPrice).toFixed(2)} (threshold $${proximityThreshold.toFixed(2)})`,
        weight: w.keyLevelProximity,
        points: 0,
        description: "Key level proximity: price within 0.25 ATR of swing high/low or round number",
      },
      atrExpansion: {
        pass: atrValue >= atrAvg5 * 1.2,
        value: `ATR $${atrValue.toFixed(2)} vs 5d avg $${atrAvg5.toFixed(2)}`,
        weight: w.atrExpansion,
        points: 0,
        description: "ATR expansion: today's ATR ≥ 1.2x 5-day average",
      },
    };

    // Assign points
    let totalScore = 0;
    for (const key of Object.keys(criteriaResults)) {
      const c = criteriaResults[key];
      c.points = c.pass ? c.weight : 0;
      totalScore += c.points;
    }

    // ── Trap Detection ──────────────────────────────────────────────────────
    const trap = detectTrap(intradayBars, dailyBars, currentPrice, vwap);

    // ── Grade ───────────────────────────────────────────────────────────────
    const maxScore = Object.values(w).reduce((a, b) => a + b, 0);
    const grade = calculateGrade(totalScore, maxScore, trap.detected);

    // ── Trade Setup Levels ──────────────────────────────────────────────────
    const entryLow  = direction === "bullish" ? vwap : currentPrice - atrValue * 0.3;
    const entryHigh = direction === "bullish" ? vwap + atrValue * 0.3 : vwap;
    const stopLevel = direction === "bullish" ? vwap - atrValue * 0.5 : vwap + atrValue * 0.5;
    const risk      = Math.abs(((entryLow + entryHigh) / 2) - stopLevel);
    const target1   = direction === "bullish" ? entryHigh + risk * 1.5 : entryLow - risk * 1.5;
    const target2   = direction === "bullish" ? entryHigh + risk * 2.5 : entryLow - risk * 2.5;

    // ── Options Suggestion ──────────────────────────────────────────────────
    const opt = suggestOption(direction, currentPrice, atrValue, grade);

    return {
      ticker: symbol,
      scannedAt: new Date(),
      price: currentPrice,
      vwap,
      rvol,
      rsi: rsiValue,
      atr: atrValue,
      direction,
      weightedScore: totalScore,
      maxScore,
      grade,
      criteria: criteriaResults,
      trap,
      entryLow,
      entryHigh,
      stopLevel,
      target1,
      target2,
      optionStrategy: opt.strategy,
      optionStrike: opt.strike,
      optionExpiry: opt.expiry,
      optionDebit: opt.debit,
      optionMaxProfit: opt.maxProfit,
      optionMaxLoss: opt.maxLoss,
      intradayBars,
      dailyBars: dailyBars.slice(-60), // last 60 days for chart
    };
  } catch (err) {
    console.error(`[intradayScorer] Error scoring ${symbol}:`, err);
    return null;
  }
}
