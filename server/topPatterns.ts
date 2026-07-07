/**
 * topPatterns.ts — 6 Classic Topping Pattern Detector
 *
 * Detects the following patterns from daily OHLCV data:
 *  1. Head & Shoulders (H&S)
 *  2. Double Top (M-Top)
 *  3. Triple Top
 *  4. Rounding Top (Dome)
 *  5. Rising Wedge
 *  6. Broadening Top
 *
 * Returns the detected pattern (if any), confidence score, key price levels,
 * and a plain-English description for educational display.
 */

export type TopPatternType =
  | "HEAD_AND_SHOULDERS"
  | "DOUBLE_TOP"
  | "TRIPLE_TOP"
  | "ROUNDING_TOP"
  | "RISING_WEDGE"
  | "BROADENING_TOP"
  | "NONE";

export interface TopPatternResult {
  pattern: TopPatternType;
  confidence: number;          // 0–100
  label: string;               // Short display label
  emoji: string;               // Visual indicator
  plainEnglish: string;        // One sentence for beginners
  traderNote: string;          // What to do about it
  keyLevels: {
    neckline?: number;
    leftShoulder?: number;
    head?: number;
    rightShoulder?: number;
    top1?: number;
    top2?: number;
    top3?: number;
    wedgeSupport?: number;
    wedgeResistance?: number;
  };
  bearishTarget?: number;      // Measured move target if pattern completes
}

interface Bar {
  high: number;
  low: number;
  close: number;
  open: number;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function localMaxima(bars: Bar[], lookback = 5): number[] {
  const indices: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const h = bars[i].high;
    let isMax = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].high >= h) { isMax = false; break; }
    }
    if (isMax) indices.push(i);
  }
  return indices;
}

function localMinima(bars: Bar[], lookback = 5): number[] {
  const indices: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const l = bars[i].low;
    let isMin = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].low <= l) { isMin = false; break; }
    }
    if (isMin) indices.push(i);
  }
  return indices;
}

function avg(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function linearRegression(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const xMean = avg(x);
  const yMean = avg(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: yMean - slope * xMean };
}

// ─── Pattern detectors ────────────────────────────────────────────────────────

function detectHeadAndShoulders(bars: Bar[]): TopPatternResult | null {
  if (bars.length < 40) return null;
  const recent = bars.slice(-80);
  const peaks = localMaxima(recent, 4);
  if (peaks.length < 3) return null;

  // Look for 3 peaks where middle is highest
  for (let i = 0; i < peaks.length - 2; i++) {
    const ls = peaks[i];
    const head = peaks[i + 1];
    const rs = peaks[i + 2];

    const lsH = recent[ls].high;
    const headH = recent[head].high;
    const rsH = recent[rs].high;

    // Head must be highest
    if (headH <= lsH || headH <= rsH) continue;
    // Shoulders roughly equal (within 5%)
    if (Math.abs(lsH - rsH) / headH > 0.05) continue;
    // Spacing: head should be between shoulders
    if (head <= ls || rs <= head) continue;

    // Find neckline (lowest lows between peaks)
    const trough1Low = Math.min(...recent.slice(ls, head).map(b => b.low));
    const trough2Low = Math.min(...recent.slice(head, rs).map(b => b.low));
    const neckline = avg([trough1Low, trough2Low]);

    const currentPrice = recent[recent.length - 1].close;
    const patternHeight = headH - neckline;
    const bearishTarget = neckline - patternHeight;

    // Confidence: higher if right shoulder is lower than left (weakness)
    let confidence = 60;
    if (rsH < lsH) confidence += 15;
    if (currentPrice < neckline) confidence += 15; // Confirmed breakdown
    else if (currentPrice < rsH) confidence += 5;

    return {
      pattern: "HEAD_AND_SHOULDERS",
      confidence: Math.min(confidence, 95),
      label: "Head & Shoulders",
      emoji: "🎯",
      plainEnglish:
        "The stock made three peaks — the middle one highest. This is the most reliable reversal signal. Smart money distributed shares across all three peaks.",
      traderNote:
        "Watch for a close below the neckline as confirmation. Measured move target = neckline − pattern height. Avoid selling puts until pattern resolves.",
      keyLevels: {
        leftShoulder: lsH,
        head: headH,
        rightShoulder: rsH,
        neckline,
      },
      bearishTarget,
    };
  }
  return null;
}

function detectDoubleTop(bars: Bar[]): TopPatternResult | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-60);
  const peaks = localMaxima(recent, 4);
  if (peaks.length < 2) return null;

  // Check last two peaks
  for (let i = peaks.length - 2; i >= 0; i--) {
    const p1 = peaks[i];
    const p2 = peaks[i + 1];
    const h1 = recent[p1].high;
    const h2 = recent[p2].high;

    // Peaks roughly equal (within 3%)
    if (Math.abs(h1 - h2) / Math.max(h1, h2) > 0.03) continue;
    // Must have meaningful separation (at least 10 bars)
    if (p2 - p1 < 10) continue;

    const trough = Math.min(...recent.slice(p1, p2).map(b => b.low));
    const currentPrice = recent[recent.length - 1].close;
    const patternHeight = Math.max(h1, h2) - trough;
    const bearishTarget = trough - patternHeight;

    let confidence = 65;
    if (h2 < h1) confidence += 10; // Second top lower = bearish divergence
    if (currentPrice < trough) confidence += 20; // Confirmed breakdown
    else if (currentPrice < (h1 + h2) / 2) confidence += 5;

    return {
      pattern: "DOUBLE_TOP",
      confidence: Math.min(confidence, 95),
      label: "Double Top",
      emoji: "⛰️",
      plainEnglish:
        "Price hit the same resistance level twice and failed both times. Like a boxer who can't land the knockout — the second attempt shows exhaustion.",
      traderNote:
        "Neckline break = confirmed. Sell calls above the double top. Avoid buying calls or selling puts until price reclaims the top.",
      keyLevels: {
        top1: h1,
        top2: h2,
        neckline: trough,
      },
      bearishTarget,
    };
  }
  return null;
}

