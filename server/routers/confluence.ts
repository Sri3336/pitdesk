/**
 * Unified Confluence Router
 * Synthesizes all PitDesk signal engines into a 4-tier verdict:
 *   Tier 1 — Structural:  CTA flow (50d MA) + COT institutional positioning
 *   Tier 2 — Directional: Price action trend + PCR sentiment
 *   Tier 3 — Tactical:    Velez/volume momentum + VWAP + IVR
 *   Tier 4 — Event:       Earnings proximity + IV expansion risk
 *
 * Final verdict: ALIGNED | PARTIAL | CONFLICTED
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";
import { invokeLLM } from "../_core/llm";
import { fetchPCR } from "../pcrStrategy";
import { COT_INSTRUMENTS } from "../../shared/cotTypes";
import { analyzeCotInstrument } from "./cot";
import { getTickerClassification, getTierSizeGuidance } from "../../shared/tickerClassification";

// ── Types ────────────────────────────────────────────────────────────────────
type TierStatus = "BULLISH" | "BEARISH" | "NEUTRAL" | "N/A";
type Verdict = "ALIGNED" | "PARTIAL" | "CONFLICTED";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

interface TierResult {
  tier: 1 | 2 | 3 | 4;
  label: string;
  status: TierStatus;
  score: number;       // 0–2 (2=strong aligned, 1=neutral, 0=against)
  signals: { name: string; value: string; status: "green" | "yellow" | "red" | "gray" }[];
  summary: string;
}

interface ConfluenceResult {
  ticker: string;
  tiers: TierResult[];
  verdict: Verdict;
  verdictScore: number;   // 0–8
  confidence: Confidence;
  // Plain-English narrative
  whatWeLookFor: string;
  whatWeFound: string;
  whatToDo: string;
  // Execution
  suggestedStrategy: string;
  eventRisk: string | null;
  dataAsOf: string;
  // Theta Machine
  thetaCandidate: boolean;
  thetaScore: number;         // 0-5
  thetaLabel: string | null;
  thetaReason: string | null;
  // Backtest Classification
  backtestTier: string | null;
  backtestTierLabel: string | null;
  backtestBestStrategy: string | null;
  backtestWinRate: number | null;
  backtestAvgPnl: number | null;
  backtestSizeGuidance: string | null;
  backtestNAligned: number | null;
  // Market Phase
  marketPhase: "TRENDING" | "CONSOLIDATING" | "COILING";
  marketPhaseDetail: string;
  marketPhaseSuggestedStructure: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch daily price bars from Yahoo Finance */
async function fetchDailyBars(ticker: string): Promise<{ close: number; volume: number; high: number; low: number }[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: ticker, interval: "1d", range: "3mo" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (result as any)?.chart?.result?.[0];
    if (!chart) return [];
    const q = chart.indicators?.quote?.[0] ?? {};
    const timestamps: number[] = chart.timestamp ?? [];
    return timestamps.map((_: number, i: number) => ({
      close: q.close?.[i] ?? 0,
      volume: q.volume?.[i] ?? 0,
      high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0,
    })).filter((b: { close: number }) => b.close > 0);
  } catch { return []; }
}

/** Fetch intraday 5-min bars for VWAP */
async function fetchIntradayBars(ticker: string): Promise<{ close: number; volume: number; high: number; low: number }[]> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: ticker, interval: "5m", range: "1d" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = (result as any)?.chart?.result?.[0];
    if (!chart) return [];
    const q = chart.indicators?.quote?.[0] ?? {};
    const timestamps: number[] = chart.timestamp ?? [];
    return timestamps.map((_: number, i: number) => ({
      close: q.close?.[i] ?? 0,
      volume: q.volume?.[i] ?? 0,
      high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0,
    })).filter((b: { close: number }) => b.close > 0);
  } catch { return []; }
}

