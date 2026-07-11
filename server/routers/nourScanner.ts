/**
 * Nour Method Scanner
 *
 * Based on the "Titans of Tomorrow" interview with Nour Trades.
 * Strategy: IV Compression + Consolidation Breakout + Relative Strength vs QQQ
 *
 * Core rules:
 *  1. IV Compression: current IV < 20-day average IV (cheap options, pre-breakout)
 *  2. Consolidation: price range tightening — ATR contracting over last 10 bars
 *  3. Relative Strength: ticker outperforming QQQ over 5/10/20 days
 *  4. Volume Surge: breakout candle volume >= 2.5× 10-day avg volume
 *  5. Breakout Confirmation: price closes above the consolidation high
 *  6. Tape Checklist: IV compression %, range tightness %, RS score, volume surge flag
 *
 * Options Play: ATM call (or put for short setups), 14-21 DTE, buy on breakout
 * Entry: wait for retest of breakout level after initial surge
 * Exit: when tape shows exhaustion (volume drying up, sellers stepping in)
 */

import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { callDataApi } from "../_core/dataApi";
import { getTradierQuote } from "../tradierClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type NourSetupPhase =
  | "BREAKOUT_NOW"      // Volume surge + price above consolidation high RIGHT NOW
  | "RETEST_ENTRY"      // Broke out, pulled back to breakout level — ideal entry
  | "CONSOLIDATING"     // IV compressed + range tightening — watch for breakout
  | "WATCH"             // Some signals present but not all aligned
  | "NO_SETUP";         // No meaningful setup

export interface TapeChecklist {
  ivCompressed: boolean;          // IV < 20-day avg
  ivCompressionPct: number;       // How much below avg (positive = compressed)
  rangeTightening: boolean;       // ATR contracting
  rangeTightnessPct: number;      // % contraction vs 20-day avg ATR
  relativeStrength: boolean;      // Outperforming QQQ
  rsScore5d: number;              // RS score vs QQQ over 5 days
  rsScore10d: number;             // RS score vs QQQ over 10 days
  volumeSurge: boolean;           // Latest bar volume >= 2.5× 10-day avg
  volumeSurgeMultiple: number;    // Actual multiple (e.g. 3.2×)
  breakoutConfirmed: boolean;     // Price > consolidation high
  retestOpportunity: boolean;     // Price near breakout level (within 1.5%)
}

export interface ConsolidationZone {
  high: number;
  low: number;
  midpoint: number;
  widthPct: number;         // (high - low) / low * 100
  barsInRange: number;      // How many bars price stayed in this zone
}

export interface OptionsPlay {
  type: "CALL" | "PUT";
  rationale: string;
  atmStrike: number;
  suggestedDTE: number;       // 14-21 days
  entryTiming: string;        // "Buy on breakout candle close" or "Buy on retest"
  stopNote: string;           // "Exit if price falls back into consolidation range"
  targetNote: string;         // "Exit when volume dries up / tape shows exhaustion"
  ivNote: string;             // "IV currently X% below 20-day avg — options are cheap"
}

export interface NourSignal {
  ticker: string;
  phase: NourSetupPhase;
  score: number;              // 0–100 composite score
  currentPrice: number;
  dayChangePct: number;
  // Consolidation zone
  zone: ConsolidationZone;
  // Tape checklist
  tape: TapeChecklist;
  // Options play
  optionsPlay: OptionsPlay | null;
  // Relative strength details
  qqqChangePct5d: number;
  tickerChangePct5d: number;
  qqqChangePct10d: number;
  tickerChangePct10d: number;
  // ATR info
  atr14: number;
  atr14Avg20: number;         // 20-day avg of ATR14
  // Volume info
  avgVolume10d: number;
  latestVolume: number;
  // Nour's key insight for this setup
  setupNote: string;
  scannedAt: string;
}

// ─── Default tickers (Nour focuses on tech/semis vs QQQ) ─────────────────────