function detectTripleTop(bars: Bar[]): TopPatternResult | null {
  if (bars.length < 30) return null;
  const recent = bars.slice(-90);
  const peaks = localMaxima(recent, 4);
  if (peaks.length < 3) return null;

  for (let i = peaks.length - 3; i >= 0; i--) {
    const p1 = peaks[i];
    const p2 = peaks[i + 1];
    const p3 = peaks[i + 2];
    const h1 = recent[p1].high;
    const h2 = recent[p2].high;
    const h3 = recent[p3].high;

    const maxH = Math.max(h1, h2, h3);
    const minH = Math.min(h1, h2, h3);
    // All three peaks within 3% of each other
    if ((maxH - minH) / maxH > 0.03) continue;
    // Meaningful spacing
    if (p2 - p1 < 8 || p3 - p2 < 8) continue;

    const trough = Math.min(...recent.slice(p1, p3).map(b => b.low));
    const currentPrice = recent[recent.length - 1].close;
    const patternHeight = maxH - trough;
    const bearishTarget = trough - patternHeight;

    let confidence = 70;
    if (currentPrice < trough) confidence += 20;

    return {
      pattern: "TRIPLE_TOP",
      confidence: Math.min(confidence, 95),
      label: "Triple Top",
      emoji: "🏔️",
      plainEnglish:
        "Three separate attempts to break the same resistance — all failed. This is stronger conviction than a double top. Sellers are firmly in control at this level.",
      traderNote:
        "Very high probability reversal. Sell calls aggressively above the triple top. The third failure is the most reliable signal to short.",
      keyLevels: {
        top1: h1,
        top2: h2,
        top3: h3,
        neckline: trough,
      },
      bearishTarget,
    };
  }
  return null;
}

function detectRoundingTop(bars: Bar[]): TopPatternResult | null {
  if (bars.length < 40) return null;
  const recent = bars.slice(-60);
  const closes = recent.map(b => b.close);
  const n = closes.length;

  // Split into thirds and check if middle third is highest
  const third = Math.floor(n / 3);
  const leftAvg = avg(closes.slice(0, third));
  const midAvg = avg(closes.slice(third, 2 * third));
  const rightAvg = avg(closes.slice(2 * third));

  if (midAvg <= leftAvg || midAvg <= rightAvg) return null;

  // Check for dome shape: highs should form an arc
  const highs = recent.map(b => b.high);
  const peakIdx = highs.indexOf(Math.max(...highs));
  if (peakIdx < n * 0.3 || peakIdx > n * 0.7) return null; // Peak should be in middle

  // Left side should be rising, right side falling
  const leftSlope = linearRegression(highs.slice(0, peakIdx)).slope;
  const rightSlope = linearRegression(highs.slice(peakIdx)).slope;

  if (leftSlope <= 0 || rightSlope >= 0) return null;

  const peakPrice = highs[peakIdx];
  const currentPrice = closes[closes.length - 1];

  let confidence = 55;
  if (rightSlope < -0.1) confidence += 15; // Steeper right decline
  if (currentPrice < leftAvg) confidence += 15; // Declined below left side start

  return {
    pattern: "ROUNDING_TOP",
    confidence: Math.min(confidence, 90),
    label: "Rounding Top",
    emoji: "🌙",
    plainEnglish:
      "Price slowly curved over like a dome — institutions quietly sold over weeks while retail buyers kept buying. No dramatic spike, just a gradual fade.",
    traderNote:
      "Slow and steady distribution. Sell calls at the dome peak. Premium selling works well here — IV is usually elevated from the slow grind down.",
    keyLevels: {
      head: peakPrice,
      neckline: Math.min(...recent.map(b => b.low)),
    },
    bearishTarget: currentPrice * 0.92,
  };
}