/** Simple moving average */
function sma(arr: number[], period: number): number {
  if (arr.length < period) return 0;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/** Compute VWAP from intraday bars */
function computeVWAP(bars: { close: number; volume: number; high: number; low: number }[]): number | null {
  if (bars.length < 3) return null;
  let cumPV = 0, cumVol = 0;
  for (const b of bars) {
    const typical = (b.high + b.low + b.close) / 3;
    cumPV += typical * b.volume;
    cumVol += b.volume;
  }
  return cumVol > 0 ? cumPV / cumVol : null;
}

/** Detect market phase: TRENDING / CONSOLIDATING / COILING
 *  Uses ATR contraction ratio + trend structure:
 *  - COILING:       ATR(14) is ≤ 60% of its 20-bar average → volatility squeeze, breakout imminent
 *  - TRENDING:      Clear MA20 > MA50 (up) or MA20 < MA50 (down) structure
 *  - CONSOLIDATING: Everything else — range-bound, no squeeze yet
 */
function detectPhase(
  bars: { close: number; high: number; low: number }[]
): { phase: "TRENDING" | "CONSOLIDATING" | "COILING"; atrRatio: number; detail: string; suggestedStructure: string } {
  if (bars.length < 20) return { phase: "CONSOLIDATING", atrRatio: 1, detail: "Insufficient data", suggestedStructure: "Iron Condor" };

  // ATR(14) for each bar over last 20 bars
  const atrValues: number[] = [];
  for (let i = Math.max(1, bars.length - 20); i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    atrValues.push(tr);
  }
  const currentATR = atrValues.slice(-14).reduce((s, v) => s + v, 0) / Math.min(14, atrValues.length);
  const avgATR = atrValues.reduce((s, v) => s + v, 0) / atrValues.length;
  const atrRatio = avgATR > 0 ? Math.round((currentATR / avgATR) * 100) / 100 : 1;

  // Trend structure
  const closes = bars.map(b => b.close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, Math.min(50, closes.length));
  const current = closes[closes.length - 1];
  const isTrending = (current > ma20 && ma20 > ma50) || (current < ma20 && ma20 < ma50);
  const direction = current > ma20 ? "up" : "down";

  if (atrRatio <= 0.60) {
    return {
      phase: "COILING",
      atrRatio,
      detail: `ATR is ${Math.round((1 - atrRatio) * 100)}% below its 20-day avg — volatility squeeze. Breakout imminent.`,
      suggestedStructure: "Wait for breakout, then enter directional spread",
    };
  }
  if (isTrending) {
    return {
      phase: "TRENDING",
      atrRatio,
      detail: `Clear ${direction === "up" ? "uptrend" : "downtrend"} structure (MA20 ${direction === "up" ? ">" : "<"} MA50). ATR normal at ${Math.round(atrRatio * 100)}% of avg.`,
      suggestedStructure: direction === "up" ? "Bull Put Spread" : "Bear Call Spread",
    };
  }
  return {
    phase: "CONSOLIDATING",
    atrRatio,
    detail: `Price is range-bound between MA20 and MA50. ATR at ${Math.round(atrRatio * 100)}% of avg — no directional commitment.`,
    suggestedStructure: "Iron Condor",
  };
}

/** Detect price trend from daily bars */
function detectTrend(bars: { close: number }[]): "UPTREND" | "DOWNTREND" | "CONSOLIDATION" {
  if (bars.length < 20) return "CONSOLIDATION";
  const closes = bars.map(b => b.close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const current = closes[closes.length - 1];
  if (current > ma20 && ma20 > ma50) return "UPTREND";
  if (current < ma20 && ma20 < ma50) return "DOWNTREND";
  return "CONSOLIDATION";
}

/** Compute RSI(14) */
function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round(100 - 100 / (1 + rs));
}

/** Map a ticker to its COT instrument (if any) */
function cotInstrumentForTicker(ticker: string): typeof COT_INSTRUMENTS[0] | null {
  const t = ticker.toUpperCase();
  return COT_INSTRUMENTS.find(i => i.ticker === t) ?? null;
}

/** Fetch next earnings date from Yahoo Finance */
async function fetchNextEarningsDate(ticker: string): Promise<string | null> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_quote", {
      query: { symbol: ticker },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (result as any)?.quoteResponse?.result?.[0];
    if (!q) return null;
    // earningsTimestamp is a unix timestamp
    const ts = q.earningsTimestamp ?? q.earningsTimestampStart;
    if (!ts) return null;
    return new Date(ts * 1000).toISOString().split("T")[0];
  } catch { return null; }
}

// ── Tier builders ─────────────────────────────────────────────────────────────

