/**
 * previousRangeScanner.ts — Previous Range Pullback (PRP) Scanner for PitDesk
 *
 * Strategy (from ICT/Smart Money Concepts):
 *  1. Identify a swing high (SH) and swing low (SL) on the daily chart.
 *  2. Detect a Break of Structure (BOS) — price closes ABOVE the swing high (bullish BOS)
 *     or BELOW the swing low (bearish BOS).
 *  3. The "previous range" is the zone between the BOS level and the preceding swing low/high.
 *  4. Flag when current price has retraced 30%, 50%, or 70% into that previous range.
 *  5. Target: return to the BOS level (the broken swing high/low).
 *
 * Data source: Yahoo Finance daily OHLC via callDataApi (same as Velez scanner).
 */

import { callDataApi } from "./_core/dataApi";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PRPDirection = "BULLISH" | "BEARISH";
export type RetracementZone = "SHALLOW_30" | "GOLDEN_50" | "DEEP_70" | "ABOVE_RANGE" | "BELOW_RANGE";

export interface PRPSignal {
  ticker: string;
  direction: PRPDirection;
  /** The swing high/low that was broken (the BOS level = re-entry target) */
  bosLevel: number;
  /** The swing low (for bullish) or swing high (for bearish) that anchors the range */
  rangeAnchor: number;
  /** Total range size in $ */
  rangeSize: number;
  /** Current price */
  currentPrice: number;
  /** How far price has retraced into the range as a % (0–100) */
  retracementPct: number;
  /** Which retracement zone price is in */
  retracementZone: RetracementZone;
  /** 30% retracement level */
  level30: number;
  /** 50% retracement level */
  level50: number;
  /** 70% retracement level */
  level70: number;
  /** Target = return to BOS level */
  target: number;
  /** Stop = just beyond the range anchor */
  stop: number;
  /** R:R ratio (target distance / stop distance) */
  rr: number;
  /** Date of the BOS candle */
  bosDate: string;
  /** Number of days since BOS */
  daysSinceBos: number;
  /** Volume on BOS day vs 20-day avg */
  bosVolumeRatio: number;
  /** Current price vs 20-day avg volume */
  currentVolumeRatio: number;
  /** EMA 21 value (for trailing stop reference) */
  ema21: number | null;
  /** Whether current price is above EMA21 (bullish) or below (bearish) */
  ema21Aligned: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchDailyBars(ticker: string, range = "6mo"): Promise<PriceBar[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { ticker, interval: "1d", range },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = result;
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];
    const timestamps: number[] = chart.timestamp ?? [];
    const q = chart.indicators?.quote?.[0] ?? {};
    return timestamps
      .map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split("T")[0],
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

function calcEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, c) => s + c, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcAvgVolume(bars: PriceBar[], lookback = 20): number {
  const slice = bars.slice(-lookback - 1, -1);
  if (slice.length === 0) return 0;
  return slice.reduce((s, b) => s + b.volume, 0) / slice.length;
}

/**
 * Detect local swing highs using a left/right lookback window.
 * A bar at index i is a swing high if its high is >= all highs in [i-left, i+right].
 */
function detectSwingHighs(bars: PriceBar[], left = 3, right = 3): number[] {
  const indices: number[] = [];
  for (let i = left; i < bars.length - right; i++) {
    const h = bars[i].high;
    let isHigh = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && bars[j].high >= h) { isHigh = false; break; }
    }
    if (isHigh) indices.push(i);
  }
  return indices;
}

/**
 * Detect local swing lows using a left/right lookback window.
 */
function detectSwingLows(bars: PriceBar[], left = 3, right = 3): number[] {
  const indices: number[] = [];
  for (let i = left; i < bars.length - right; i++) {
    const l = bars[i].low;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && bars[j].low <= l) { isLow = false; break; }
    }
    if (isLow) indices.push(i);
  }
  return indices;
}

/**
 * Classify which retracement zone the current price is in.
 * For BULLISH: price retraces DOWN from bosLevel toward rangeAnchor (the prior swing low).
 * retracementPct = how far down from bosLevel toward rangeAnchor (0% = at BOS, 100% = at anchor).
 */
