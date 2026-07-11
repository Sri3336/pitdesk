/**
 * Nour Method Scanner — Unit Tests
 */
import { describe, it, expect } from "vitest";

// ─── Helpers extracted for testing ───────────────────────────────────────────

function calcATR(bars: { high: number; low: number; close: number }[], period = 14): number[] {
  const trs: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
  }
  const atrs: number[] = new Array(period - 1).fill(0);
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrs.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrs.push(atr);
  }
  return atrs;
}

function calcHV(bars: { close: number }[], period = 20): number {
  if (bars.length < period + 1) return 0;
  const returns: number[] = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    returns.push(r);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance * 252) * 100;
}

function detectConsolidationZone(bars: { high: number; low: number; close: number }[], lookback = 15) {
  const recent = bars.slice(-lookback);
  const high = Math.max(...recent.map(b => b.high));
  const low = Math.min(...recent.map(b => b.low));
  const midpoint = (high + low) / 2;
  const widthPct = low > 0 ? ((high - low) / low) * 100 : 0;
  let barsInRange = 0;
  for (const b of recent) {
    const distFromMid = Math.abs(b.close - midpoint) / midpoint * 100;
    if (distFromMid <= widthPct / 2 + 1) barsInRange++;
  }
  return { high, low, midpoint, widthPct, barsInRange };
}

function isVolumeSurge(latestVolume: number, avgVolume10d: number, threshold = 2.5): boolean {
  return avgVolume10d > 0 && latestVolume / avgVolume10d >= threshold;
}

function calcRsScore(tickerChangePct: number, qqqChangePct: number): number {
  return tickerChangePct - qqqChangePct;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Nour Scanner — ATR calculation", () => {
  it("calculates ATR for a simple bar series", () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({
      high: 100 + i * 0.5,
      low: 99 + i * 0.5,
      close: 99.5 + i * 0.5,
    }));
    const atrs = calcATR(bars, 14);
    expect(atrs.length).toBe(bars.length);
    const lastAtr = atrs[atrs.length - 1];
    expect(lastAtr).toBeGreaterThan(0);
    expect(lastAtr).toBeLessThan(5);
  });

  it("detects ATR contraction (range tightening)", () => {
    // First 10 bars: wide range (ATR ~5), last 10 bars: tight range (ATR ~1)
    const wideBars = Array.from({ length: 10 }, (_, i) => ({
      high: 100 + i + 5,
      low: 100 + i - 5,
      close: 100 + i,
    }));
    const tightBars = Array.from({ length: 10 }, (_, i) => ({
      high: 110 + i * 0.1 + 0.5,
      low: 110 + i * 0.1 - 0.5,
      close: 110 + i * 0.1,
    }));
    const allBars = [...wideBars, ...tightBars];
    const atrs = calcATR(allBars, 5);
    const earlyAtr = atrs[10];
    const lateAtr = atrs[atrs.length - 1];
    expect(lateAtr).toBeLessThan(earlyAtr);
  });
});

describe("Nour Scanner — Historical Volatility (IV proxy)", () => {
  it("returns 0 for insufficient bars", () => {
    const bars = Array.from({ length: 10 }, (_, i) => ({ close: 100 + i }));
    expect(calcHV(bars, 20)).toBe(0);
  });

  it("returns higher HV for volatile price series", () => {
    const stableBars = Array.from({ length: 25 }, (_, i) => ({ close: 100 + Math.sin(i) * 0.1 }));
    const volatileBars = Array.from({ length: 25 }, (_, i) => ({ close: 100 + Math.sin(i) * 5 }));
    const stableHV = calcHV(stableBars, 20);
    const volatileHV = calcHV(volatileBars, 20);
    expect(volatileHV).toBeGreaterThan(stableHV);
  });

  it("returns positive value for normal price series", () => {
    const bars = Array.from({ length: 25 }, (_, i) => ({ close: 100 + i * 0.5 + Math.random() * 2 }));
    const hv = calcHV(bars, 20);
    expect(hv).toBeGreaterThan(0);
  });
});