async function buildTier1(
  ticker: string,
  bars: { close: number }[],
): Promise<TierResult> {
  const closes = bars.map(b => b.close);
  const ma50 = sma(closes, 50);
  const current = closes[closes.length - 1] ?? 0;
  const distPct = ma50 > 0 ? ((current - ma50) / ma50) * 100 : 0;

  // CTA signal
  let ctaStatus: TierStatus = "NEUTRAL";
  let ctaLabel = "Neutral";
  let ctaColor: "green" | "yellow" | "red" | "gray" = "yellow";
  if (ma50 > 0) {
    if (distPct > 2) { ctaStatus = "BULLISH"; ctaLabel = `Tailwind (+${distPct.toFixed(1)}% above 50d)`; ctaColor = "green"; }
    else if (distPct < -2) { ctaStatus = "BEARISH"; ctaLabel = `Headwind (${distPct.toFixed(1)}% below 50d)`; ctaColor = "red"; }
    else { ctaLabel = `Approaching flip (${distPct.toFixed(1)}% vs 50d)`; ctaColor = "yellow"; }
  }

  // COT signal (only for tickers with futures data)
  let cotStatus: TierStatus = "N/A";
  let cotLabel = "No COT data";
  let cotColor: "green" | "yellow" | "red" | "gray" = "gray";
  const cotInst = cotInstrumentForTicker(ticker);
  if (cotInst) {
    try {
      const cotData = await analyzeCotInstrument(cotInst.cftcCode);
      cotStatus = cotData.signal === "BULLISH" ? "BULLISH" : cotData.signal === "BEARISH" ? "BEARISH" : "NEUTRAL";
      cotLabel = `COT Index ${cotData.cotIndex} — ${cotData.signal}`;
      cotColor = cotData.signal === "BULLISH" ? "green" : cotData.signal === "BEARISH" ? "red" : "yellow";
    } catch { /* no COT data */ }
  }

  // Score: CTA counts 2pts, COT counts 1pt (if available)
  let score = 0;
  if (ctaStatus === "BULLISH") score += 2;
  else if (ctaStatus === "NEUTRAL") score += 1;
  // COT
  if (cotStatus === "BULLISH") score += 1;
  else if (cotStatus === "BEARISH") score = Math.max(0, score - 1);

  const overallStatus: TierStatus =
    ctaStatus === "BULLISH" && (cotStatus === "BULLISH" || cotStatus === "N/A") ? "BULLISH"
    : ctaStatus === "BEARISH" && (cotStatus === "BEARISH" || cotStatus === "N/A") ? "BEARISH"
    : "NEUTRAL";

  const summary = ctaStatus === "BULLISH"
    ? `Price is above the 50-day MA — institutional CTA flows are supporting the move.${cotStatus === "BULLISH" ? " COT data confirms large speculators are net long." : ""}`
    : ctaStatus === "BEARISH"
    ? `Price is below the 50-day MA — CTA funds are adding downside pressure.${cotStatus === "BEARISH" ? " COT confirms institutional short positioning." : ""}`
    : `Price is near the 50-day MA — watch for a directional break to trigger CTA momentum.`;

  return {
    tier: 1,
    label: "Structural (CTA + COT)",
    status: overallStatus,
    score: Math.min(2, score),
    signals: [
      { name: "CTA Flow (50d)", value: ctaLabel, status: ctaColor },
      { name: "COT Positioning", value: cotLabel, status: cotColor },
    ],
    summary,
  };
}

