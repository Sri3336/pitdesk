/**
 * Decision Bench — unit tests for helper logic
 *
 * Tests focus on pure deterministic helpers that don't require DB or external APIs.
 */

import { describe, it, expect } from "vitest";

// ─── EMA helper (copy from router for isolated testing) ────────────────────────

function calcEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ─── Gate verdict helper ───────────────────────────────────────────────────────

function computeVerdict(gates: { status: "PASS" | "WARN" | "FAIL" }[]): "GO" | "WAIT" | "NO-GO" {
  const failCount = gates.filter(g => g.status === "FAIL").length;
  const warnCount = gates.filter(g => g.status === "WARN").length;
  if (failCount >= 2) return "NO-GO";
  if (failCount === 1) return "WAIT";
  if (warnCount >= 3) return "WAIT";
  return "GO";
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Decision Bench — EMA helper", () => {
  it("returns empty array when values < period", () => {
    expect(calcEma([1, 2, 3], 5)).toEqual([]);
  });

  it("calculates correct EMA for simple series", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i); // 100..119
    const ema = calcEma(prices, 10);
    expect(ema.length).toBe(11); // 20 - 10 + 1
    // First value is SMA of first 10 = 104.5
    expect(ema[0]).toBeCloseTo(104.5, 1);
    // EMA should trend upward with rising prices
    expect(ema[ema.length - 1]).toBeGreaterThan(ema[0]);
  });

  it("returns single value when values.length === period", () => {
    const prices = [10, 20, 30];
    const ema = calcEma(prices, 3);
    expect(ema.length).toBe(1);
    expect(ema[0]).toBeCloseTo(20, 1);
  });
});

describe("Decision Bench — Gate verdict logic", () => {
  it("returns GO when all gates pass", () => {
    const gates = Array.from({ length: 5 }, () => ({ status: "PASS" as const }));
    expect(computeVerdict(gates)).toBe("GO");
  });

  it("returns WAIT when exactly 1 gate fails", () => {
    const gates = [
      { status: "FAIL" as const },
      ...Array.from({ length: 4 }, () => ({ status: "PASS" as const })),
    ];
    expect(computeVerdict(gates)).toBe("WAIT");
  });

  it("returns NO-GO when 2 or more gates fail", () => {
    const gates = [
      { status: "FAIL" as const },
      { status: "FAIL" as const },
      ...Array.from({ length: 3 }, () => ({ status: "PASS" as const })),
    ];
    expect(computeVerdict(gates)).toBe("NO-GO");
  });

  it("returns WAIT when 3 or more gates warn", () => {
    const gates = [
      { status: "WARN" as const },
      { status: "WARN" as const },
      { status: "WARN" as const },
      { status: "PASS" as const },
      { status: "PASS" as const },
    ];
    expect(computeVerdict(gates)).toBe("WAIT");
  });

  it("returns GO when only 2 gates warn", () => {
    const gates = [
      { status: "WARN" as const },
      { status: "WARN" as const },
      { status: "PASS" as const },
      { status: "PASS" as const },
      { status: "PASS" as const },
    ];
    expect(computeVerdict(gates)).toBe("GO");
  });
});

describe("Decision Bench — Sector concentration", () => {
  const SECTOR_MAP: Record<string, string> = {
    WDC: "Memory/Storage",
    NVDA: "Semiconductors",
    TSLA: "High Volatility",
    META: "AdTech/Mobile",
    AMZN: "Cloud/Software",
    PLTR: "Defense AI",
    SMCI: "AI Servers",
    LITE: "Photonics/Telecom",
  };

  function checkConcentration(newTicker: string, openTickers: string[]): boolean {
    const newSector = SECTOR_MAP[newTicker];
    if (!newSector) return false;
    const sameSector = openTickers.filter(t => SECTOR_MAP[t] === newSector);
    return sameSector.length >= 2;
  }

  it("flags concentration when 2 same-sector positions already open", () => {
    // WDC and SMCI are both in storage/AI server but different sectors in our map
    // Let's use a scenario where we add a 3rd "Cloud/Software" when 2 are open
    const openPositions = ["AMZN", "AMZN"]; // same sector
    expect(checkConcentration("AMZN", openPositions)).toBe(true);
  });

  it("does not flag when only 1 same-sector position open", () => {
    expect(checkConcentration("NVDA", ["WDC", "TSLA"])).toBe(false);
  });

  it("does not flag for unknown ticker", () => {
    expect(checkConcentration("UNKNOWN", ["WDC", "NVDA"])).toBe(false);
  });
});