const DEFAULT_TICKERS = [
  // Nour's focus: tech vs QQQ
  "NVDA", "TSLA", "AMZN", "META", "GOOGL", "AAPL", "MSFT",
  // Semis
  "AMD", "SMCI", "AVGO", "MU", "QCOM",
  // Sri's active watchlist
  "SNDK", "WDC", "ASML", "PLTR", "APP",
  // ETFs for relative strength baseline
  "QQQ", "SPY", "SMH",
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcEMA(bars: PriceBar[], period: number): number[] {
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let ema = bars[0].close;
  emas.push(ema);
  for (let i = 1; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

function calcATR(bars: PriceBar[], period = 14): number[] {
  const trs: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
  }
  // Wilder smoothing for ATR
  const atrs: number[] = new Array(period - 1).fill(0);
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrs.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrs.push(atr);
  }
  return atrs;
}

function calcHV(bars: PriceBar[], period = 20): number {
  // Historical Volatility (annualized) as IV proxy
  if (bars.length < period + 1) return 0;
  const returns: number[] = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const r = Math.log(bars[i].close / bars[i - 1].close);
    returns.push(r);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance * 252) * 100; // annualized %
}

function calcHVSeries(bars: PriceBar[], period = 20): number[] {
  const hvs: number[] = new Array(period).fill(0);
  for (let i = period; i < bars.length; i++) {
    const slice = bars.slice(i - period, i + 1);
    hvs.push(calcHV(slice, period));
  }
  return hvs;
}