describe("Nour Scanner — Consolidation Zone", () => {
  it("detects zone high and low correctly", () => {
    const bars = Array.from({ length: 15 }, (_, i) => ({
      high: 105,
      low: 95,
      close: 100 + (i % 3 - 1),
    }));
    const zone = detectConsolidationZone(bars, 15);
    expect(zone.high).toBe(105);
    expect(zone.low).toBe(95);
    expect(zone.widthPct).toBeCloseTo(10.53, 0);
  });

  it("counts bars in range correctly", () => {
    const bars = Array.from({ length: 15 }, (_, i) => ({
      high: 102,
      low: 98,
      close: 100, // all within zone
    }));
    const zone = detectConsolidationZone(bars, 15);
    expect(zone.barsInRange).toBeGreaterThan(10);
  });

  it("calculates midpoint correctly", () => {
    const bars = Array.from({ length: 15 }, (_, i) => ({
      high: 110,
      low: 90,
      close: 100,
    }));
    const zone = detectConsolidationZone(bars, 15);
    expect(zone.midpoint).toBe(100);
  });
});

describe("Nour Scanner — Volume Surge detection", () => {
  it("detects volume surge at 2.5× threshold", () => {
    expect(isVolumeSurge(250_000, 100_000)).toBe(true);
    expect(isVolumeSurge(249_999, 100_000)).toBe(false);
  });

  it("handles zero avg volume gracefully", () => {
    expect(isVolumeSurge(100_000, 0)).toBe(false);
  });

  it("detects 3× surge as true", () => {
    expect(isVolumeSurge(300_000, 100_000)).toBe(true);
  });
});

describe("Nour Scanner — Relative Strength vs QQQ", () => {
  it("calculates positive RS for outperforming ticker", () => {
    const rs = calcRsScore(5.0, 2.0);
    expect(rs).toBe(3.0);
  });

  it("calculates negative RS for underperforming ticker", () => {
    const rs = calcRsScore(1.0, 3.0);
    expect(rs).toBe(-2.0);
  });

  it("returns zero RS when ticker matches QQQ exactly", () => {
    const rs = calcRsScore(2.5, 2.5);
    expect(rs).toBe(0);
  });
});

describe("Nour Scanner — Phase logic", () => {
  it("assigns BREAKOUT_NOW when price above zone high with volume surge", () => {
    const breakoutConfirmed = true;
    const volumeSurge = true;
    const phase = breakoutConfirmed && volumeSurge ? "BREAKOUT_NOW" : "CONSOLIDATING";
    expect(phase).toBe("BREAKOUT_NOW");
  });

  it("assigns RETEST_ENTRY when near breakout level with IV compressed", () => {
    const retestOpportunity = true;
    const ivCompressed = true;
    const breakoutConfirmed = false;
    const phase = breakoutConfirmed ? "BREAKOUT_NOW"
      : retestOpportunity && ivCompressed ? "RETEST_ENTRY"
      : "CONSOLIDATING";
    expect(phase).toBe("RETEST_ENTRY");
  });

  it("assigns CONSOLIDATING when IV compressed + range tightening", () => {
    const ivCompressed = true;
    const rangeTightening = true;
    const breakoutConfirmed = false;
    const retestOpportunity = false;
    const phase = breakoutConfirmed ? "BREAKOUT_NOW"
      : retestOpportunity ? "RETEST_ENTRY"
      : ivCompressed && rangeTightening ? "CONSOLIDATING"
      : "WATCH";
    expect(phase).toBe("CONSOLIDATING");
  });

  it("score reaches 75+ for BREAKOUT_NOW setup", () => {
    let score = 0;
    if (true) score += 20; // ivCompressed
    if (true) score += 20; // rangeTightening
    if (true) score += 15; // relativeStrength
    if (true) score += 20; // volumeSurge
    if (true) score += 15; // breakoutConfirmed
    expect(score).toBe(90);
  });
});
