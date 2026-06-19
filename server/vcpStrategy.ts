/**
 * VCP (Volatility Contraction Pattern) Strategy Module
 * Detects Mark Minervini's VCP setup in price data and generates
 * options strategy recommendations for breakout plays.
 */

import { callDataApi } from "./_core/dataApi";

export interface VCPContraction {
  index: number;
  startPrice: number;
  endPrice: number;
  depth: number;        // percentage pullback
  durationDays: number;
}

export interface VCPData {
  ticker: string;
  currentPrice: number;
  hasVCP: boolean;
  vcpScore: number;       // 0-10
  stage: VCPStage;
  contractions: VCPContraction[];
  pivotLevel: number;
  distanceToPivot: number; // percentage
  priorUptrend: number;    // percentage gain before base
  baseDepth: number;       // deepest pullback in base
  baseDuration: number;    // days in base
  volumeContraction: boolean;
  recentVolumeDry: boolean;
  fiftyDayMA: number;
  twoHundredDayMA: number;
  aboveKeyMAs: boolean;
  recommendation: string;
  optionsPlay: string;
  rationale: string;
  stopLoss: number;
  priceTarget: number;
  riskReward: number;
  priceHistory: { date: string; close: number; volume: number }[];
  timestamp: number;
}

export type VCPStage =
  | "STAGE_1_BASE"      // Building base, not ready
  | "STAGE_2_UPTREND"   // Strong uptrend, VCP forming
  | "VCP_FORMING"       // Active VCP contractions detected
  | "VCP_PIVOT"         // At pivot — buy zone
  | "BREAKOUT"          // Just broke out
  | "EXTENDED"          // Too extended, wait for pullback
  | "STAGE_3_TOP"       // Topping pattern
  | "STAGE_4_DECLINE";  // Downtrend

function calcSMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    const slice = prices.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function findSwingHighsLows(closes: number[], window = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = window; i < closes.length - window; i++) {
    const slice = closes.slice(i - window, i + window + 1);
    const center = closes[i];
    if (center === Math.max(...slice)) highs.push(i);
    if (center === Math.min(...slice)) lows.push(i);
  }
  return { highs, lows };
}

function detectContractions(closes: number[], highs: number[], lows: number[]): VCPContraction[] {
  const contractions: VCPContraction[] = [];
  // Pair each swing high with the next swing low to find pullbacks
  for (let h = 0; h < highs.length - 1; h++) {
    const hiIdx = highs[h];
    const hiPrice = closes[hiIdx];
    // Find next swing low after this high
    const nextLows = lows.filter(l => l > hiIdx);
    if (nextLows.length === 0) continue;
    const loIdx = nextLows[0];
    const loPrice = closes[loIdx];
    const depth = ((hiPrice - loPrice) / hiPrice) * 100;
    if (depth < 1 || depth > 50) continue; // filter noise and crashes
    contractions.push({
      index: h,
      startPrice: hiPrice,
      endPrice: loPrice,
      depth: Math.round(depth * 10) / 10,
      durationDays: loIdx - hiIdx,
    });
  }
  return contractions;
}

function isContractingSequence(contractions: VCPContraction[]): boolean {
  if (contractions.length < 2) return false;
  // Each contraction depth should be smaller than the previous
  let contracting = 0;
  for (let i = 1; i < contractions.length; i++) {
    if (contractions[i].depth < contractions[i - 1].depth) contracting++;
  }
  return contracting >= Math.floor(contractions.length / 2);
}

