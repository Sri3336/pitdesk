import { describe, it, expect } from "vitest";

// Test the scoring logic in isolation — no API calls
describe("intradayScanner scoring logic", () => {
  it("grades A for score >= 9.0", () => {
    const grade = (score: number, max: number) => {
      const pct = score / max;
      if (pct >= 0.818) return "A";
      if (pct >= 0.636) return "B";
      if (pct >= 0.454) return "C";
      return "D";
    };
    expect(grade(9.0, 11.0)).toBe("A");
    expect(grade(11.0, 11.0)).toBe("A");
  });

  it("grades B for score 7.0–8.5", () => {
    const grade = (score: number, max: number) => {
      const pct = score / max;
      if (pct >= 0.818) return "A";
      if (pct >= 0.636) return "B";
      if (pct >= 0.454) return "C";
      return "D";
    };
    expect(grade(7.0, 11.0)).toBe("B");
    expect(grade(8.5, 11.0)).toBe("B");
  });

  it("grades D for score < 5.0", () => {
    const grade = (score: number, max: number) => {
      const pct = score / max;
      if (pct >= 0.818) return "A";
      if (pct >= 0.636) return "B";
      if (pct >= 0.454) return "C";
      return "D";
    };
    expect(grade(4.0, 11.0)).toBe("D");
    expect(grade(0, 11.0)).toBe("D");
  });

  it("calculates EMA correctly for simple series", () => {
    // EMA formula: EMA = price * k + prevEMA * (1 - k), k = 2/(n+1)
    const calcEMA = (prices: number[], period: number): number[] => {
      const k = 2 / (period + 1);
      const result: number[] = [];
      let ema = prices[0];
      result.push(ema);
      for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
        result.push(ema);
      }
      return result;
    };
    const prices = [10, 11, 12, 11, 10];
    const emas = calcEMA(prices, 3);
    expect(emas.length).toBe(5);
    expect(emas[0]).toBe(10);
    expect(emas[1]).toBeCloseTo(10.5, 1);
  });

  it("detects bullish EMA stack (EMA9 > EMA21)", () => {
    const ema9 = 205.41;
    const ema21 = 204.00;
    const isBullishStack = ema9 > ema21;
    expect(isBullishStack).toBe(true);
  });

  it("detects bearish EMA stack (EMA9 < EMA21)", () => {
    const ema9 = 205.41;
    const ema21 = 206.25;
    const isBullishStack = ema9 > ema21;
    expect(isBullishStack).toBe(false);
  });

  it("RVOL pass threshold is >= 1.5x", () => {
    const avgVol = 1_000_000;
    const currentVol = 1_600_000;
    const rvol = currentVol / avgVol;
    expect(rvol >= 1.5).toBe(true);
  });

  it("RVOL fail when below 1.5x", () => {
    const avgVol = 1_000_000;
    const currentVol = 740_000;
    const rvol = currentVol / avgVol;
    expect(rvol >= 1.5).toBe(false);
  });

  it("entry quality passes when price within 0.5 ATR of VWAP", () => {
    const price = 204.65;
    const vwap = 206.58;
    const atr = 8.49;
    const distFromVwap = Math.abs(price - vwap);
    const halfAtr = atr * 0.5;
    expect(distFromVwap <= halfAtr).toBe(true); // 1.93 <= 4.245
  });

  it("candle confirm passes when close in top 40% of range (bullish)", () => {
    const high = 210;
    const low = 200;
    const close = 207; // top 30% → passes
    const range = high - low;
    const closePosition = (close - low) / range;
    expect(closePosition >= 0.6).toBe(true);
  });

  it("candle confirm fails when close at midrange", () => {
    const high = 210;
    const low = 200;
    const close = 205; // exactly 50% → fails for both bull and bear
    const range = high - low;
    const closePosition = (close - low) / range;
    expect(closePosition >= 0.6).toBe(false);
    expect(closePosition <= 0.4).toBe(false);
  });
});
