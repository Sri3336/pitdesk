/**
 * ICT Liquidity Scanner — Internal vs External Liquidity Framework
 *
 * Based on the ICT/SMC methodology from the video:
 *   - External Liquidity: swing highs/lows where stop clusters live (price hunts these)
 *   - Internal Liquidity: old resistance that becomes support after a breakout (retest zones)
 *
 * For premium sellers (Sri's use case):
 *   - SELL_PUT_ZONE  → price above internal support, bullish structure → sell puts below
 *   - SELL_CALL_ZONE → price below internal resistance, bearish structure → sell calls above
 *   - NEUTRAL        → no clear structure / inside range
 *   - AVOID          → price at external liquidity target (stop hunt in progress)
 *
 * Data: Yahoo Finance daily bars (HTF) + 5-min intraday (LTF)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceBar {
  timestamp?: number;
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SellZone = "SELL_PUT_ZONE" | "SELL_CALL_ZONE" | "NEUTRAL" | "AVOID";
export type DirectionBias = "BULLISH" | "BEARISH" | "SIDEWAYS";
export type RetestStatus = "HOLDING" | "REJECTED" | "PENDING" | "NONE";

export interface LiquidityLevel {
  price: number;
  type: "external_high" | "external_low" | "internal_support" | "internal_resistance";
  date: string;
  strength: "strong" | "moderate" | "weak";
  tested: boolean;       // has price returned to this level?
  holding: boolean;      // is price currently respecting this level?
}

export interface OpeningRange {
  high: number;
  low: number;
  mid: number;
  size: number;          // high - low
  sizePct: number;       // as % of price
  breakoutSide: "above" | "below" | "none";
  retestStatus: RetestStatus;
  retestLevel: number | null;
}

export interface IctLiquidityResult {
  ticker: string;
  currentPrice: number;
  // Direction
  htfBias: DirectionBias;           // Daily chart bias
  ltfBias: DirectionBias;           // Intraday bias
  combinedBias: DirectionBias;      // HTF + LTF agreement
  // Liquidity levels
  prevDayHigh: number;
  prevDayLow: number;
  prevDayMid: number;
  externalHigh: number;             // recent swing high (external liquidity target)
  externalLow: number;              // recent swing low (external liquidity target)
  nearestInternalSupport: number | null;
  nearestInternalResistance: number | null;
  levels: LiquidityLevel[];
  // Opening range (LTF)
  openingRange: OpeningRange | null;
  // Premium selling signal
  sellZone: SellZone;
  sellZoneReason: string;
  // Strike guidance for premium sellers
  suggestedPutStrike: number | null;    // sell puts below this level
  suggestedCallStrike: number | null;   // sell calls above this level
  // Risk context
  distanceToPrevHigh: number;           // % distance from current price to prev day high
  distanceToPrevLow: number;            // % distance from current price to prev day low
  distanceToExtHigh: number;            // % distance to external high (stop hunt target)
  distanceToExtLow: number;             // % distance to external low (stop hunt target)
  // Meta
  scanTime: string;
  error?: string;
}

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchDailyBars(ticker: string): Promise<PriceBar[]> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        region: "US",
        interval: "1d",
        range: "3mo",
        includeAdjustedClose: "true",
      },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return [];
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const bars: PriceBar[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      if (!quote.close[i]) continue;
      bars.push({
        date: new Date(timestamp[i] * 1000).toISOString().split("T")[0],
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

async function fetchIntraday5m(ticker: string): Promise<PriceBar[]> {
  try {
    const result: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { ticker, interval: "5m", range: "1d" },
    });
    const chart = result?.chart?.result?.[0];
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
      .filter((b) => b.close > 0 && b.open > 0);
  } catch {
    return [];
  }
}

// ─── Analysis Engine ──────────────────────────────────────────────────────────

function detectSwings(bars: PriceBar[], lookback = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const slice = bars.slice(i - lookback, i + lookback + 1);
    const isSwingHigh = bars[i].high === Math.max(...slice.map((b) => b.high));
    const isSwingLow = bars[i].low === Math.min(...slice.map((b) => b.low));
    if (isSwingHigh) highs.push(bars[i].high);
    if (isSwingLow) lows.push(bars[i].low);
  }
  return { highs, lows };
}

function detectHTFBias(bars: PriceBar[]): DirectionBias {
  if (bars.length < 20) return "SIDEWAYS";
  const recent = bars.slice(-20);
  const ema20 = recent.reduce((s, b) => s + b.close, 0) / 20;
  const last = bars[bars.length - 1].close;
  const prev5 = bars.slice(-5);
  const higherHighs = prev5.filter((b, i) => i > 0 && b.high > prev5[i - 1].high).length;
  const lowerLows = prev5.filter((b, i) => i > 0 && b.low < prev5[i - 1].low).length;
  if (last > ema20 * 1.005 && higherHighs >= 2) return "BULLISH";
  if (last < ema20 * 0.995 && lowerLows >= 2) return "BEARISH";
  return "SIDEWAYS";
}

function detectLTFBias(bars5m: PriceBar[]): DirectionBias {
  if (bars5m.length < 10) return "SIDEWAYS";
  const recent = bars5m.slice(-10);
  const firstClose = recent[0].close;
  const lastClose = recent[recent.length - 1].close;
  const changePct = (lastClose - firstClose) / firstClose;
  if (changePct > 0.003) return "BULLISH";
  if (changePct < -0.003) return "BEARISH";
  return "SIDEWAYS";
}

function getOpeningRange(bars5m: PriceBar[]): OpeningRange | null {
  if (bars5m.length < 2) return null;
  // Opening range = first 5-min candle (9:30-9:35 ET)
  // Identify by finding bars around market open (9:30 ET = 13:30 UTC)
  const marketOpenMs = (() => {
    const now = new Date();
    const d = new Date(now);
    d.setUTCHours(13, 30, 0, 0); // 9:30 ET = 13:30 UTC
    return d.getTime();
  })();

  // Find the first candle at or after market open
  const openingBar = bars5m.find(
    (b) => b.timestamp != null && b.timestamp >= marketOpenMs - 5 * 60 * 1000
  ) ?? bars5m[0];

  const orHigh = openingBar.high;
  const orLow = openingBar.low;
  const orMid = (orHigh + orLow) / 2;
  const orSize = orHigh - orLow;
  const orSizePct = orSize / orLow;

  // Check if price has broken out of the opening range
  const laterBars = bars5m.slice(1);
  const currentPrice = bars5m[bars5m.length - 1].close;
  let breakoutSide: "above" | "below" | "none" = "none";
  let retestStatus: RetestStatus = "NONE";
  let retestLevel: number | null = null;

  const brokeAbove = laterBars.some((b) => b.high > orHigh);
  const brokeBelow = laterBars.some((b) => b.low < orLow);

  if (brokeAbove && !brokeBelow) {
    breakoutSide = "above";
    retestLevel = orHigh; // old resistance = new internal support
    // Check if price has come back to retest this level
    const afterBreakout = laterBars.filter((b) => b.high > orHigh);
    const retestBars = afterBreakout.filter((b) => b.low <= orHigh * 1.002 && b.low >= orHigh * 0.997);
    if (retestBars.length > 0) {
      retestStatus = currentPrice > orHigh ? "HOLDING" : "REJECTED";
    } else {
      retestStatus = "PENDING";
    }
  } else if (brokeBelow && !brokeAbove) {
    breakoutSide = "below";
    retestLevel = orLow; // old support = new internal resistance
    const afterBreakout = laterBars.filter((b) => b.low < orLow);
    const retestBars = afterBreakout.filter((b) => b.high >= orLow * 0.998 && b.high <= orLow * 1.003);
    if (retestBars.length > 0) {
      retestStatus = currentPrice < orLow ? "HOLDING" : "REJECTED";
    } else {
      retestStatus = "PENDING";
    }
  }

  return { high: orHigh, low: orLow, mid: orMid, size: orSize, sizePct: orSizePct, breakoutSide, retestStatus, retestLevel };
}

function classifySellZone(
  currentPrice: number,
  htfBias: DirectionBias,
  ltfBias: DirectionBias,
  openingRange: OpeningRange | null,
  prevDayHigh: number,
  prevDayLow: number,
  externalHigh: number,
  externalLow: number,
): { zone: SellZone; reason: string } {
  const distToExtHigh = (externalHigh - currentPrice) / currentPrice;
  const distToExtLow = (currentPrice - externalLow) / currentPrice;

  // AVOID: price is at or very near an external liquidity target (stop hunt zone)
  if (distToExtHigh < 0.005 || distToExtLow < 0.005) {
    return { zone: "AVOID", reason: "Price at external liquidity target — stop hunt in progress, wait for resolution" };
  }

  // AVOID: price is right at prev day high/low (liquidity sweep risk)
  const distToPrevHigh = (prevDayHigh - currentPrice) / currentPrice;
  const distToPrevLow = (currentPrice - prevDayLow) / currentPrice;
  if (distToPrevHigh < 0.003 || distToPrevLow < 0.003) {
    return { zone: "AVOID", reason: "Price at previous day high/low — liquidity sweep risk, wait for clear direction" };
  }

  // SELL_PUT_ZONE: bullish HTF + LTF holding above internal support (OR retest holding)
  if (htfBias === "BULLISH" && ltfBias !== "BEARISH") {
    if (openingRange?.breakoutSide === "above" && openingRange.retestStatus === "HOLDING") {
      return { zone: "SELL_PUT_ZONE", reason: "Bullish HTF + OR breakout-retest holding → sell puts below OR high (internal support)" };
    }
    if (currentPrice > prevDayHigh) {
      return { zone: "SELL_PUT_ZONE", reason: "Bullish HTF + price above prev day high → sell puts below prev day high (new internal support)" };
    }
    return { zone: "SELL_PUT_ZONE", reason: "Bullish HTF structure → sell puts below prev day low or nearest support" };
  }

  // SELL_CALL_ZONE: bearish HTF + LTF holding below internal resistance
  if (htfBias === "BEARISH" && ltfBias !== "BULLISH") {
    if (openingRange?.breakoutSide === "below" && openingRange.retestStatus === "HOLDING") {
      return { zone: "SELL_CALL_ZONE", reason: "Bearish HTF + OR breakdown-retest holding → sell calls above OR low (internal resistance)" };
    }
    if (currentPrice < prevDayLow) {
      return { zone: "SELL_CALL_ZONE", reason: "Bearish HTF + price below prev day low → sell calls above prev day low (new internal resistance)" };
    }
    return { zone: "SELL_CALL_ZONE", reason: "Bearish HTF structure → sell calls above prev day high or nearest resistance" };
  }

  // NEUTRAL: conflicting signals or sideways
  if (openingRange?.retestStatus === "PENDING") {
    return { zone: "NEUTRAL", reason: "Waiting for opening range retest to confirm direction — enter after retest confirms" };
  }

  return { zone: "NEUTRAL", reason: "No clear ICT structure — HTF and LTF signals conflict or sideways" };
}

async function analyzeOneTicker(ticker: string): Promise<IctLiquidityResult> {
  const scanTime = new Date().toISOString();
  const empty: IctLiquidityResult = {
    ticker,
    currentPrice: 0,
    htfBias: "SIDEWAYS",
    ltfBias: "SIDEWAYS",
    combinedBias: "SIDEWAYS",
    prevDayHigh: 0,
    prevDayLow: 0,
    prevDayMid: 0,
    externalHigh: 0,
    externalLow: 0,
    nearestInternalSupport: null,
    nearestInternalResistance: null,
    levels: [],
    openingRange: null,
    sellZone: "NEUTRAL",
    sellZoneReason: "Insufficient data",
    suggestedPutStrike: null,
    suggestedCallStrike: null,
    distanceToPrevHigh: 0,
    distanceToPrevLow: 0,
    distanceToExtHigh: 0,
    distanceToExtLow: 0,
    scanTime,
    error: "Insufficient data",
  };

  try {
    const [dailyBars, bars5m] = await Promise.all([
      fetchDailyBars(ticker),
      fetchIntraday5m(ticker),
    ]);

    if (dailyBars.length < 10) return { ...empty, error: "Insufficient daily data" };

    const currentPrice = dailyBars[dailyBars.length - 1].close;
    const prevDay = dailyBars[dailyBars.length - 2];
    const prevDayHigh = prevDay.high;
    const prevDayLow = prevDay.low;
    const prevDayMid = (prevDayHigh + prevDayLow) / 2;

    // Detect swing highs/lows for external liquidity levels
    const { highs, lows } = detectSwings(dailyBars.slice(-30), 3);
    const externalHigh = highs.length > 0 ? Math.max(...highs) : prevDayHigh * 1.02;
    const externalLow = lows.length > 0 ? Math.min(...lows) : prevDayLow * 0.98;

    // HTF bias from daily bars
    const htfBias = detectHTFBias(dailyBars);

    // LTF bias from 5-min bars
    const ltfBias = bars5m.length >= 5 ? detectLTFBias(bars5m) : "SIDEWAYS";

    // Combined bias: both agree = strong signal, else use HTF
    const combinedBias: DirectionBias =
      htfBias === ltfBias ? htfBias :
      htfBias !== "SIDEWAYS" ? htfBias :
      ltfBias;

    // Opening range analysis
    const openingRange = bars5m.length >= 2 ? getOpeningRange(bars5m) : null;

    // Build liquidity levels array
    const levels: LiquidityLevel[] = [];
    const today = new Date().toISOString().split("T")[0];
    const yesterday = prevDay.date ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

    levels.push({
      price: prevDayHigh,
      type: currentPrice > prevDayHigh ? "internal_support" : "external_high",
      date: yesterday,
      strength: "strong",
      tested: currentPrice > prevDayHigh,
      holding: currentPrice > prevDayHigh,
    });
    levels.push({
      price: prevDayLow,
      type: currentPrice < prevDayLow ? "internal_resistance" : "external_low",
      date: yesterday,
      strength: "strong",
      tested: currentPrice < prevDayLow,
      holding: currentPrice < prevDayLow,
    });
    if (externalHigh !== prevDayHigh) {
      levels.push({
        price: externalHigh,
        type: "external_high",
        date: today,
        strength: "moderate",
        tested: false,
        holding: false,
      });
    }
    if (externalLow !== prevDayLow) {
      levels.push({
        price: externalLow,
        type: "external_low",
        date: today,
        strength: "moderate",
        tested: false,
        holding: false,
      });
    }
    if (openingRange) {
      if (openingRange.breakoutSide === "above") {
        levels.push({
          price: openingRange.high,
          type: "internal_support",
          date: today,
          strength: openingRange.retestStatus === "HOLDING" ? "strong" : "moderate",
          tested: openingRange.retestStatus !== "PENDING" && openingRange.retestStatus !== "NONE",
          holding: openingRange.retestStatus === "HOLDING",
        });
      } else if (openingRange.breakoutSide === "below") {
        levels.push({
          price: openingRange.low,
          type: "internal_resistance",
          date: today,
          strength: openingRange.retestStatus === "HOLDING" ? "strong" : "moderate",
          tested: openingRange.retestStatus !== "PENDING" && openingRange.retestStatus !== "NONE",
          holding: openingRange.retestStatus === "HOLDING",
        });
      }
    }

    // Find nearest internal support/resistance
    const supports = levels.filter((l) => l.type === "internal_support" && l.price < currentPrice);
    const resistances = levels.filter((l) => l.type === "internal_resistance" && l.price > currentPrice);
    const nearestInternalSupport = supports.length > 0
      ? Math.max(...supports.map((l) => l.price))
      : null;
    const nearestInternalResistance = resistances.length > 0
      ? Math.min(...resistances.map((l) => l.price))
      : null;

    // Classify sell zone
    const { zone: sellZone, reason: sellZoneReason } = classifySellZone(
      currentPrice, htfBias, ltfBias, openingRange, prevDayHigh, prevDayLow, externalHigh, externalLow
    );

    // Suggested strikes for premium sellers (round to nearest 0.5 or whole number)
    const roundStrike = (p: number) => Math.round(p * 2) / 2;
    const suggestedPutStrike = sellZone === "SELL_PUT_ZONE"
      ? roundStrike((nearestInternalSupport ?? prevDayLow) * 0.985)
      : null;
    const suggestedCallStrike = sellZone === "SELL_CALL_ZONE"
      ? roundStrike((nearestInternalResistance ?? prevDayHigh) * 1.015)
      : null;

    // Distance metrics
    const distanceToPrevHigh = ((prevDayHigh - currentPrice) / currentPrice) * 100;
    const distanceToPrevLow = ((currentPrice - prevDayLow) / currentPrice) * 100;
    const distanceToExtHigh = ((externalHigh - currentPrice) / currentPrice) * 100;
    const distanceToExtLow = ((currentPrice - externalLow) / currentPrice) * 100;

    return {
      ticker,
      currentPrice,
      htfBias,
      ltfBias,
      combinedBias,
      prevDayHigh,
      prevDayLow,
      prevDayMid,
      externalHigh,
      externalLow,
      nearestInternalSupport,
      nearestInternalResistance,
      levels,
      openingRange,
      sellZone,
      sellZoneReason,
      suggestedPutStrike,
      suggestedCallStrike,
      distanceToPrevHigh,
      distanceToPrevLow,
      distanceToExtHigh,
      distanceToExtLow,
      scanTime,
    };
  } catch (err: any) {
    return { ...empty, error: err?.message ?? "Unknown error" };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const ICT_DEFAULT_TICKERS = [
  "SPY", "QQQ", "IWM",
  "NVDA", "TSLA", "AAPL", "META", "AMZN", "MSFT", "GOOGL",
  "WDC", "LITE", "SMCI", "PLTR",
];

export const ictLiquidityRouter = router({
  /**
   * Scan one or more tickers for ICT liquidity structure
   */
  scan: protectedProcedure
    .input(z.object({
      tickers: z.array(z.string().min(1).max(10).toUpperCase()).min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      const tickers = input.tickers ?? ICT_DEFAULT_TICKERS;
      const results = await Promise.all(
        tickers.map((t) => analyzeOneTicker(t))
      );
      return {
        results,
        scanTime: new Date().toISOString(),
        totalScanned: results.length,
        sellPutZones: results.filter((r) => r.sellZone === "SELL_PUT_ZONE").length,
        sellCallZones: results.filter((r) => r.sellZone === "SELL_CALL_ZONE").length,
        avoidZones: results.filter((r) => r.sellZone === "AVOID").length,
      };
    }),

  /**
   * Scan a single ticker for detailed ICT analysis
   */
  scanOne: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }) => {
      return analyzeOneTicker(input.ticker);
    }),
});