async function buildTier2(
  ticker: string,
  bars: { close: number }[],
): Promise<TierResult> {
  const trend = detectTrend(bars);
  const closes = bars.map(b => b.close);
  const rsi = calcRSI(closes);

  // PCR sentiment
  let pcrStatus: TierStatus = "NEUTRAL";
  let pcrLabel = "N/A";
  let pcrColor: "green" | "yellow" | "red" | "gray" = "gray";
  try {
    const pcr = await fetchPCR(ticker);
    pcrLabel = `PCR ${pcr.pcr} — ${pcr.signal}`;
    if (pcr.signal === "GREED" || pcr.signal === "EXTREME_GREED") { pcrStatus = "BULLISH"; pcrColor = "green"; }
    else if (pcr.signal === "FEAR" || pcr.signal === "EXTREME_FEAR") { pcrStatus = "BEARISH"; pcrColor = "red"; }
    else { pcrStatus = "NEUTRAL"; pcrColor = "yellow"; }
  } catch { pcrLabel = "PCR unavailable"; pcrColor = "gray"; }

  const trendStatus: TierStatus = trend === "UPTREND" ? "BULLISH" : trend === "DOWNTREND" ? "BEARISH" : "NEUTRAL";
  const trendColor: "green" | "yellow" | "red" = trend === "UPTREND" ? "green" : trend === "DOWNTREND" ? "red" : "yellow";

  // RSI context
  let rsiLabel = rsi != null ? `RSI ${rsi} — Neutral` : "RSI N/A";
  let rsiColor: "green" | "yellow" | "red" | "gray" = "yellow";
  if (rsi != null) {
    if (rsi < 30) { rsiLabel = `RSI ${rsi} — Oversold`; rsiColor = "green"; }
    else if (rsi > 70) { rsiLabel = `RSI ${rsi} — Overbought`; rsiColor = "red"; }
    else { rsiColor = "yellow"; }
  } else { rsiColor = "gray"; }

  // Score: trend 2pts, PCR 1pt
  let score = 0;
  if (trendStatus === "BULLISH") score += 2;
  else if (trendStatus === "NEUTRAL") score += 1;
  if (pcrStatus === "BULLISH") score += 1;
  else if (pcrStatus === "BEARISH") score = Math.max(0, score - 1);

  const overallStatus: TierStatus =
    trendStatus === "BULLISH" && pcrStatus !== "BEARISH" ? "BULLISH"
    : trendStatus === "BEARISH" && pcrStatus !== "BULLISH" ? "BEARISH"
    : "NEUTRAL";

  const summary = trend === "UPTREND"
    ? `Price is in an uptrend (higher highs, higher lows). ${pcrStatus === "BULLISH" ? "Options sentiment confirms — more calls being bought." : pcrStatus === "BEARISH" ? "Warning: put buying is elevated despite the uptrend." : "Options sentiment is neutral."}`
    : trend === "DOWNTREND"
    ? `Price is in a downtrend (lower highs, lower lows). ${pcrStatus === "BEARISH" ? "Options sentiment confirms — fear is elevated." : pcrStatus === "BULLISH" ? "Contrarian note: put/call ratio is low despite the downtrend — possible capitulation." : "Options sentiment is neutral."}`
    : `Price is consolidating — no clear directional bias. Wait for a breakout with volume confirmation.`;

  return {
    tier: 2,
    label: "Directional (Trend + PCR)",
    status: overallStatus,
    score: Math.min(2, score),
    signals: [
      { name: "Price Action", value: trend, status: trendColor },
      { name: "PCR Sentiment", value: pcrLabel, status: pcrColor },
      { name: "RSI(14)", value: rsiLabel, status: rsiColor },
    ],
    summary,
  };
}

async function buildTier3(
  ticker: string,
  bars: { close: number; volume: number }[],
  intradayBars: { close: number; volume: number; high: number; low: number }[],
): Promise<TierResult> {
  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const current = closes[closes.length - 1] ?? 0;

  // Relative volume
  const avgVol = sma(volumes, 20);
  const todayVol = volumes[volumes.length - 1] ?? 0;
  const relVol = avgVol > 0 ? Math.round((todayVol / avgVol) * 100) / 100 : 1;
  const volLabel = relVol >= 1.5 ? "STRONG" : relVol >= 0.7 ? "NORMAL" : "WEAK";
  const volColor: "green" | "yellow" | "red" = volLabel === "STRONG" ? "green" : volLabel === "NORMAL" ? "yellow" : "red";

  // VWAP
  const vwap = computeVWAP(intradayBars);
  const vwapStatus: TierStatus = vwap == null ? "N/A" : current >= vwap ? "BULLISH" : "BEARISH";
  const vwapLabel = vwap == null ? "Pre-market / N/A" : `${current >= vwap ? "Above" : "Below"} VWAP ($${vwap.toFixed(2)})`;
  const vwapColor: "green" | "yellow" | "red" | "gray" = vwap == null ? "gray" : current >= vwap ? "green" : "red";

  // IVR (simplified from tradeSetup IV ranges)
  const IV_RANGES: Record<string, { low: number; high: number }> = {
    NVDA: { low: 35, high: 90 }, TSLA: { low: 45, high: 120 }, PLTR: { low: 55, high: 130 },
    AMD: { low: 35, high: 85 }, META: { low: 25, high: 65 }, AAPL: { low: 18, high: 45 },
    SPY: { low: 10, high: 30 }, QQQ: { low: 12, high: 35 }, AMZN: { low: 22, high: 60 },
    GOOGL: { low: 20, high: 55 }, MSFT: { low: 18, high: 45 }, SOFI: { low: 50, high: 120 },
    APP: { low: 40, high: 100 }, HOOD: { low: 55, high: 130 }, IONQ: { low: 70, high: 160 },
  };
  // Approximate IV from price range
  const ma20 = sma(closes, 20);
  const recentHighs = closes.slice(-20);
  const rangeHigh = Math.max(...recentHighs);
  const rangeLow = Math.min(...recentHighs);
  const approxIV = ma20 > 0 ? Math.round(((rangeHigh - rangeLow) / ma20) * Math.sqrt(252) * 100) : 30;
  const ivRange = IV_RANGES[ticker.toUpperCase()] ?? { low: 20, high: 80 };
  const ivr = Math.round(Math.max(0, Math.min(100, ((approxIV - ivRange.low) / (ivRange.high - ivRange.low)) * 100)));
  const ivrLabel = ivr >= 50 ? "RICH — sell premium" : ivr >= 30 ? "Normal" : "CHEAP — buy options";
  const ivrColor: "green" | "yellow" | "red" = ivr >= 50 ? "green" : ivr >= 30 ? "yellow" : "red";

  // Score: vol 1pt, VWAP 1pt
  let score = 0;
  if (volLabel === "STRONG") score += 1;
  else if (volLabel === "NORMAL") score += 1; // neutral is still OK
  if (vwapStatus === "BULLISH") score += 1;
  else if (vwapStatus === "N/A") score += 1; // pre-market, don't penalize

  const overallStatus: TierStatus =
    volLabel === "STRONG" && vwapStatus === "BULLISH" ? "BULLISH"
    : volLabel === "WEAK" && vwapStatus === "BEARISH" ? "BEARISH"
    : "NEUTRAL";

  const summary = overallStatus === "BULLISH"
    ? `Strong volume (${relVol}x avg) with price above VWAP — institutional participation is confirming the move. ${ivrLabel.includes("RICH") ? "IV is elevated — premium selling strategies are favored." : "IV is normal — directional spreads are well-priced."}`
    : overallStatus === "BEARISH"
    ? `Weak volume and price below VWAP — sellers are in control intraday. Avoid new longs until volume picks up.`
    : `Volume and VWAP are neutral. Wait for a volume surge above VWAP to confirm entry timing.`;

  return {
    tier: 3,
    label: "Tactical (Volume + VWAP + IVR)",
    status: overallStatus,
    score: Math.min(2, score),
    signals: [
      { name: "Relative Volume", value: `${relVol}x avg — ${volLabel}`, status: volColor },
      { name: "VWAP", value: vwapLabel, status: vwapColor },
      { name: "IV Rank", value: `IVR ${ivr}% — ${ivrLabel}`, status: ivrColor },
    ],
    summary,
  };
}