function detectConsolidationZone(bars: PriceBar[], lookback = 15): ConsolidationZone {
  const recent = bars.slice(-lookback);
  const high = Math.max(...recent.map(b => b.high));
  const low = Math.min(...recent.map(b => b.low));
  const midpoint = (high + low) / 2;
  const widthPct = low > 0 ? ((high - low) / low) * 100 : 0;

  // Count how many bars stayed within the zone (within 5% of midpoint)
  let barsInRange = 0;
  for (const b of recent) {
    const distFromMid = Math.abs(b.close - midpoint) / midpoint * 100;
    if (distFromMid <= widthPct / 2 + 1) barsInRange++;
  }

  return { high, low, midpoint, widthPct, barsInRange };
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchDailyBars(symbol: string, range = "3mo"): Promise<PriceBar[]> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, region: "US", interval: "1d", range, includeAdjustedClose: "true" },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return [];
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const bars: PriceBar[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      if (!quote.close[i]) continue;
      bars.push({
        date: new Date(timestamp[i] * 1000).toISOString(),
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

// ─── Core analysis ────────────────────────────────────────────────────────────

async function analyzeNourSetup(
  ticker: string,
  qqqBars: PriceBar[]
): Promise<NourSignal | null> {
  if (ticker === "QQQ") return null; // skip QQQ itself

  const bars = await fetchDailyBars(ticker, "3mo");
  if (bars.length < 30) return null;

  const last = bars.length - 1;
  const currentPrice = bars[last].close;
  const prevClose = bars[last - 1]?.close ?? currentPrice;
  const dayChangePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  // ── ATR & range tightening ────────────────────────────────────────────────
  const atrSeries = calcATR(bars, 14);
  const atr14 = atrSeries[last];
  const atr20Slice = atrSeries.slice(Math.max(0, last - 20), last);
  const atr14Avg20 = atr20Slice.length > 0
    ? atr20Slice.reduce((a, b) => a + b, 0) / atr20Slice.length
    : atr14;
  const rangeTightnessPct = atr14Avg20 > 0
    ? ((atr14Avg20 - atr14) / atr14Avg20) * 100
    : 0;
  const rangeTightening = rangeTightnessPct >= 15; // ATR contracted by 15%+

  // ── IV Compression (using HV as proxy) ───────────────────────────────────
  const hvSeries = calcHVSeries(bars, 20);
  const currentHV = hvSeries[last];
  const hv20Slice = hvSeries.slice(Math.max(0, last - 20), last);
  const avgHV20 = hv20Slice.filter(v => v > 0).length > 0
    ? hv20Slice.filter(v => v > 0).reduce((a, b) => a + b, 0) / hv20Slice.filter(v => v > 0).length
    : currentHV;
  const ivCompressionPct = avgHV20 > 0
    ? ((avgHV20 - currentHV) / avgHV20) * 100
    : 0;
  const ivCompressed = ivCompressionPct >= 10; // HV 10%+ below 20-day avg

  // ── Volume surge ──────────────────────────────────────────────────────────
  const vol10Slice = bars.slice(Math.max(0, last - 10), last).map(b => b.volume);
  const avgVolume10d = vol10Slice.length > 0
    ? vol10Slice.reduce((a, b) => a + b, 0) / vol10Slice.length
    : bars[last].volume;
  const latestVolume = bars[last].volume;
  const volumeSurgeMultiple = avgVolume10d > 0 ? latestVolume / avgVolume10d : 1;
  const volumeSurge = volumeSurgeMultiple >= 2.5;

  // ── Consolidation zone ────────────────────────────────────────────────────
  const zone = detectConsolidationZone(bars, 15);
  const breakoutConfirmed = currentPrice > zone.high * 1.001; // 0.1% above zone high
  const retestOpportunity =
    !breakoutConfirmed &&
    currentPrice >= zone.high * 0.985 &&
    currentPrice <= zone.high * 1.02;

  // ── Relative strength vs QQQ ──────────────────────────────────────────────
  const qqqLast = qqqBars.length - 1;
  const qqq5dAgo = qqqBars[Math.max(0, qqqLast - 5)]?.close ?? qqqBars[qqqLast].close;
  const qqq10dAgo = qqqBars[Math.max(0, qqqLast - 10)]?.close ?? qqqBars[qqqLast].close;
  const qqqNow = qqqBars[qqqLast]?.close ?? 1;
  const qqqChangePct5d = qqq5dAgo > 0 ? ((qqqNow - qqq5dAgo) / qqq5dAgo) * 100 : 0;
  const qqqChangePct10d = qqq10dAgo > 0 ? ((qqqNow - qqq10dAgo) / qqq10dAgo) * 100 : 0;

  const ticker5dAgo = bars[Math.max(0, last - 5)]?.close ?? currentPrice;
  const ticker10dAgo = bars[Math.max(0, last - 10)]?.close ?? currentPrice;
  const tickerChangePct5d = ticker5dAgo > 0 ? ((currentPrice - ticker5dAgo) / ticker5dAgo) * 100 : 0;
  const tickerChangePct10d = ticker10dAgo > 0 ? ((currentPrice - ticker10dAgo) / ticker10dAgo) * 100 : 0;

  const rsScore5d = tickerChangePct5d - qqqChangePct5d;
  const rsScore10d = tickerChangePct10d - qqqChangePct10d;
  const relativeStrength = rsScore5d > 0 || rsScore10d > 0.5;

  // ── Tape checklist ────────────────────────────────────────────────────────
  const tape: TapeChecklist = {
    ivCompressed,
    ivCompressionPct: Math.round(ivCompressionPct * 10) / 10,
    rangeTightening,
    rangeTightnessPct: Math.round(rangeTightnessPct * 10) / 10,
    relativeStrength,
    rsScore5d: Math.round(rsScore5d * 100) / 100,
    rsScore10d: Math.round(rsScore10d * 100) / 100,
    volumeSurge,
    volumeSurgeMultiple: Math.round(volumeSurgeMultiple * 10) / 10,
    breakoutConfirmed,
    retestOpportunity,
  };

  // ── Phase determination ───────────────────────────────────────────────────
  let phase: NourSetupPhase;
  let score = 0;

  if (ivCompressed) score += 20;
  if (rangeTightening) score += 20;
  if (relativeStrength) score += 15;
  if (volumeSurge) score += 20;
  if (breakoutConfirmed) score += 15;
  if (retestOpportunity) score += 10;

  if (breakoutConfirmed && volumeSurge) {
    phase = "BREAKOUT_NOW";
    score = Math.max(score, 75);
  } else if (retestOpportunity && (ivCompressed || rangeTightening)) {
    phase = "RETEST_ENTRY";
    score = Math.max(score, 65);
  } else if (ivCompressed && rangeTightening) {
    phase = "CONSOLIDATING";
  } else if (score >= 25) {
    phase = "WATCH";
  } else {
    phase = "NO_SETUP";
  }

  // ── Options play ──────────────────────────────────────────────────────────
  let optionsPlay: OptionsPlay | null = null;
  if (phase !== "NO_SETUP") {
    const direction = relativeStrength && dayChangePct >= -1 ? "CALL" : "PUT";
    const atmStrike = Math.round(currentPrice / 5) * 5; // round to nearest $5
    const ivNote = ivCompressed
      ? `HV is ${Math.abs(ivCompressionPct).toFixed(0)}% below 20-day avg — options are cheap right now`
      : "IV not yet compressed — wait for further consolidation";

    let entryTiming = "Buy on breakout candle close above zone high";
    if (phase === "BREAKOUT_NOW") entryTiming = "Breakout active — enter on next 5-min pullback";
    if (phase === "RETEST_ENTRY") entryTiming = "Retest of breakout level — ideal entry NOW";

    optionsPlay = {
      type: direction,
      rationale: direction === "CALL"
        ? `${ticker} showing relative strength vs QQQ (RS5d: ${rsScore5d > 0 ? "+" : ""}${rsScore5d.toFixed(1)}%). Buy call on breakout above $${zone.high.toFixed(2)}.`
        : `${ticker} lagging QQQ (RS5d: ${rsScore5d.toFixed(1)}%). Buy put on breakdown below $${zone.low.toFixed(2)}.`,
      atmStrike,
      suggestedDTE: 21,
      entryTiming,
      stopNote: `Exit if price falls back into consolidation range (below $${zone.low.toFixed(2)})`,
      targetNote: "Scale out when volume dries up and tape shows exhaustion (sellers stepping in at lower prices)",
      ivNote,
    };
  }

  // ── Setup note (Nour's plain-English insight) ─────────────────────────────
  const checksPassed = [ivCompressed, rangeTightening, relativeStrength, volumeSurge, breakoutConfirmed]
    .filter(Boolean).length;

  let setupNote = "";
  if (phase === "BREAKOUT_NOW") {
    setupNote = `🚨 Active breakout with ${volumeSurgeMultiple.toFixed(1)}× volume surge. Nour rule: enter on next 5-min pullback to zone high ($${zone.high.toFixed(2)}), confirm buyers holding.`;
  } else if (phase === "RETEST_ENTRY") {
    setupNote = `✅ Broke out and retesting. This is Nour's ideal entry — price near $${zone.high.toFixed(2)} with IV compressed. Confirm with tape (buyers hitting ask).`;
  } else if (phase === "CONSOLIDATING") {
    setupNote = `⏳ IV compressed ${ivCompressionPct.toFixed(0)}% + range tightening ${rangeTightnessPct.toFixed(0)}%. Nour says: wait for the break above $${zone.high.toFixed(2)} with volume surge.`;
  } else if (phase === "WATCH") {
    setupNote = `👀 ${checksPassed}/5 signals aligned. Not ready yet — add to watchlist and wait for IV compression + range tightening to complete.`;
  } else {
    setupNote = "No meaningful setup. Skip and look elsewhere.";
  }

  // ── Try to get live price from Tradier ────────────────────────────────────
  let livePrice = currentPrice;
  let liveDayChangePct = dayChangePct;
  try {
    const quote = await getTradierQuote(ticker);
    if (quote && quote.last > 0) {
      livePrice = quote.last;
      liveDayChangePct = quote.change_percentage ?? dayChangePct;
    }
  } catch {
    // fall back to Yahoo price
  }

  return {
    ticker,
    phase,
    score: Math.min(100, Math.round(score)),
    currentPrice: Math.round(livePrice * 100) / 100,
    dayChangePct: Math.round(liveDayChangePct * 100) / 100,
    zone: {
      high: Math.round(zone.high * 100) / 100,
      low: Math.round(zone.low * 100) / 100,
      midpoint: Math.round(zone.midpoint * 100) / 100,
      widthPct: Math.round(zone.widthPct * 10) / 10,
      barsInRange: zone.barsInRange,
    },
    tape,
    optionsPlay,
    qqqChangePct5d: Math.round(qqqChangePct5d * 100) / 100,
    tickerChangePct5d: Math.round(tickerChangePct5d * 100) / 100,
    qqqChangePct10d: Math.round(qqqChangePct10d * 100) / 100,
    tickerChangePct10d: Math.round(tickerChangePct10d * 100) / 100,
    atr14: Math.round(atr14 * 100) / 100,
    atr14Avg20: Math.round(atr14Avg20 * 100) / 100,
    avgVolume10d: Math.round(avgVolume10d),
    latestVolume,
    setupNote,
    scannedAt: new Date().toISOString(),
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const nourScannerRouter = router({
  /**
   * Scan tickers for Nour Method setups
   */
  scan: publicProcedure
    .input(z.object({
      tickers: z.array(z.string()).optional(),
      minPhase: z.enum(["BREAKOUT_NOW", "RETEST_ENTRY", "CONSOLIDATING", "WATCH", "NO_SETUP"]).default("WATCH"),
    }))
    .query(async ({ input }) => {
      const tickers = (input.tickers && input.tickers.length > 0)
        ? input.tickers.map(t => t.toUpperCase()).filter(t => t !== "QQQ")
        : DEFAULT_TICKERS.filter(t => t !== "QQQ" && t !== "SPY" && t !== "SMH");

      // Fetch QQQ bars once for relative strength comparison
      const qqqBars = await fetchDailyBars("QQQ", "3mo");

      // Process in batches of 5 to avoid rate limits
      const results: NourSignal[] = [];
      const batchSize = 5;
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(t => analyzeNourSetup(t, qqqBars).catch(() => null))
        );
        for (const r of batchResults) {
          if (r) results.push(r);
        }
      }

      // Phase priority order
      const phaseOrder: Record<NourSetupPhase, number> = {
        BREAKOUT_NOW: 4,
        RETEST_ENTRY: 3,
        CONSOLIDATING: 2,
        WATCH: 1,
        NO_SETUP: 0,
      };

      const minPhaseVal = phaseOrder[input.minPhase];
      const filtered = results.filter(r => phaseOrder[r.phase] >= minPhaseVal);

      // Sort: phase priority first, then score
      filtered.sort((a, b) => {
        const phaseDiff = phaseOrder[b.phase] - phaseOrder[a.phase];
        if (phaseDiff !== 0) return phaseDiff;
        return b.score - a.score;
      });

      const breakoutCount = results.filter(r => r.phase === "BREAKOUT_NOW").length;
      const retestCount = results.filter(r => r.phase === "RETEST_ENTRY").length;
      const consolidatingCount = results.filter(r => r.phase === "CONSOLIDATING").length;
      const watchCount = results.filter(r => r.phase === "WATCH").length;

      return {
        signals: filtered,
        allSignals: results,
        scannedCount: results.length,
        signalCount: filtered.length,
        summary: { breakoutCount, retestCount, consolidatingCount, watchCount },
        scannedAt: new Date().toISOString(),
      };
    }),

  /**
   * Analyze a single ticker in depth
   */
  analyzeTicker: publicProcedure
    .input(z.object({ ticker: z.string() }))
    .query(async ({ input }) => {
      const qqqBars = await fetchDailyBars("QQQ", "3mo");
      const signal = await analyzeNourSetup(input.ticker.toUpperCase(), qqqBars);
      return signal;
    }),

  /**
   * Relative strength ranking — rank tickers vs QQQ
   */
  relativeStrengthRanking: publicProcedure
    .input(z.object({
      tickers: z.array(z.string()).optional(),
      period: z.enum(["5d", "10d", "20d"]).default("5d"),
    }))
    .query(async ({ input }) => {
      const tickers = (input.tickers && input.tickers.length > 0)
        ? input.tickers.map(t => t.toUpperCase())
        : DEFAULT_TICKERS;

      const allTickers = Array.from(new Set([...tickers, "QQQ"]));
      const barsMap: Record<string, PriceBar[]> = {};

      const batchSize = 5;
      for (let i = 0; i < allTickers.length; i += batchSize) {
        const batch = allTickers.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async t => ({ ticker: t, bars: await fetchDailyBars(t, "3mo") }))
        );
        for (const { ticker, bars } of results) {
          barsMap[ticker] = bars;
        }
      }

      const qqqBars = barsMap["QQQ"] ?? [];
      const qqqLast = qqqBars.length - 1;
      const periodDays = parseInt(input.period);
      const qqqAgo = qqqBars[Math.max(0, qqqLast - periodDays)]?.close ?? qqqBars[qqqLast]?.close ?? 1;
      const qqqNow = qqqBars[qqqLast]?.close ?? 1;
      const qqqChangePct = qqqAgo > 0 ? ((qqqNow - qqqAgo) / qqqAgo) * 100 : 0;

      const rankings = tickers
        .filter(t => t !== "QQQ")
        .map(ticker => {
          const bars = barsMap[ticker] ?? [];
          if (bars.length < periodDays + 1) {
            return { ticker, changePct: 0, qqqChangePct, rsScore: 0, isLeader: false };
          }
          const last = bars.length - 1;
          const ago = bars[Math.max(0, last - periodDays)]?.close ?? bars[last].close;
          const now = bars[last].close;
          const changePct = ago > 0 ? ((now - ago) / ago) * 100 : 0;
          const rsScore = changePct - qqqChangePct;
          return {
            ticker,
            changePct: Math.round(changePct * 100) / 100,
            qqqChangePct: Math.round(qqqChangePct * 100) / 100,
            rsScore: Math.round(rsScore * 100) / 100,
            isLeader: rsScore > 0,
          };
        })
        .sort((a, b) => b.rsScore - a.rsScore);

      return {
        rankings,
        period: input.period,
        qqqChangePct: Math.round(qqqChangePct * 100) / 100,
        scannedAt: new Date().toISOString(),
      };
    }),
});
