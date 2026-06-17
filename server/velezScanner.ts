/**
 * velezScanner.ts — Velez Scanner Engine for PitDesk
 *
 * Scans for stocks that dropped sharply from an uptrend (Velez daily signal).
 * Augmented with:
 *  - Fibonacci retracement overlay (23.6%, 38.2%, 50%, 61.8%, 78.6%)
 *  - Fibonacci extension targets (127.2%, 161.8%, 261.8%)
 *  - Fib + EMA confluence flag (within 1% of both simultaneously)
 */
import { callDataApi } from "./_core/dataApi";
import {
  FibExtensionResult,
  FibRetracementResult,
  calcAllEmas,
  calcFibExtensions,
  calcFibRetracements,
  detectFibEmaConfluence,
  findSwingHighLow,
  type FibEmaConfluence,
} from "./fibEngine";

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VelezDailySignal {
  ticker: string;
  signalDate: string;
  entry: number;
  target25: number;
  target50: number;
  stop: number;
  dropPct: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  // Fibonacci overlays
  swingHigh: number;
  swingLow: number;
  fibRetracements: FibRetracementResult[];
  fibExtensions: FibExtensionResult[];
  // EMA values
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  // Confluence
  fibEmaConfluences: FibEmaConfluence[];
  hasConfluence: boolean;
}

export interface VelezIntradaySignal {
  ticker: string;
  signalTime: string;
  entry: number;
  target25: number;
  target50: number;
  stop: number;
  dropPct: number;
  volume: number;
  fibRetracements: FibRetracementResult[];
  fibExtensions: FibExtensionResult[];
  fibEmaConfluences: FibEmaConfluence[];
  hasConfluence: boolean;
}

async function fetchPriceHistory(
  ticker: string,
  interval: "1d" | "5m" = "1d",
  range: string = "3mo"
): Promise<PriceBar[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { ticker, interval, range },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = result;
    const chart = data?.chart?.result?.[0];
    if (!chart) return [];
    const timestamps: number[] = chart.timestamp ?? [];
    const q = chart.indicators?.quote?.[0] ?? {};
    return timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      open: q.open?.[i] ?? 0,
      high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0,
      close: q.close?.[i] ?? 0,
      volume: q.volume?.[i] ?? 0,
    })).filter((b: PriceBar) => b.close > 0);
  } catch {
    return [];
  }
}

function calcAvgVolume(bars: PriceBar[], lookback = 20): number {
  const slice = bars.slice(-lookback - 1, -1);
  if (slice.length === 0) return 0;
  return slice.reduce((s, b) => s + b.volume, 0) / slice.length;
}

export async function runVelezDailyScanner(
  tickers: string[],
  thresholdPct = 1.0
): Promise<VelezDailySignal[]> {
  const signals: VelezDailySignal[] = [];

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const bars = await fetchPriceHistory(ticker, "1d", "3mo");
      if (bars.length < 22) return;

      const prev = bars[bars.length - 2];
      const curr = bars[bars.length - 1];
      if (!prev || !curr) return;

      // Velez signal: ≥2% drop, prior bar above 9-SMA, close in bottom 35% of range
      const dropPct = ((prev.close - curr.close) / prev.close) * 100;
      if (dropPct < 2) return;

      const closes = bars.map((b) => b.close);
      const sma9 = closes.slice(-10, -1).reduce((s, c) => s + c, 0) / 9;
      if (prev.close < sma9) return;

      const rangeSize = curr.high - curr.low;
      const closePosition = rangeSize > 0 ? (curr.close - curr.low) / rangeSize : 0.5;
      if (closePosition > 0.35) return;

      const avgVolume = calcAvgVolume(bars);
      const volumeRatio = avgVolume > 0 ? curr.volume / avgVolume : 0;
      if (volumeRatio < 1.2) return;

      // Fibonacci calculations
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);
      const { swingHigh, swingLow } = findSwingHighLow(highs, lows, 50);
      const fibRetracements = calcFibRetracements(swingHigh, swingLow);
      const fibExtensions = calcFibExtensions(swingHigh, swingLow);

      // EMA calculations
      const emas = calcAllEmas(closes);
      const ema9 = emas.find((e) => e.period === 9)?.value ?? null;
      const ema20 = emas.find((e) => e.period === 20)?.value ?? null;
      const ema50 = emas.find((e) => e.period === 50)?.value ?? null;
      const ema200 = emas.find((e) => e.period === 200)?.value ?? null;

      // Confluence detection
      const fibEmaConfluences = detectFibEmaConfluence(
        curr.close,
        closes,
        swingHigh,
        swingLow,
        thresholdPct
      );

      // Classic Velez targets: 25% and 50% retracement of the drop
      const dropAmount = prev.close - curr.close;
      const target25 = curr.close + dropAmount * 0.25;
      const target50 = curr.close + dropAmount * 0.5;
      const stop = curr.low * 0.99;

      signals.push({
        ticker,
        signalDate: curr.date,
        entry: curr.close,
        target25,
        target50,
        stop,
        dropPct,
        volume: curr.volume,
        avgVolume,
        volumeRatio,
        swingHigh,
        swingLow,
        fibRetracements,
        fibExtensions,
        ema9,
        ema20,
        ema50,
        ema200,
        fibEmaConfluences,
        hasConfluence: fibEmaConfluences.length > 0,
      });
    })
  );

  return signals.sort((a, b) => b.dropPct - a.dropPct);
}

export async function runVelezIntradayScanner(
  tickers: string[],
  thresholdPct = 1.0
): Promise<VelezIntradaySignal[]> {
  const signals: VelezIntradaySignal[] = [];

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const bars = await fetchPriceHistory(ticker, "5m", "1d");
      if (bars.length < 10) return;

      const prev = bars[bars.length - 2];
      const curr = bars[bars.length - 1];
      if (!prev || !curr) return;

      const dropPct = ((prev.close - curr.close) / prev.close) * 100;
      if (dropPct < 0.5) return;

      const closes = bars.map((b) => b.close);
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);

      const { swingHigh, swingLow } = findSwingHighLow(highs, lows, Math.min(bars.length, 30));
      const fibRetracements = calcFibRetracements(swingHigh, swingLow);
      const fibExtensions = calcFibExtensions(swingHigh, swingLow);
      const fibEmaConfluences = detectFibEmaConfluence(
        curr.close,
        closes,
        swingHigh,
        swingLow,
        thresholdPct
      );

      const dropAmount = prev.close - curr.close;
      const target25 = curr.close + dropAmount * 0.25;
      const target50 = curr.close + dropAmount * 0.5;
      const stop = curr.low * 0.995;

      signals.push({
        ticker,
        signalTime: curr.date,
        entry: curr.close,
        target25,
        target50,
        stop,
        dropPct,
        volume: curr.volume,
        fibRetracements,
        fibExtensions,
        fibEmaConfluences,
        hasConfluence: fibEmaConfluences.length > 0,
      });
    })
  );

  return signals.sort((a, b) => b.dropPct - a.dropPct);
}
