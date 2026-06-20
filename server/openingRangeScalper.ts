/**
 * Opening Range Scalper — "Quick Flip Scalper" strategy
 *
 * Strategy rules (from video analysis):
 * 1. Box the first 15-minute candle of the session (9:30–9:45 AM ET)
 * 2. ATR Gate: 15m candle size ≥ 25% of Daily ATR-14 → confirms "liquidity candle"
 * 3. Within 90 minutes of open (9:30–11:00 AM ET), look for price to break OUTSIDE the box
 * 4. A reversal candle must form outside the box:
 *    - If 15m candle was Bullish (green): price breaks ABOVE box → look for Inverted Hammer or Bearish Engulfing → SHORT
 *    - If 15m candle was Bearish (red): price breaks BELOW box → look for Hammer or Bullish Engulfing → LONG
 * 5. Entry: break of reversal candle; Stop: beyond reversal candle extreme; TP1: near box edge; TP2: far box edge
 */

import { callDataApi } from "./_core/dataApi";

export interface PriceBar {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ReversalPattern =
  | "HAMMER"
  | "INVERTED_HAMMER"
  | "BULLISH_ENGULFING"
  | "BEARISH_ENGULFING"
  | "NONE";

export type OrsDirection = "LONG" | "SHORT" | "NONE";

export interface OrsSignal {
  ticker: string;
  direction: OrsDirection;
  // Opening range box
  boxHigh: number;
  boxLow: number;
  boxSize: number;
  // ATR gate
  dailyAtr: number;
  atrThreshold: number; // 25% of dailyAtr
  atrGatePassed: boolean;
  // 15m candle character
  openingCandleBullish: boolean;
  // Reversal setup
  reversalPattern: ReversalPattern;
  reversalCandleHigh: number;
  reversalCandleLow: number;
  // Trade levels
  entryPrice: number;
  stopLoss: number;
  tp1: number; // near box edge
  tp2: number; // far box edge
  riskReward: number;
  // Current price
  currentPrice: number;
  // Timing
  scannedAt: string; // ISO
  withinWindow: boolean; // still within 90-min window
  // Status
  status: "SETUP_READY" | "WATCHING" | "NO_GATE" | "NO_SIGNAL" | "WINDOW_CLOSED";
  statusReason: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchIntraday15m(ticker: string): Promise<PriceBar[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { ticker, interval: "15m", range: "1d" },
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
      .filter((b) => b.close > 0 && b.open > 0);
  } catch {
    return [];
  }
}

async function fetchDaily(ticker: string): Promise<PriceBar[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { ticker, interval: "1d", range: "1mo" },
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
      .filter((b) => b.close > 0);
  } catch {
    return [];
  }
}

/** ATR-14 from daily bars */
function calcDailyAtr(bars: PriceBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const recent = bars.slice(-(period + 1));
  let atrSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const curr = recent[i];
    const prev = recent[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    atrSum += tr;
  }
  return atrSum / period;
}

/** Detect reversal candle pattern */
function detectReversalPattern(bar: PriceBar): ReversalPattern {
  const bodySize = Math.abs(bar.close - bar.open);
  const totalRange = bar.high - bar.low;
  if (totalRange === 0) return "NONE";
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const bodyRatio = bodySize / totalRange;

  // Hammer: small body at top, long lower wick (≥2× body), minimal upper wick
  if (lowerWick >= bodySize * 2 && upperWick <= bodySize * 0.5 && bodyRatio < 0.4) {
    return "HAMMER";
  }
  // Inverted Hammer: small body at bottom, long upper wick (≥2× body), minimal lower wick
  if (upperWick >= bodySize * 2 && lowerWick <= bodySize * 0.5 && bodyRatio < 0.4) {
    return "INVERTED_HAMMER";
  }
  return "NONE";
}

/** Check engulfing vs previous bar */
function detectEngulfing(prev: PriceBar, curr: PriceBar): ReversalPattern {
  const prevBullish = prev.close > prev.open;
  const currBullish = curr.close > curr.open;
  // Bullish engulfing: prev bearish, curr bullish body engulfs prev body
  if (!prevBullish && currBullish && curr.open <= prev.close && curr.close >= prev.open) {
    return "BULLISH_ENGULFING";
  }
  // Bearish engulfing: prev bullish, curr bearish body engulfs prev body
  if (prevBullish && !currBullish && curr.open >= prev.close && curr.close <= prev.open) {
    return "BEARISH_ENGULFING";
  }
  return "NONE";
}

