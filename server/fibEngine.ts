/**
 * fibEngine.ts — Core Fibonacci Analysis Engine for PitDesk
 *
 * Provides:
 *  - Fibonacci retracement levels: 23.6%, 38.2%, 50%, 61.8%, 78.6%
 *  - Fibonacci extension levels: 127.2%, 161.8%, 261.8%
 *  - EMA calculation (9, 20, 50, 200)
 *  - Fib + EMA confluence detection (within configurable % proximity)
 */

export const FIB_RETRACEMENT_LEVELS = [23.6, 38.2, 50.0, 61.8, 78.6] as const;
export const FIB_EXTENSION_LEVELS = [127.2, 161.8, 261.8] as const;
export const EMA_PERIODS = [9, 20, 50, 200] as const;

export type FibRetracementLevel = (typeof FIB_RETRACEMENT_LEVELS)[number];
export type FibExtensionLevel = (typeof FIB_EXTENSION_LEVELS)[number];
export type EmaPeriod = (typeof EMA_PERIODS)[number];

export interface FibRetracementResult {
  level: number; // e.g. 38.2
  price: number; // actual price at this level
  label: string; // "38.2%"
}

export interface FibExtensionResult {
  level: number; // e.g. 161.8
  price: number; // actual price at this level
  label: string; // "161.8%"
}

export interface EmaResult {
  period: number;
  value: number;
}

export interface FibEmaConfluence {
  fibLevel: number;
  fibPrice: number;
  emaPeriod: number;
  emaValue: number;
  currentPrice: number;
  fibProximityPct: number; // how close price is to fib level (%)
  emaProximityPct: number; // how close price is to EMA (%)
  isConfluent: boolean; // both within threshold
}

/**
 * Calculate Fibonacci retracement levels from swing high and swing low.
 * For an uptrend: swingLow is the base, swingHigh is the top.
 * Retracement levels are measured from the high downward.
 */
export function calcFibRetracements(
  swingHigh: number,
  swingLow: number
): FibRetracementResult[] {
  const range = swingHigh - swingLow;
  return FIB_RETRACEMENT_LEVELS.map((level) => ({
    level,
    price: swingHigh - (range * level) / 100,
    label: `${level}%`,
  }));
}

/**
 * Calculate Fibonacci extension levels.
 * Extensions project beyond the swing high using the swing range.
 * Formula: swingHigh + (range * (level - 100) / 100)
 * For 127.2%: price = swingLow + range * 1.272
 */
export function calcFibExtensions(
  swingHigh: number,
  swingLow: number
): FibExtensionResult[] {
  const range = swingHigh - swingLow;
  return FIB_EXTENSION_LEVELS.map((level) => ({
    level,
    price: swingLow + (range * level) / 100,
    label: `${level}%`,
  }));
}

/**
 * Calculate Fibonacci extension targets from an entry price and swing low.
 * Used in the Trade Log to auto-suggest profit targets.
 * The "range" is entry - swingLow (the impulse leg).
 */
export function calcTradeExtensionTargets(
  entryPrice: number,
  swingLow: number
): { target1: number; target2: number; target3: number } {
  if (swingLow >= entryPrice) {
    throw new Error("Swing low must be below entry price");
  }
  const range = entryPrice - swingLow;
  return {
    target1: swingLow + range * 1.272, // 127.2%
    target2: swingLow + range * 1.618, // 161.8%
    target3: swingLow + range * 2.618, // 261.8%
  };
}

/**
 * Calculate EMA for a given period from an array of closing prices.
 * Prices should be in chronological order (oldest first).
 */
export function calcEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const multiplier = 2 / (period + 1);
  // Seed with SMA of first `period` bars
  let ema =
    closes.slice(0, period).reduce((sum, c) => sum + c, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  return ema;
}

/**
 * Calculate all four EMAs (9, 20, 50, 200) from a price history array.
 */
export function calcAllEmas(closes: number[]): EmaResult[] {
  return EMA_PERIODS.map((period) => ({
    period,
    value: calcEma(closes, period) ?? 0,
  })).filter((e) => e.value > 0);
}

/**
 * Find the swing high and swing low over the last N bars.
 */
export function findSwingHighLow(
  highs: number[],
  lows: number[],
  lookback = 50
): { swingHigh: number; swingLow: number } {
  const slice = Math.min(lookback, highs.length);
  const recentHighs = highs.slice(-slice);
  const recentLows = lows.slice(-slice);
  return {
    swingHigh: Math.max(...recentHighs),
    swingLow: Math.min(...recentLows),
  };
}

/**
 * Detect Fib + EMA confluence for a given ticker.
 * Returns all confluent pairs where price is within `thresholdPct` of
 * both a Fib retracement level AND a major EMA simultaneously.
 */
export function detectFibEmaConfluence(
  currentPrice: number,
  closes: number[],
  swingHigh: number,
  swingLow: number,
  thresholdPct = 1.0,
  fibLevels: number[] = [...FIB_RETRACEMENT_LEVELS],
  emaPeriods: number[] = [...EMA_PERIODS]
): FibEmaConfluence[] {
  const emas = calcAllEmas(closes).filter((e) =>
    emaPeriods.includes(e.period)
  );
  const fibs = calcFibRetracements(swingHigh, swingLow).filter((f) =>
    fibLevels.includes(f.level)
  );

  const confluences: FibEmaConfluence[] = [];

  for (const fib of fibs) {
    const fibProximityPct =
      (Math.abs(currentPrice - fib.price) / currentPrice) * 100;
    if (fibProximityPct > thresholdPct) continue;

    for (const ema of emas) {
      const emaProximityPct =
        (Math.abs(currentPrice - ema.value) / currentPrice) * 100;
      if (emaProximityPct > thresholdPct) continue;

      confluences.push({
        fibLevel: fib.level,
        fibPrice: fib.price,
        emaPeriod: ema.period,
        emaValue: ema.value,
        currentPrice,
        fibProximityPct,
        emaProximityPct,
        isConfluent: true,
      });
    }
  }

  return confluences;
}

/**
 * Check if price is near a Fib level (within thresholdPct).
 */
export function isPriceNearFib(
  currentPrice: number,
  fibPrice: number,
  thresholdPct = 1.0
): boolean {
  return (Math.abs(currentPrice - fibPrice) / currentPrice) * 100 <= thresholdPct;
}

/**
 * Check if price is near an EMA value (within thresholdPct).
 */
export function isPriceNearEma(
  currentPrice: number,
  emaValue: number,
  thresholdPct = 1.0
): boolean {
  return (Math.abs(currentPrice - emaValue) / currentPrice) * 100 <= thresholdPct;
}

/**
 * Format a price to 2 decimal places for display.
 */
export function fmtPrice(p: number): string {
  return p.toFixed(2);
}