export async function fetchVCP(ticker: string): Promise<VCPData> {
  const resp = await callDataApi("YahooFinance/get_stock_chart", {
    query: {
      symbol: ticker,
      interval: "1d",
      range: "1y",
      includeAdjustedClose: true,
      events: "div,split",
    },
  });

  const result = (resp as any)?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);

  const meta = result.meta;
  const timestamps: number[] = result.timestamp ?? [];
  const quotes = result.indicators?.quote?.[0] ?? {};
  const closes: number[] = (quotes.close ?? []).map((c: number | null) => c ?? 0);
  const volumes: number[] = (quotes.volume ?? []).map((v: number | null) => v ?? 0);

  if (closes.length < 60) throw new Error(`Insufficient data for ${ticker}`);

  const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1];

  // Build price history for chart (last 90 days)
  const priceHistory = timestamps.slice(-90).map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split("T")[0],
    close: Math.round((closes[closes.length - 90 + i] ?? 0) * 100) / 100,
    volume: volumes[volumes.length - 90 + i] ?? 0,
  })).filter(p => p.close > 0);

  // Moving averages
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);
  const ma50 = sma50[sma50.length - 1] ?? 0;
  const ma200 = sma200[sma200.length - 1] ?? 0;
  const aboveKeyMAs = currentPrice > ma50 && currentPrice > ma200;

  // Prior uptrend: measure from 52-week low to recent high (last 3 months)
  const yearLow = Math.min(...closes.filter(c => c > 0));
  const recentHigh = Math.max(...closes.slice(-60).filter(c => c > 0));
  const priorUptrend = yearLow > 0 ? ((recentHigh - yearLow) / yearLow) * 100 : 0;

  // Find swing points in last 90 days (the base)
  const baseCloses = closes.slice(-90);
  const { highs, lows } = findSwingHighsLows(baseCloses, 4);
  const contractions = detectContractions(baseCloses, highs, lows);

  // Base metrics
  const baseHigh = Math.max(...baseCloses.filter(c => c > 0));
  const baseLow = Math.min(...baseCloses.filter(c => c > 0));
  const baseDepth = baseHigh > 0 ? ((baseHigh - baseLow) / baseHigh) * 100 : 0;
  const baseDuration = 90;

  // Volume contraction: avg volume last 10 days vs avg last 30 days
  const recentVols = volumes.slice(-10).filter(v => v > 0);
  const baseVols = volumes.slice(-30).filter(v => v > 0);
  const avgRecentVol = recentVols.reduce((a, b) => a + b, 0) / (recentVols.length || 1);
  const avgBaseVol = baseVols.reduce((a, b) => a + b, 0) / (baseVols.length || 1);
  const volumeContraction = avgRecentVol < avgBaseVol * 0.75;
  const recentVolumeDry = avgRecentVol < avgBaseVol * 0.5;

  // Pivot level: highest close in last 10 days
  const pivotLevel = Math.max(...closes.slice(-10).filter(c => c > 0));
  const distanceToPivot = pivotLevel > 0 ? ((pivotLevel - currentPrice) / currentPrice) * 100 : 0;

  // VCP scoring (0-10)
  let vcpScore = 0;
  const isContracting = isContractingSequence(contractions);

  if (priorUptrend >= 30) vcpScore += 2;
  else if (priorUptrend >= 15) vcpScore += 1;

  if (contractions.length >= 3 && isContracting) vcpScore += 2.5;
  else if (contractions.length >= 2 && isContracting) vcpScore += 1.5;
  else if (contractions.length >= 2) vcpScore += 0.5;

  if (baseDepth >= 5 && baseDepth <= 30) vcpScore += 1;
  if (volumeContraction) vcpScore += 1.5;
  if (recentVolumeDry) vcpScore += 0.5;
  if (aboveKeyMAs) vcpScore += 1;
  if (distanceToPivot >= 0 && distanceToPivot <= 3) vcpScore += 1; // at pivot

  vcpScore = Math.min(10, Math.round(vcpScore * 10) / 10);
  const hasVCP = vcpScore >= 5.0 && contractions.length >= 2 && isContracting;

  // Stage classification
  let stage: VCPStage;
  if (!aboveKeyMAs && currentPrice < ma200) {
    stage = "STAGE_4_DECLINE";
  } else if (priorUptrend > 100 && currentPrice > recentHigh * 0.98) {
    stage = "EXTENDED";
  } else if (hasVCP && distanceToPivot <= 1.5) {
    stage = "VCP_PIVOT";
  } else if (hasVCP) {
    stage = "VCP_FORMING";
  } else if (aboveKeyMAs && priorUptrend >= 20) {
    stage = "STAGE_2_UPTREND";
  } else if (priorUptrend < 10) {
    stage = "STAGE_1_BASE";
  } else {
    stage = "STAGE_2_UPTREND";
  }

  // Stop loss: below the last contraction low or 7% below current
  const lastContractionLow = contractions.length > 0
    ? contractions[contractions.length - 1].endPrice
    : currentPrice * 0.93;
  const stopLoss = Math.max(lastContractionLow, currentPrice * 0.93);

  // Price target: measure the base depth and project from pivot
  const targetMultiplier = Math.min(3, Math.max(1.5, baseDepth / 10));
  const priceTarget = pivotLevel * (1 + (baseDepth / 100) * targetMultiplier * 0.5);
  const riskReward = stopLoss < currentPrice
    ? (priceTarget - currentPrice) / (currentPrice - stopLoss)
    : 0;

  // Options play
  let recommendation: string;
  let optionsPlay: string;
  let rationale: string;

  if (stage === "VCP_PIVOT" || stage === "VCP_FORMING") {
    recommendation = "Bullish — Buy Call Debit Spread at Breakout";
    optionsPlay = `Buy ${ticker} Call Debit Spread: Long ATM call, Short call at price target, expiry 4-6 weeks out`;
    rationale = `${ticker} shows a ${contractions.length}-contraction VCP with ${priorUptrend.toFixed(0)}% prior uptrend. Volume is ${volumeContraction ? "contracting (confirming)" : "mixed"}. Pivot at $${pivotLevel.toFixed(2)} — enter on breakout with volume. Stop below $${stopLoss.toFixed(2)}, target $${priceTarget.toFixed(2)} (${riskReward.toFixed(1)}:1 R/R).`;
  } else if (stage === "EXTENDED") {
    recommendation = "Wait — Stock Extended, Watch for Pullback Base";
    optionsPlay = "No trade — wait for next base to form";
    rationale = `${ticker} is extended ${priorUptrend.toFixed(0)}% from lows. Wait for a new VCP base to form before entering. Entering extended stocks increases risk.`;
  } else if (stage === "STAGE_4_DECLINE") {
    recommendation = "Bearish — Bear Call Spread or Avoid";
    optionsPlay = `Bear Call Spread on ${ticker} — sell OTM call, buy higher strike call`;
    rationale = `${ticker} is below key moving averages in a Stage 4 decline. Avoid long positions. A bear call spread can profit from continued weakness.`;
  } else {
    recommendation = "Neutral — Monitor for VCP Setup";
    optionsPlay = "No trade — watch for VCP contractions to develop";
    rationale = `${ticker} has a ${priorUptrend.toFixed(0)}% prior uptrend but VCP contractions are not yet well-defined (score: ${vcpScore}/10). Continue monitoring for tighter consolidation.`;
  }

  return {
    ticker: ticker.toUpperCase(),
    currentPrice: Math.round(currentPrice * 100) / 100,
    hasVCP,
    vcpScore,
    stage,
    contractions: contractions.slice(-5), // last 5 contractions
    pivotLevel: Math.round(pivotLevel * 100) / 100,
    distanceToPivot: Math.round(distanceToPivot * 100) / 100,
    priorUptrend: Math.round(priorUptrend * 10) / 10,
    baseDepth: Math.round(baseDepth * 10) / 10,
    baseDuration,
    volumeContraction,
    recentVolumeDry,
    fiftyDayMA: Math.round(ma50 * 100) / 100,
    twoHundredDayMA: Math.round(ma200 * 100) / 100,
    aboveKeyMAs,
    recommendation,
    optionsPlay,
    rationale,
    stopLoss: Math.round(stopLoss * 100) / 100,
    priceTarget: Math.round(priceTarget * 100) / 100,
    riskReward: Math.round(riskReward * 10) / 10,
    priceHistory,
    timestamp: Date.now(),
  };
}

export async function fetchVCPBatch(tickers: string[]): Promise<Array<VCPData & { error?: string }>> {
  const results = await Promise.allSettled(tickers.map(t => fetchVCP(t)));
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      ticker: tickers[i].toUpperCase(),
      currentPrice: 0,
      hasVCP: false,
      vcpScore: 0,
      stage: "STAGE_1_BASE" as VCPStage,
      contractions: [],
      pivotLevel: 0,
      distanceToPivot: 0,
      priorUptrend: 0,
      baseDepth: 0,
      baseDuration: 0,
      volumeContraction: false,
      recentVolumeDry: false,
      fiftyDayMA: 0,
      twoHundredDayMA: 0,
      aboveKeyMAs: false,
      recommendation: "Data unavailable",
      optionsPlay: "—",
      rationale: r.reason?.message ?? "Unknown error",
      stopLoss: 0,
      priceTarget: 0,
      riskReward: 0,
      priceHistory: [],
      timestamp: Date.now(),
      error: r.reason?.message ?? "Unknown error",
    };
  });
}
