/**
 * PitDesk Intraday Scanner — 9-Criteria Weighted Scorecard
 *
 * Criteria and weights (total = 11.0 pts max):
 *  1. Daily Trend       (1.5) — Price vs SMA20 daily
 *  2. EMA Stack 15m     (1.5) — EMA9 vs EMA21 on 15-min bars
 *  3. VWAP Position     (1.0) — Price vs VWAP (computed from intraday bars)
 *  4. Relative Volume   (1.5) — Current bar RVOL vs 10-bar avg
 *  5. RSI Momentum      (1.0) — RSI(14) on 15-min bars
 *  6. Price Structure   (1.0) — Higher Highs + Higher Lows (bull) or Lower Highs + Lower Lows (bear)
 *  7. Entry Quality     (1.0) — Price within 0.5 ATR of VWAP
 *  8. Candle Confirm    (1.5) — Close in top 40% of bar range (bull) or bottom 40% (bear)
 *  9. ATR Expansion     (1.0) — Current ATR > 5-bar avg ATR
 *
 * Grade: A (≥9.0), B (7.0–8.5), C (5.0–6.5), D (<5.0)
 * Direction: Bullish / Bearish / Neutral
 */

import { callDataApi } from "./_core/dataApi";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PriceBar {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CriterionResult {
  name: string;
  weight: number;
  passed: boolean;
  value: string; // human-readable description of the measured value
  points: number; // weight if passed, 0 if failed
}

export interface IntradayScorecard {
  ticker: string;
  direction: "Bullish" | "Bearish" | "Neutral";
  score: number;
  maxScore: number;
  grade: "A" | "B" | "C" | "D";
  criteria: CriterionResult[];
  currentPrice: number;
  vwap: number;
  atr: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const recent = changes.slice(-period);
  const gains = recent.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = recent.filter((c) => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcATR(bars: PriceBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function calcVWAP(bars: PriceBar[]): number {
  // VWAP = sum(typical_price * volume) / sum(volume)
  // Use today's bars only (same calendar date as last bar)
  if (bars.length === 0) return 0;
  const lastDate = new Date(bars[bars.length - 1].timestamp).toDateString();
  const todayBars = bars.filter(
    (b) => new Date(b.timestamp).toDateString() === lastDate
  );
  if (todayBars.length === 0) return 0;
  let cumTPV = 0;
  let cumVol = 0;
  for (const b of todayBars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumTPV += tp * b.volume;
    cumVol += b.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : 0;
}

function detectPriceStructure(
  bars: PriceBar[],
  lookback = 5
): { higherHighs: boolean; higherLows: boolean; lowerHighs: boolean; lowerLows: boolean } {
  if (bars.length < lookback + 1) {
    return { higherHighs: false, higherLows: false, lowerHighs: false, lowerLows: false };
  }
  const recent = bars.slice(-lookback);
  let higherHighs = true;
  let higherLows = true;
  let lowerHighs = true;
  let lowerLows = true;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].high <= recent[i - 1].high) higherHighs = false;
    if (recent[i].low <= recent[i - 1].low) higherLows = false;
    if (recent[i].high >= recent[i - 1].high) lowerHighs = false;
    if (recent[i].low >= recent[i - 1].low) lowerLows = false;
  }
  return { higherHighs, higherLows, lowerHighs, lowerLows };
}

async function fetchBars(
  ticker: string,
  interval: string,
  range: string
): Promise<PriceBar[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: ticker, interval, range },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = result;
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];
    const timestamps: number[] = chart.timestamp ?? [];
    const q = chart.indicators?.quote?.[0] ?? {};
    return timestamps
      .map((ts: number, i: number) => ({
        timestamp: ts * 1000,
        open: q.open?.[i] ?? 0,
        high: q.high?.[i] ?? 0,
        low: q.low?.[i] ?? 0,
        close: q.close?.[i] ?? 0,
        volume: q.volume?.[i] ?? 0,
      }))
      .filter((b: PriceBar) => b.close > 0);
  } catch {
    return [];
  }
}

// ─── Main Scoring Engine ─────────────────────────────────────────────────────