async function buildTier4(ticker: string): Promise<TierResult> {
  const earningsDate = await fetchNextEarningsDate(ticker);
  const today = new Date();
  let daysToEarnings: number | null = null;
  if (earningsDate) {
    const ed = new Date(earningsDate);
    daysToEarnings = Math.round((ed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const isEarningsRisk = daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 14;
  const isEarningsImminent = daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 5;

  let status: TierStatus = "NEUTRAL";
  let earningsLabel = "No earnings in 14 days";
  let earningsColor: "green" | "yellow" | "red" | "gray" = "green";
  let summary = "No earnings event in the next 14 days. Standard strategy sizing applies.";

  if (isEarningsImminent) {
    status = "BEARISH"; // flag as risk
    earningsLabel = `Earnings in ${daysToEarnings}d (${earningsDate}) — IV SPIKE RISK`;
    earningsColor = "red";
    summary = `Earnings in ${daysToEarnings} days. IV will spike into the event and crush after. Do NOT sell premium naked. Consider an earnings spread or calendar. Size down to 50%.`;
  } else if (isEarningsRisk) {
    status = "NEUTRAL";
    earningsLabel = `Earnings in ${daysToEarnings}d (${earningsDate}) — watch IV`;
    earningsColor = "yellow";
    summary = `Earnings in ${daysToEarnings} days. IV is starting to price in the event. Consider an earnings calendar spread or reduce position size.`;
  } else if (earningsDate) {
    earningsLabel = `Next earnings: ${earningsDate} (${daysToEarnings != null ? `${daysToEarnings}d away` : "future"})`;
  }

  return {
    tier: 4,
    label: "Event Risk (Earnings + IV)",
    status,
    score: isEarningsImminent ? 0 : isEarningsRisk ? 1 : 2,
    signals: [
      { name: "Earnings", value: earningsLabel, status: earningsColor },
    ],
    summary,
  };
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

function synthesize(tiers: TierResult[], ticker: string): Omit<ConfluenceResult, "ticker" | "tiers" | "dataAsOf" | "backtestTier" | "backtestTierLabel" | "backtestBestStrategy" | "backtestWinRate" | "backtestAvgPnl" | "backtestSizeGuidance" | "backtestNAligned" | "marketPhase" | "marketPhaseDetail" | "marketPhaseSuggestedStructure"> {
  const totalScore = tiers.reduce((a, t) => a + t.score, 0); // 0–8
  const bullishTiers = tiers.filter(t => t.status === "BULLISH").length;
  const bearishTiers = tiers.filter(t => t.status === "BEARISH").length;

  const verdict: Verdict =
    bullishTiers >= 3 ? "ALIGNED"
    : bearishTiers >= 3 ? "ALIGNED"
    : bullishTiers >= 2 || bearishTiers >= 2 ? "PARTIAL"
    : "CONFLICTED";

  const confidence: Confidence =
    verdict === "ALIGNED" && totalScore >= 6 ? "HIGH"
    : verdict === "ALIGNED" || (verdict === "PARTIAL" && totalScore >= 4) ? "MEDIUM"
    : "LOW";

  const direction = bullishTiers >= bearishTiers ? "BULLISH" : "BEARISH";

  // Strategy suggestion based on synthesis
  const tier3 = tiers[2];
  const ivrRich = tier3.signals.find(s => s.name === "IV Rank")?.value.includes("RICH") ?? false;

  let suggestedStrategy = "No Clear Setup — Wait";
  if (verdict === "ALIGNED" && direction === "BULLISH") {
    suggestedStrategy = ivrRich ? "Sell Cash-Secured Put or Bull Put Spread" : "Buy Call Debit Spread";
  } else if (verdict === "ALIGNED" && direction === "BEARISH") {
    suggestedStrategy = ivrRich ? "Sell Bear Call Spread" : "Buy Put Debit Spread";
  } else if (verdict === "PARTIAL" && direction === "BULLISH") {
    suggestedStrategy = ivrRich ? "Bull Put Spread (reduced size)" : "Call Debit Spread (wait for confirmation)";
  } else if (verdict === "PARTIAL" && direction === "BEARISH") {
    suggestedStrategy = ivrRich ? "Bear Call Spread (reduced size)" : "Put Debit Spread (wait for confirmation)";
  } else if (verdict === "CONFLICTED") {
    suggestedStrategy = ivrRich ? "Short Strangle or Iron Condor — range-bound play" : "Sit on hands — wait for alignment";
  }

  // Event risk
  const tier4 = tiers[3];
  const earningsSignal = tier4.signals[0];
  const eventRisk = tier4.status !== "NEUTRAL" || earningsSignal.status !== "green"
    ? earningsSignal.value
    : null;

  // Plain-English narrative
  const whatWeLookFor = `We look for all 4 tiers to point the same direction: structural money (CTA + COT) setting the bias, price action and sentiment confirming it, volume and VWAP timing the entry, and no earnings event risk. When all 4 align, we trade with full size and conviction.`;

  const t1 = tiers[0]; const t2 = tiers[1];
  const whatWeFound = verdict === "ALIGNED"
    ? `${direction === "BULLISH" ? "Bullish" : "Bearish"} alignment across ${bullishTiers >= bearishTiers ? bullishTiers : bearishTiers} of 4 tiers. ${t1.summary} ${t2.summary}`
    : verdict === "PARTIAL"
    ? `Mixed signals — ${bullishTiers} bullish tier${bullishTiers !== 1 ? "s" : ""} vs ${bearishTiers} bearish. ${t1.summary} Key conflict: ${t1.status !== t2.status ? `structural says ${t1.status} but directional says ${t2.status}` : `tactical entry conditions are not yet met`}.`
    : `Conflicting signals across all tiers. No dominant direction. ${t1.summary}`;

  const whatToDo = verdict === "ALIGNED"
    ? `Execute ${suggestedStrategy}. ${confidence === "HIGH" ? "Full size — all tiers aligned." : "Standard size — strong alignment."} ${eventRisk ? `Watch out: ${eventRisk}.` : "No event risk in the next 14 days."}`
    : verdict === "PARTIAL"
    ? `If you trade, use ${suggestedStrategy} at 50% normal size. Wait for ${t1.status === "NEUTRAL" ? "CTA/COT to confirm direction" : t2.status === "NEUTRAL" ? "trend to clarify" : "volume confirmation above VWAP"} before adding. ${eventRisk ? `Event risk: ${eventRisk}.` : ""}`
    : `Do not enter. Sit on hands until at least 2 tiers align. ${ivrRich ? "If you must trade, sell an Iron Condor to collect premium while the range-bound action plays out." : "No premium-selling edge either — just wait."}`;

  // -- Theta Machine Detection --
  // Core condition: IVR rich + no imminent earnings
  // Bonus: neutral trend (range-bound), neutral PCR, neutral VWAP
  const tier3Signals = tiers[2].signals;
  const tier2Signals = tiers[1].signals;
  const ivrSignal = tier3Signals.find(s => s.name === "IV Rank");
  const vwapSig = tier3Signals.find(s => s.name === "VWAP");
  const pcrSig = tier2Signals.find(s => s.name === "PCR Sentiment");
  const priceActionSig = tier2Signals.find(s => s.name === "Price Action");

  const ivrRichForTheta = ivrSignal?.value.includes("RICH") ?? false;
  const trendNeutral = priceActionSig?.value === "CONSOLIDATION" || tiers[1].status === "NEUTRAL";
  const vwapNeutralOrAbove = vwapSig?.status === "green" || vwapSig?.status === "yellow" || vwapSig?.status === "gray";
  const pcrNeutral = pcrSig?.status === "yellow" || pcrSig?.status === "gray";
  const noEarningsRisk = !eventRisk;

  let thetaScore = 0;
  if (ivrRichForTheta) thetaScore += 2;
  if (trendNeutral) thetaScore += 1;
  if (noEarningsRisk) thetaScore += 1;
  if (pcrNeutral) thetaScore += 1;
  if (vwapNeutralOrAbove) thetaScore += 0.5;
  thetaScore = Math.round(thetaScore);

  const thetaCandidate = ivrRichForTheta && noEarningsRisk && thetaScore >= 3;

  let thetaLabel: string | null = null;
  let thetaReason: string | null = null;
  if (thetaCandidate) {
    if (trendNeutral && thetaScore >= 4) {
      thetaLabel = "Iron Condor";
      thetaReason = `IV is rich + price is range-bound + no earnings risk. Iron Condor collects theta from both sides. Size: 1x ATR spread width.`;
    } else if (trendNeutral) {
      thetaLabel = "Short Strangle";
      thetaReason = `IV is elevated + consolidation pattern. Short Strangle captures decay if price stays range-bound. Use 1.5x ATR for strike width.`;
    } else if (direction === "BULLISH") {
      thetaLabel = "Cash-Secured Put";
      thetaReason = `IV is rich + bullish bias. Sell a put below support to collect premium with directional edge. Roll down if tested.`;
    } else {
      thetaLabel = "Bear Call Spread";
      thetaReason = `IV is rich + bearish bias. Sell calls above resistance to collect premium. Defined risk with bearish edge.`;
    }
  }

  return { verdict, verdictScore: totalScore, confidence, whatWeLookFor, whatWeFound, whatToDo, suggestedStrategy, eventRisk, thetaCandidate, thetaScore, thetaLabel, thetaReason };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const confluenceRouter = router({
  getConfluence: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }): Promise<ConfluenceResult> => {
      const { ticker } = input;

      // Fetch data in parallel
      const [dailyBars, intradayBars] = await Promise.all([
        fetchDailyBars(ticker),
        fetchIntradayBars(ticker),
      ]);

      // Build all 4 tiers in parallel
      const [tier1, tier2, tier3, tier4] = await Promise.all([
        buildTier1(ticker, dailyBars),
        buildTier2(ticker, dailyBars),
        buildTier3(ticker, dailyBars, intradayBars),
        buildTier4(ticker),
      ]);

      const tiers = [tier1, tier2, tier3, tier4];
      const synthesis = synthesize(tiers, ticker);
      const classification = getTickerClassification(ticker);
      const phaseResult = detectPhase(dailyBars);
      return {
        ticker,
        tiers,
        ...synthesis,
        dataAsOf: new Date().toISOString(),
        backtestTier: classification?.tier ?? null,
        backtestTierLabel: classification?.tierLabel ?? null,
        backtestBestStrategy: classification?.bestStrategy ?? null,
        backtestWinRate: classification?.winRate ?? null,
        backtestAvgPnl: classification?.avgPnl ?? null,
        backtestSizeGuidance: classification ? getTierSizeGuidance(classification.tier) : null,
        backtestNAligned: classification?.nAligned ?? null,
        marketPhase: phaseResult.phase,
        marketPhaseDetail: phaseResult.detail,
        marketPhaseSuggestedStructure: phaseResult.suggestedStructure,
      };
    }),

  // ── News Pulse ─────────────────────────────────────────────────────────────
  // Fetches live headlines + analyst signals for a ticker and runs LLM sentiment
  getNewsPulse: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10).toUpperCase() }))
    .query(async ({ input }) => {
      const { ticker } = input;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any = await callDataApi("YahooFinance/get_stock_insights", {
          query: { symbol: ticker },
        });
        const r = raw?.finance?.result ?? {};

        // Significant developments (news headlines)
        const sigDevs: { headline: string; date: string }[] = (r.sigDevs ?? []).slice(0, 8);

        // Analyst reports (recent headings)
        const reports: { title: string; date: string }[] = (r.reports ?? [])
          .slice(0, 6)
          .map((rpt: { headHtml?: string; reportDate?: string }) => ({
            title: rpt.headHtml ?? "",
            date: (rpt.reportDate ?? "").slice(0, 10),
          }))
          .filter((rpt: { title: string }) => rpt.title.length > 0);

        // Analyst recommendation
        const rec = r.recommendation ?? {};
        const analystRating: string = rec.rating ?? "N/A";
        const analystTarget: number | null = rec.targetPrice ?? null;
        const analystProvider: string = rec.provider ?? "";

        // Technical outlook from Trading Central
        const techEvents = r.instrumentInfo?.technicalEvents ?? {};
        const shortOutlook: string = techEvents.shortTermOutlook?.direction ?? "N/A";
        const midOutlook: string = techEvents.intermediateTermOutlook?.direction ?? "N/A";
        const shortDesc: string = techEvents.shortTermOutlook?.stateDescription ?? "";

        // Build context for LLM sentiment analysis
        const headlineText = [
          ...sigDevs.map(s => `[${s.date}] ${s.headline}`),
          ...reports.slice(0, 3).map(rpt => `[${rpt.date}] ${rpt.title}`),
        ].join("\n");

        if (!headlineText.trim()) {
          return {
            ticker,
            headlines: [],
            analystRating,
            analystTarget,
            analystProvider,
            shortOutlook,
            midOutlook,
            overallSentiment: "NEUTRAL" as const,
            tradeImplication: "No recent news found. Proceed based on technical signals only.",
            catalystRisk: false,
            dataAsOf: new Date().toISOString(),
          };
        }

        // LLM sentiment classification
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a professional options trader's pre-trade news analyst. Analyze the following stock news and signals, then respond with a JSON object containing exactly these three fields:
- sentiment: one of "BULLISH", "BEARISH", or "NEUTRAL" based on the overall news tone
- catalystRisk: true if there is a major catalyst (earnings surprise, M&A, FDA decision, regulatory action, guidance change) in the last 7 days, false otherwise
- tradeImplication: a 1-2 sentence plain-English statement telling the trader whether the news confirms or contradicts a directional options trade`,
            },
            {
              role: "user",
              content: `Ticker: ${ticker}\nAnalyst Rating: ${analystRating}${analystTarget ? ` (target $${analystTarget})` : ""}\nTechnical Outlook: Short-term=${shortOutlook}, Mid-term=${midOutlook}\nTechnical Detail: ${shortDesc}\n\nRecent Headlines and Reports:\n${headlineText}\n\nRespond with JSON only.`,
            },
          ],
          maxTokens: 300,
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "news_sentiment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  sentiment: { type: "string", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
                  catalystRisk: { type: "boolean" },
                  tradeImplication: { type: "string" },
                },
                required: ["sentiment", "catalystRisk", "tradeImplication"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = typeof llmResult.choices[0]?.message?.content === "string"
          ? llmResult.choices[0].message.content : "{}";

        let parsed: { sentiment?: string; catalystRisk?: boolean; tradeImplication?: string } = {};
        try { parsed = JSON.parse(content); } catch { /* fallback */ }

        const overallSentiment = (["BULLISH", "BEARISH", "NEUTRAL"].includes(parsed.sentiment ?? "")
          ? parsed.sentiment : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL";

        // Build headline list for UI
        const headlines = [
          ...sigDevs.map(s => ({ text: s.headline, date: s.date, type: "news" as const })),
          ...reports.slice(0, 3).map(rpt => ({ text: rpt.title, date: rpt.date, type: "report" as const })),
        ];

        return {
          ticker,
          headlines,
          analystRating,
          analystTarget,
          analystProvider,
          shortOutlook,
          midOutlook,
          overallSentiment,
          tradeImplication: parsed.tradeImplication ?? "Insufficient data for trade implication.",
          catalystRisk: parsed.catalystRisk ?? false,
          dataAsOf: new Date().toISOString(),
        };
      } catch (err) {
        return {
          ticker,
          headlines: [],
          analystRating: "N/A",
          analystTarget: null,
          analystProvider: "",
          shortOutlook: "N/A",
          midOutlook: "N/A",
          overallSentiment: "NEUTRAL" as const,
          tradeImplication: "News data temporarily unavailable.",
          catalystRisk: false,
          dataAsOf: new Date().toISOString(),
        };
      }
    }),
});