function classifyRetracementZone(retracementPct: number): RetracementZone {
  if (retracementPct < 0) return "ABOVE_RANGE";
  if (retracementPct > 100) return "BELOW_RANGE";
  if (retracementPct <= 40) return "SHALLOW_30";
  if (retracementPct <= 60) return "GOLDEN_50";
  return "DEEP_70";
}

// ─── Core Scanner ─────────────────────────────────────────────────────────────

export async function scanPreviousRangePullback(ticker: string): Promise<PRPSignal | null> {
  const bars = await fetchDailyBars(ticker, "6mo");
  if (bars.length < 30) return null;

  const closes = bars.map(b => b.close);
  const currentBar = bars[bars.length - 1];
  const currentPrice = currentBar.close;

  // Need minimum price filter
  if (currentPrice < 5) return null;

  const avgVol = calcAvgVolume(bars, 20);
  const ema21 = calcEma(closes, 21);

  // Detect swing highs and lows (use last 60 bars max)
  const lookbackBars = bars.slice(-60);
  const swingHighIndices = detectSwingHighs(lookbackBars, 3, 3);
  const swingLowIndices = detectSwingLows(lookbackBars, 3, 3);

  if (swingHighIndices.length < 1 || swingLowIndices.length < 1) return null;

  // ── BULLISH BOS: price closes above a recent swing high ──────────────────
  // Find the most recent swing high that was broken (price closed above it)
  // and has a preceding swing low to define the range.
  let bullishSignal: PRPSignal | null = null;

  for (let si = swingHighIndices.length - 1; si >= 0; si--) {
    const shIdx = swingHighIndices[si];
    const swingHighPrice = lookbackBars[shIdx].high;

    // Find the preceding swing low (must be before the swing high)
    const precedingSlIdx = swingLowIndices.filter(i => i < shIdx).pop();
    if (precedingSlIdx === undefined) continue;
    const swingLowPrice = lookbackBars[precedingSlIdx].low;

    // Look for a BOS candle: a bar AFTER the swing high that closed above it
    const bosIdx = lookbackBars.findIndex((b, i) => i > shIdx && b.close > swingHighPrice);
    if (bosIdx === -1) continue;

    // BOS must have happened within the last 20 trading days
    const daysSinceBos = lookbackBars.length - 1 - bosIdx;
    if (daysSinceBos > 20) continue;

    // Current price must be BELOW the BOS level (i.e., retracing)
    if (currentPrice >= swingHighPrice) continue;

    // Range = from swingLow to swingHigh (the "previous range")
    const rangeSize = swingHighPrice - swingLowPrice;
    if (rangeSize <= 0) continue;

    // Retracement % = how far price has come back from BOS level toward range anchor
    const retracementPct = ((swingHighPrice - currentPrice) / rangeSize) * 100;

    // Only flag if price is in the 20–80% retracement zone (not too shallow, not blown through)
    if (retracementPct < 20 || retracementPct > 85) continue;

    const level30 = swingHighPrice - rangeSize * 0.30;
    const level50 = swingHighPrice - rangeSize * 0.50;
    const level70 = swingHighPrice - rangeSize * 0.70;

    const target = swingHighPrice; // return to BOS level
    const stop = swingLowPrice - rangeSize * 0.05; // just below range anchor
    const stopDist = currentPrice - stop;
    const targetDist = target - currentPrice;
    const rr = stopDist > 0 ? targetDist / stopDist : 0;

    // Minimum R:R of 1.5
    if (rr < 1.5) continue;

    const bosBar = lookbackBars[bosIdx];
    const bosVolumeRatio = avgVol > 0 ? bosBar.volume / avgVol : 1;
    const currentVolumeRatio = avgVol > 0 ? currentBar.volume / avgVol : 1;
    const ema21Aligned = ema21 !== null ? currentPrice > ema21 : true;

    bullishSignal = {
      ticker,
      direction: "BULLISH",
      bosLevel: swingHighPrice,
      rangeAnchor: swingLowPrice,
      rangeSize,
      currentPrice,
      retracementPct: Math.round(retracementPct * 10) / 10,
      retracementZone: classifyRetracementZone(retracementPct),
      level30,
      level50,
      level70,
      target,
      stop,
      rr: Math.round(rr * 10) / 10,
      bosDate: bosBar.date,
      daysSinceBos,
      bosVolumeRatio: Math.round(bosVolumeRatio * 10) / 10,
      currentVolumeRatio: Math.round(currentVolumeRatio * 10) / 10,
      ema21,
      ema21Aligned,
    };
    break; // Take the most recent valid bullish setup
  }

  // ── BEARISH BOS: price closes below a recent swing low ───────────────────
  let bearishSignal: PRPSignal | null = null;

  for (let si = swingLowIndices.length - 1; si >= 0; si--) {
    const slIdx = swingLowIndices[si];
    const swingLowPrice = lookbackBars[slIdx].low;

    // Find the preceding swing high (must be before the swing low)
    const precedingShIdx = swingHighIndices.filter(i => i < slIdx).pop();
    if (precedingShIdx === undefined) continue;
    const swingHighPrice = lookbackBars[precedingShIdx].high;

    // Look for a BOS candle: a bar AFTER the swing low that closed below it
    const bosIdx = lookbackBars.findIndex((b, i) => i > slIdx && b.close < swingLowPrice);
    if (bosIdx === -1) continue;

    const daysSinceBos = lookbackBars.length - 1 - bosIdx;
    if (daysSinceBos > 20) continue;

    // Current price must be ABOVE the BOS level (i.e., retracing up into the range)
    if (currentPrice <= swingLowPrice) continue;

    const rangeSize = swingHighPrice - swingLowPrice;
    if (rangeSize <= 0) continue;

    // Retracement % = how far price has bounced back from BOS level toward range anchor
    const retracementPct = ((currentPrice - swingLowPrice) / rangeSize) * 100;

    if (retracementPct < 20 || retracementPct > 85) continue;

    const level30 = swingLowPrice + rangeSize * 0.30;
    const level50 = swingLowPrice + rangeSize * 0.50;
    const level70 = swingLowPrice + rangeSize * 0.70;

    const target = swingLowPrice; // return to BOS level
    const stop = swingHighPrice + rangeSize * 0.05; // just above range anchor
    const stopDist = stop - currentPrice;
    const targetDist = currentPrice - target;
    const rr = stopDist > 0 ? targetDist / stopDist : 0;

    if (rr < 1.5) continue;

    const bosBar = lookbackBars[bosIdx];
    const bosVolumeRatio = avgVol > 0 ? bosBar.volume / avgVol : 1;
    const currentVolumeRatio = avgVol > 0 ? currentBar.volume / avgVol : 1;
    const ema21Aligned = ema21 !== null ? currentPrice < ema21 : true;

    bearishSignal = {
      ticker,
      direction: "BEARISH",
      bosLevel: swingLowPrice,
      rangeAnchor: swingHighPrice,
      rangeSize,
      currentPrice,
      retracementPct: Math.round(retracementPct * 10) / 10,
      retracementZone: classifyRetracementZone(retracementPct),
      level30,
      level50,
      level70,
      target,
      stop,
      rr: Math.round(rr * 10) / 10,
      bosDate: bosBar.date,
      daysSinceBos,
      bosVolumeRatio: Math.round(bosVolumeRatio * 10) / 10,
      currentVolumeRatio: Math.round(currentVolumeRatio * 10) / 10,
      ema21,
      ema21Aligned,
    };
    break;
  }

  // Return the signal with the better R:R, preferring bullish if tied
  if (bullishSignal && bearishSignal) {
    return bullishSignal.rr >= bearishSignal.rr ? bullishSignal : bearishSignal;
  }
  return bullishSignal ?? bearishSignal;
}

/**
 * Run the PRP scanner across a list of tickers.
 * Returns only tickers that have an active PRP setup.
 */
export async function runPRPScanner(tickers: string[]): Promise<PRPSignal[]> {
  const results = await Promise.allSettled(
    tickers.map(ticker => scanPreviousRangePullback(ticker))
  );

  const signals: PRPSignal[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      signals.push(result.value);
    }
  }

  // Sort: GOLDEN_50 first (best zone), then by R:R descending
  const zoneOrder: Record<RetracementZone, number> = {
    GOLDEN_50: 0,
    DEEP_70: 1,
    SHALLOW_30: 2,
    ABOVE_RANGE: 3,
    BELOW_RANGE: 4,
  };

  return signals.sort((a, b) => {
    const zoneDiff = zoneOrder[a.retracementZone] - zoneOrder[b.retracementZone];
    if (zoneDiff !== 0) return zoneDiff;
    return b.rr - a.rr;
  });
}