export async function scoreIntradayTicker(
  ticker: string
): Promise<IntradayScorecard> {
  const MAX_SCORE = 11.0;

  try {
    // Fetch daily bars (for Daily Trend / SMA20)
    const [dailyBars, intraday15mBars] = await Promise.all([
      fetchBars(ticker, "1d", "3mo"),
      fetchBars(ticker, "15m", "5d"),
    ]);

    if (dailyBars.length < 21 || intraday15mBars.length < 20) {
      return {
        ticker,
        direction: "Neutral",
        score: 0,
        maxScore: MAX_SCORE,
        grade: "D",
        criteria: [],
        currentPrice: 0,
        vwap: 0,
        atr: 0,
        error: "Insufficient data",
      };
    }

    const dailyCloses = dailyBars.map((b) => b.close);
    const intraCloses = intraday15mBars.map((b) => b.close);
    const currentPrice = intraday15mBars[intraday15mBars.length - 1].close;
    const lastBar = intraday15mBars[intraday15mBars.length - 1];

    // Computed values
    const sma20Daily = calcSMA(dailyCloses, 20)!;
    const ema9_15m = calcEMA(intraCloses, 9)!;
    const ema21_15m = calcEMA(intraCloses, 21)!;
    const vwap = calcVWAP(intraday15mBars);
    const rsi14 = calcRSI(intraCloses, 14) ?? 50;
    const atr14 = calcATR(intraday15mBars, 14);
    const atr5avg = calcATR(intraday15mBars.slice(-6), 5);
    const priceStructure = detectPriceStructure(intraday15mBars, 5);

    // Relative volume: current bar volume vs avg of last 10 bars (excluding current)
    const recentBars = intraday15mBars.slice(-11, -1);
    const avgVol = recentBars.length > 0
      ? recentBars.reduce((s, b) => s + b.volume, 0) / recentBars.length
      : 1;
    const rvol = avgVol > 0 ? lastBar.volume / avgVol : 0;

    // Determine direction
    const isBullish = currentPrice > vwap && ema9_15m > ema21_15m;
    const isBearish = currentPrice < vwap && ema9_15m < ema21_15m;
    const direction: "Bullish" | "Bearish" | "Neutral" = isBullish
      ? "Bullish"
      : isBearish
      ? "Bearish"
      : "Neutral";

    // ── Criterion 1: Daily Trend (1.5) ──────────────────────────────────────
    const dailyTrendPass = isBullish
      ? currentPrice > sma20Daily
      : isBearish
      ? currentPrice < sma20Daily
      : Math.abs(currentPrice - sma20Daily) / sma20Daily < 0.02;
    const c1: CriterionResult = {
      name: "Daily Trend",
      weight: 1.5,
      passed: dailyTrendPass,
      value: `Price $${currentPrice.toFixed(2)} vs SMA20 $${sma20Daily.toFixed(2)}`,
      points: dailyTrendPass ? 1.5 : 0,
    };

    // ── Criterion 2: EMA Stack 15m (1.5) ────────────────────────────────────
    const emaStackPass = isBullish
      ? ema9_15m > ema21_15m
      : isBearish
      ? ema9_15m < ema21_15m
      : false;
    const c2: CriterionResult = {
      name: "EMA Stack 15m",
      weight: 1.5,
      passed: emaStackPass,
      value: `EMA9 ${ema9_15m.toFixed(2)} vs EMA21 ${ema21_15m.toFixed(2)}`,
      points: emaStackPass ? 1.5 : 0,
    };

    // ── Criterion 3: VWAP Position (1.0) ────────────────────────────────────
    const vwapPass = isBullish
      ? currentPrice > vwap
      : isBearish
      ? currentPrice < vwap
      : false;
    const c3: CriterionResult = {
      name: "VWAP Position",
      weight: 1.0,
      passed: vwapPass,
      value: `Price $${currentPrice.toFixed(2)} vs VWAP $${vwap.toFixed(2)}`,
      points: vwapPass ? 1.0 : 0,
    };

    // ── Criterion 4: Relative Volume (1.5) ──────────────────────────────────
    const rvolPass = rvol >= 1.2;
    const c4: CriterionResult = {
      name: "Relative Volume",
      weight: 1.5,
      passed: rvolPass,
      value: `RVOL ${rvol.toFixed(2)}x (threshold 1.2x)`,
      points: rvolPass ? 1.5 : 0,
    };

    // ── Criterion 5: RSI Momentum (1.0) ─────────────────────────────────────
    const rsiPass = isBullish
      ? rsi14 >= 50 && rsi14 <= 75
      : isBearish
      ? rsi14 <= 50 && rsi14 >= 25
      : false;
    const c5: CriterionResult = {
      name: "RSI Momentum",
      weight: 1.0,
      passed: rsiPass,
      value: `RSI ${rsi14.toFixed(1)}`,
      points: rsiPass ? 1.0 : 0,
    };

    // ── Criterion 6: Price Structure (1.0) ──────────────────────────────────
    const structurePass = isBullish
      ? priceStructure.higherHighs && priceStructure.higherLows
      : isBearish
      ? priceStructure.lowerHighs && priceStructure.lowerLows
      : false;
    const c6: CriterionResult = {
      name: "Price Structure",
      weight: 1.0,
      passed: structurePass,
      value: `HH: ${priceStructure.higherHighs}, HL: ${priceStructure.higherLows}, LH: ${priceStructure.lowerHighs}, LL: ${priceStructure.lowerLows}`,
      points: structurePass ? 1.0 : 0,
    };

    // ── Criterion 7: Entry Quality (1.0) ────────────────────────────────────
    const distFromVwap = Math.abs(currentPrice - vwap);
    const halfAtr = atr14 * 0.5;
    const entryQualityPass = distFromVwap <= halfAtr;
    const c7: CriterionResult = {
      name: "Entry Quality",
      weight: 1.0,
      passed: entryQualityPass,
      value: `$${distFromVwap.toFixed(2)} from VWAP (0.5 ATR = $${halfAtr.toFixed(2)})`,
      points: entryQualityPass ? 1.0 : 0,
    };

    // ── Criterion 8: Candle Confirm (1.5) ───────────────────────────────────
    const barRange = lastBar.high - lastBar.low;
    const closePosition = barRange > 0 ? (lastBar.close - lastBar.low) / barRange : 0.5;
    const candlePass = isBullish
      ? closePosition >= 0.6  // close in top 40%
      : isBearish
      ? closePosition <= 0.4  // close in bottom 40%
      : false;
    const c8: CriterionResult = {
      name: "Candle Confirm",
      weight: 1.5,
      passed: candlePass,
      value: `Close at ${(closePosition * 100).toFixed(0)}% of bar range`,
      points: candlePass ? 1.5 : 0,
    };

    // ── Criterion 9: ATR Expansion (1.0) ────────────────────────────────────
    const atrExpandPass = atr14 > atr5avg * 1.1;
    const c9: CriterionResult = {
      name: "ATR Expansion",
      weight: 1.0,
      passed: atrExpandPass,
      value: `ATR $${atr14.toFixed(2)} vs 5-bar avg $${atr5avg.toFixed(2)}`,
      points: atrExpandPass ? 1.0 : 0,
    };

    const criteria = [c1, c2, c3, c4, c5, c6, c7, c8, c9];
    const score = criteria.reduce((s, c) => s + c.points, 0);

    const grade: "A" | "B" | "C" | "D" =
      score >= 9.0 ? "A" : score >= 7.0 ? "B" : score >= 5.0 ? "C" : "D";

    return {
      ticker,
      direction,
      score,
      maxScore: MAX_SCORE,
      grade,
      criteria,
      currentPrice,
      vwap,
      atr: atr14,
    };
  } catch (err) {
    return {
      ticker,
      direction: "Neutral",
      score: 0,
      maxScore: 11.0,
      grade: "D",
      criteria: [],
      currentPrice: 0,
      vwap: 0,
      atr: 0,
      error: String(err),
    };
  }
}

/**
 * Scan a list of tickers and return scorecards sorted by score descending.
 */
export async function runIntradayScan(
  tickers: string[]
): Promise<IntradayScorecard[]> {
  const results = await Promise.allSettled(
    tickers.map((t) => scoreIntradayTicker(t))
  );
  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is IntradayScorecard => r !== null && !r.error)
    .sort((a, b) => b.score - a.score);
}