function detectRisingWedge(bars: Bar[]): TopPatternResult | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-50);
  const n = recent.length;

  const highs = recent.map(b => b.high);
  const lows = recent.map(b => b.low);

  const highReg = linearRegression(highs);
  const lowReg = linearRegression(lows);

  // Both trendlines must be rising
  if (highReg.slope <= 0 || lowReg.slope <= 0) return null;
  // Lower trendline must be rising faster (converging = wedge)
  if (lowReg.slope <= highReg.slope) return null;
  // Convergence: the gap should be narrowing
  const gapStart = highs[0] - lows[0];
  const gapEnd = highs[n - 1] - lows[n - 1];
  if (gapEnd >= gapStart * 0.7) return null; // Gap must narrow by at least 30%

  const wedgeSupport = lowReg.intercept + lowReg.slope * (n - 1);
  const wedgeResistance = highReg.intercept + highReg.slope * (n - 1);
  const currentPrice = recent[n - 1].close;

  let confidence = 60;
  if (gapEnd < gapStart * 0.5) confidence += 15; // Strong convergence
  if (currentPrice < wedgeSupport) confidence += 20; // Broken down

  return {
    pattern: "RISING_WEDGE",
    confidence: Math.min(confidence, 90),
    label: "Rising Wedge",
    emoji: "📐",
    plainEnglish:
      "Price is making higher highs AND higher lows — looks bullish, but the moves are getting smaller. This is a trap. When the floor breaks, it falls fast.",
    traderNote:
      "Counter-intuitive pattern — looks like an uptrend but it's distribution. Wait for a close below the lower trendline before entering bearish trades.",
    keyLevels: {
      wedgeSupport,
      wedgeResistance,
    },
    bearishTarget: wedgeSupport * 0.95,
  };
}

function detectBroadeningTop(bars: Bar[]): TopPatternResult | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-50);
  const n = recent.length;

  const highs = recent.map(b => b.high);
  const lows = recent.map(b => b.low);

  const highReg = linearRegression(highs);
  const lowReg = linearRegression(lows);

  // Highs rising, lows falling = broadening
  if (highReg.slope <= 0 || lowReg.slope >= 0) return null;

  // Check volatility is expanding
  const earlyRange = avg(recent.slice(0, 10).map(b => b.high - b.low));
  const lateRange = avg(recent.slice(-10).map(b => b.high - b.low));
  if (lateRange < earlyRange * 1.3) return null;

  const currentPrice = recent[n - 1].close;
  const upperLine = highReg.intercept + highReg.slope * (n - 1);
  const lowerLine = lowReg.intercept + lowReg.slope * (n - 1);

  let confidence = 55;
  if (lateRange > earlyRange * 1.8) confidence += 15;
  if (currentPrice < avg(recent.map(b => b.close))) confidence += 10;

  return {
    pattern: "BROADENING_TOP",
    confidence: Math.min(confidence, 85),
    label: "Broadening Top",
    emoji: "📯",
    plainEnglish:
      "Price swings are getting bigger in both directions — the market is losing control. Big up days followed by bigger down days. This is panic distribution.",
    traderNote:
      "Dangerous for premium sellers — IV is high but moves are unpredictable. Avoid strangles. If trading, use defined-risk spreads only.",
    keyLevels: {
      wedgeResistance: upperLine,
      wedgeSupport: lowerLine,
    },
    bearishTarget: lowerLine * 0.97,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectTopPattern(bars: Bar[]): TopPatternResult {
  if (bars.length < 20) {
    return {
      pattern: "NONE",
      confidence: 0,
      label: "No Pattern",
      emoji: "—",
      plainEnglish: "Not enough data to detect a pattern.",
      traderNote: "Need at least 20 bars of data.",
      keyLevels: {},
    };
  }

  // Try patterns in order of reliability / specificity
  const candidates: (TopPatternResult | null)[] = [
    detectTripleTop(bars),
    detectHeadAndShoulders(bars),
    detectDoubleTop(bars),
    detectRisingWedge(bars),
    detectRoundingTop(bars),
    detectBroadeningTop(bars),
  ];

  // Return highest-confidence detected pattern
  const detected = candidates
    .filter((c): c is TopPatternResult => c !== null)
    .sort((a, b) => b.confidence - a.confidence);

  if (detected.length === 0) {
    return {
      pattern: "NONE",
      confidence: 0,
      label: "No Top Pattern",
      emoji: "✅",
      plainEnglish: "No classic topping pattern detected. Price action looks constructive.",
      traderNote: "No distribution signals. Normal trend continuation expected.",
      keyLevels: {},
    };
  }

  return detected[0];
}

// ─── Batch scan ───────────────────────────────────────────────────────────────

export function detectTopPatternBatch(
  barsByTicker: Record<string, Bar[]>
): Record<string, TopPatternResult> {
  const results: Record<string, TopPatternResult> = {};
  for (const [ticker, bars] of Object.entries(barsByTicker)) {
    results[ticker] = detectTopPattern(bars);
  }
  return results;
}