/** Is this bar within the 90-minute window (9:30–11:00 AM ET)? */
function isWithinWindow(bar: PriceBar): boolean {
  const d = new Date(bar.timestamp);
  // Convert to ET (UTC-4 in EDT, UTC-5 in EST — use UTC-4 for summer trading)
  const etHour = (d.getUTCHours() - 4 + 24) % 24;
  const etMin = d.getUTCMinutes();
  const minutesSinceOpen = (etHour - 9) * 60 + etMin - 30;
  return minutesSinceOpen >= 0 && minutesSinceOpen <= 90;
}

/** Is this bar the first 15-min candle (9:30–9:45 AM ET)? */
function isOpeningCandle(bar: PriceBar): boolean {
  const d = new Date(bar.timestamp);
  const etHour = (d.getUTCHours() - 4 + 24) % 24;
  const etMin = d.getUTCMinutes();
  return etHour === 9 && etMin === 30;
}

// ─── Main Scanner ────────────────────────────────────────────────────────────

export async function scanOpeningRangeScalper(ticker: string): Promise<OrsSignal> {
  const now = new Date().toISOString();
  const noSignal = (status: OrsSignal["status"], reason: string): OrsSignal => ({
    ticker,
    direction: "NONE",
    boxHigh: 0,
    boxLow: 0,
    boxSize: 0,
    dailyAtr: 0,
    atrThreshold: 0,
    atrGatePassed: false,
    openingCandleBullish: false,
    reversalPattern: "NONE",
    reversalCandleHigh: 0,
    reversalCandleLow: 0,
    entryPrice: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    riskReward: 0,
    currentPrice: 0,
    scannedAt: now,
    withinWindow: false,
    status,
    statusReason: reason,
  });

  try {
    // Fetch daily bars for ATR
    const dailyBars = await fetchDaily(ticker);
    if (dailyBars.length < 15) return noSignal("NO_SIGNAL", "Insufficient daily data");

    const dailyAtr = calcDailyAtr(dailyBars);
    if (dailyAtr === 0) return noSignal("NO_SIGNAL", "ATR calculation failed");
    const atrThreshold = dailyAtr * 0.25;

    // Fetch 15-min intraday bars
    const bars15m = await fetchIntraday15m(ticker);
    if (bars15m.length < 2) return noSignal("NO_SIGNAL", "Insufficient intraday data");

    // Find the opening candle (first 15-min bar at 9:30 AM ET)
    const openingBar = bars15m.find(isOpeningCandle);
    if (!openingBar) return noSignal("WATCHING", "Market not yet open or opening candle not found");

    const boxHigh = openingBar.high;
    const boxLow = openingBar.low;
    const boxSize = boxHigh - boxLow;
    const openingCandleBullish = openingBar.close >= openingBar.open;
    const currentPrice = bars15m[bars15m.length - 1].close;

    // ATR Gate check
    const atrGatePassed = boxSize >= atrThreshold;
    if (!atrGatePassed) {
      return {
        ...noSignal("NO_GATE", `Opening candle (${boxSize.toFixed(2)}) < 25% ATR (${atrThreshold.toFixed(2)})`),
        boxHigh,
        boxLow,
        boxSize,
        dailyAtr,
        atrThreshold,
        openingCandleBullish,
        currentPrice,
        withinWindow: bars15m.some(isWithinWindow),
      };
    }

    // Get bars after the opening candle, within the 90-min window
    const postOpenBars = bars15m.filter(
      (b) => b.timestamp > openingBar.timestamp && isWithinWindow(b)
    );

    if (postOpenBars.length === 0) {
      return {
        ...noSignal("WATCHING", "Waiting for post-open bars within 90-min window"),
        boxHigh,
        boxLow,
        boxSize,
        dailyAtr,
        atrThreshold,
        atrGatePassed: true,
        openingCandleBullish,
        currentPrice,
        withinWindow: true,
      };
    }

    // Check if window is still open
    const lastBar = bars15m[bars15m.length - 1];
    const withinWindow = isWithinWindow(lastBar);

    if (!withinWindow && postOpenBars.length === 0) {
      return noSignal("WINDOW_CLOSED", "90-minute window has closed without a signal");
    }

    // Look for breakout + reversal
    for (let i = 0; i < postOpenBars.length; i++) {
      const bar = postOpenBars[i];
      const prevBar = i > 0 ? postOpenBars[i - 1] : openingBar;

      // Bullish opening candle → look for break ABOVE box → SHORT setup
      if (openingCandleBullish) {
        if (bar.high > boxHigh) {
          // Price broke above box — look for reversal
          let pattern = detectReversalPattern(bar);
          if (pattern === "NONE") {
            pattern = detectEngulfing(prevBar, bar);
          }
          const isReversalPattern =
            pattern === "INVERTED_HAMMER" || pattern === "BEARISH_ENGULFING";
          if (isReversalPattern) {
            const entryPrice = bar.low; // Enter on break below reversal candle
            const stopLoss = bar.high + dailyAtr * 0.05; // Just above the reversal candle high
            const tp1 = boxHigh; // Near box edge
            const tp2 = boxLow; // Far box edge
            const risk = stopLoss - entryPrice;
            const reward = entryPrice - tp2;
            return {
              ticker,
              direction: "SHORT",
              boxHigh,
              boxLow,
              boxSize,
              dailyAtr,
              atrThreshold,
              atrGatePassed: true,
              openingCandleBullish,
              reversalPattern: pattern,
              reversalCandleHigh: bar.high,
              reversalCandleLow: bar.low,
              entryPrice,
              stopLoss,
              tp1,
              tp2,
              riskReward: risk > 0 ? reward / risk : 0,
              currentPrice,
              scannedAt: now,
              withinWindow,
              status: "SETUP_READY",
              statusReason: `${pattern} above box — SHORT into opening range`,
            };
          }
        }
      } else {
        // Bearish opening candle → look for break BELOW box → LONG setup
        if (bar.low < boxLow) {
          let pattern = detectReversalPattern(bar);
          if (pattern === "NONE") {
            pattern = detectEngulfing(prevBar, bar);
          }
          const isReversalPattern =
            pattern === "HAMMER" || pattern === "BULLISH_ENGULFING";
          if (isReversalPattern) {
            const entryPrice = bar.high; // Enter on break above reversal candle
            const stopLoss = bar.low - dailyAtr * 0.05; // Just below the reversal candle low
            const tp1 = boxLow; // Near box edge
            const tp2 = boxHigh; // Far box edge
            const risk = entryPrice - stopLoss;
            const reward = tp2 - entryPrice;
            return {
              ticker,
              direction: "LONG",
              boxHigh,
              boxLow,
              boxSize,
              dailyAtr,
              atrThreshold,
              atrGatePassed: true,
              openingCandleBullish,
              reversalPattern: pattern,
              reversalCandleHigh: bar.high,
              reversalCandleLow: bar.low,
              entryPrice,
              stopLoss,
              tp1,
              tp2,
              riskReward: risk > 0 ? reward / risk : 0,
              currentPrice,
              scannedAt: now,
              withinWindow,
              status: "SETUP_READY",
              statusReason: `${pattern} below box — LONG back into opening range`,
            };
          }
        }
      }
    }

    // ATR gate passed, within window, but no reversal pattern yet
    const status = withinWindow ? "WATCHING" : "WINDOW_CLOSED";
    const reason = withinWindow
      ? "ATR gate passed — watching for breakout + reversal candle"
      : "Window closed — no reversal pattern formed";

    return {
      ...noSignal(status, reason),
      boxHigh,
      boxLow,
      boxSize,
      dailyAtr,
      atrThreshold,
      atrGatePassed: true,
      openingCandleBullish,
      currentPrice,
      withinWindow,
    };
  } catch (err) {
    console.error(`[ORS] Error scanning ${ticker}:`, (err as Error).message);
    return noSignal("NO_SIGNAL", `Error: ${(err as Error).message}`);
  }
}

/** Batch scan multiple tickers */
export async function runOpeningRangeScalperScan(
  tickers: string[]
): Promise<OrsSignal[]> {
  const results = await Promise.allSettled(
    tickers.map((t) => scanOpeningRangeScalper(t))
  );
  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter(Boolean) as OrsSignal[];
}
