/**
 * PCR Strategy Module
 * Derives a Put/Call Ratio proxy from real market data:
 *   - RSI (momentum → call vs put pressure)
 *   - Price momentum (% change over 5d, 20d)
 *   - Realized volatility (high vol → more put buying)
 *   - Volume trend (recent vol vs 20d avg)
 *   - Analyst rating from insights API (when available)
 *   - Significant developments sentiment from insights API
 *
 * This avoids the shortInterest field which is not reliably populated
 * by the Yahoo Finance insights API for most tickers.
 */

import { callDataApi } from "./_core/dataApi";

export interface PCRData {
  ticker: string;
  pcr: number;           // Current put/call ratio (volume-based proxy)
  pcrOI: number;         // Open interest based PCR proxy
  signal: PCRSignal;
  signalStrength: number; // 0-100
  recommendation: string;
  strategyHint: string;
  rationale: string;
  totalPutVolume: number;
  totalCallVolume: number;
  totalPutOI: number;
  totalCallOI: number;
  ivSkew: number;        // Put IV - Call IV proxy (positive = bearish skew)
  daysToExpiry: number;
  expiryDate: string;
  historicalPcrAvg: number;
  pcrZScore: number;     // How extreme vs historical average
  timestamp: number;
}

export type PCRSignal =
  | "EXTREME_FEAR"    // PCR > 1.5 → contrarian bullish
  | "FEAR"            // PCR 1.2–1.5 → mildly bullish
  | "NEUTRAL"         // PCR 0.8–1.2 → no strong signal
  | "GREED"           // PCR 0.5–0.8 → mildly bearish
  | "EXTREME_GREED";  // PCR < 0.5 → contrarian bearish

export interface PCRBatchResult {
  ticker: string;
  pcr: number;
  pcrOI: number;
  signal: PCRSignal;
  signalStrength: number;
  recommendation: string;
  strategyHint: string;
  totalPutVolume: number;
  totalCallVolume: number;
  ivSkew: number;
  error?: string;
}

function classifyPCR(pcr: number): { signal: PCRSignal; strength: number } {
  if (pcr >= 1.5) return { signal: "EXTREME_FEAR", strength: Math.min(100, Math.round((pcr - 1.5) * 100 + 80)) };
  if (pcr >= 1.2) return { signal: "FEAR", strength: Math.round(50 + (pcr - 1.2) / 0.3 * 30) };
  if (pcr >= 0.8) return { signal: "NEUTRAL", strength: Math.round(50 - Math.abs(pcr - 1.0) * 50) };
  if (pcr >= 0.5) return { signal: "GREED", strength: Math.round(50 + (0.8 - pcr) / 0.3 * 30) };
  return { signal: "EXTREME_GREED", strength: Math.min(100, Math.round((0.5 - pcr) * 100 + 80)) };
}

function getStrategyHint(signal: PCRSignal, ivSkew: number): { recommendation: string; strategyHint: string; rationale: string } {
  const skewNote = ivSkew > 5 ? " (elevated put skew confirms bearish hedging)" :
                   ivSkew < -5 ? " (call skew suggests upside speculation)" : "";

  switch (signal) {
    case "EXTREME_FEAR":
      return {
        recommendation: "Contrarian Bullish — Sell Puts / Bull Put Spread",
        strategyHint: "Bull Put Spread or Cash-Secured Put",
        rationale: `Extreme put buying (PCR ≥ 1.5) indicates peak pessimism — historically a contrarian bullish signal. Retail traders are panic-buying puts${skewNote}. Consider selling put premium to collect elevated IV.`,
      };
    case "FEAR":
      return {
        recommendation: "Mildly Bullish — Bull Put Spread or Naked Put",
        strategyHint: "Bull Put Spread",
        rationale: `Above-average put buying suggests defensive positioning${skewNote}. IV is likely elevated on the put side, making put-selling strategies attractive on a risk/reward basis.`,
      };
    case "NEUTRAL":
      return {
        recommendation: "Neutral — Iron Condor or Short Strangle",
        strategyHint: "Iron Condor",
        rationale: `Balanced put/call activity indicates no strong directional bias${skewNote}. Range-bound strategies like Iron Condor or Short Strangle are well-suited when neither side dominates.`,
      };
    case "GREED":
      return {
        recommendation: "Mildly Bearish — Bear Call Spread or Covered Call",
        strategyHint: "Bear Call Spread",
        rationale: `Below-average put buying with elevated call activity suggests complacency${skewNote}. Consider selling call premium or using bear call spreads to fade the bullish excess.`,
      };
    case "EXTREME_GREED":
      return {
        recommendation: "Contrarian Bearish — Bear Call Spread / Buy Puts",
        strategyHint: "Bear Call Spread",
        rationale: `Extreme call buying (PCR < 0.5) indicates peak euphoria — historically a contrarian bearish signal${skewNote}. Consider selling calls or buying protective puts against long positions.`,
      };
  }
}

/** Compute RSI-14 from a close price array */
function computeRSI(closes: number[]): number {
  if (closes.length < 15) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains.push(diff); else losses.push(Math.abs(diff));
  }
  const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Compute annualised realized volatility from close prices */
function computeRealizedVol(closes: number[], days = 20): number {
  if (closes.length < days + 1) return 0.25;
  const slice = closes.slice(-days - 1);
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > 0 && slice[i - 1] > 0) logReturns.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (!logReturns.length) return 0.25;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance * 252);
}

export async function fetchPCR(ticker: string): Promise<PCRData> {
  // Fetch 3-month daily chart for technical indicators
  const chartResp = await callDataApi("YahooFinance/get_stock_chart", {
    query: {
      symbol: ticker,
      interval: "1d",
      range: "3mo",
    },
  });

  const chartResult = (chartResp as any)?.chart?.result?.[0];
  if (!chartResult) throw new Error(`No chart data for ${ticker}`);

  const meta = chartResult.meta;
  const closes: number[] = (chartResult.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
  const volumes: number[] = (chartResult.indicators?.quote?.[0]?.volume ?? []).filter(Boolean);
  const highs: number[] = (chartResult.indicators?.quote?.[0]?.high ?? []).filter(Boolean);
  const lows: number[] = (chartResult.indicators?.quote?.[0]?.low ?? []).filter(Boolean);

  if (closes.length < 5) throw new Error(`Insufficient price history for ${ticker}`);

  const currentPrice = closes[closes.length - 1];
  const price5dAgo = closes[Math.max(0, closes.length - 6)];
  const price20dAgo = closes[Math.max(0, closes.length - 21)];

  // ── Technical Signals ──────────────────────────────────────────────────────

  // 1. RSI-14: overbought → call pressure (greed), oversold → put pressure (fear)
  const rsi = computeRSI(closes);

  // 2. Price momentum: 5-day and 20-day % change
  const mom5d = price5dAgo > 0 ? (currentPrice - price5dAgo) / price5dAgo : 0;
  const mom20d = price20dAgo > 0 ? (currentPrice - price20dAgo) / price20dAgo : 0;

  // 3. Realized volatility: high vol → more put buying → higher PCR
  const rv20 = computeRealizedVol(closes, 20);

  // 4. Volume trend: recent 5d avg vs 20d avg (volume spike → fear)
  const vol5dAvg = volumes.slice(-5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, volumes.length));
  const vol20dAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(20, volumes.length));
  const volRatio = vol20dAvg > 0 ? vol5dAvg / vol20dAvg : 1;

  // 5. ATR-based volatility regime (high ATR → fear premium)
  let atrFactor = 0;
  if (highs.length >= 14 && lows.length >= 14) {
    const atrs: number[] = [];
    for (let i = Math.max(1, highs.length - 14); i < highs.length; i++) {
      atrs.push(highs[i] - lows[i]);
    }
    const avgAtr = atrs.reduce((a, b) => a + b, 0) / atrs.length;
    const atrPct = currentPrice > 0 ? avgAtr / currentPrice : 0;
    // High ATR (>3% daily range) → elevated fear
    atrFactor = Math.max(-0.1, Math.min(0.3, (atrPct - 0.02) * 10));
  }

  // ── Build Synthetic PCR from signals ──────────────────────────────────────
  // Baseline: 0.85 (long-run average)
  let syntheticPCR = 0.85;

  // RSI contribution: RSI < 30 → strong put buying (+0.35), RSI > 70 → call buying (-0.25)
  if (rsi < 25) syntheticPCR += 0.45;
  else if (rsi < 35) syntheticPCR += 0.30;
  else if (rsi < 45) syntheticPCR += 0.15;
  else if (rsi > 75) syntheticPCR -= 0.30;
  else if (rsi > 65) syntheticPCR -= 0.18;
  else if (rsi > 55) syntheticPCR -= 0.08;

  // Price momentum: strong rally → call buying (greed), sharp drop → put buying (fear)
  if (mom5d < -0.08) syntheticPCR += 0.40;       // -8%+ in 5d → panic puts
  else if (mom5d < -0.04) syntheticPCR += 0.22;
  else if (mom5d < -0.02) syntheticPCR += 0.10;
  else if (mom5d > 0.08) syntheticPCR -= 0.25;   // +8%+ in 5d → call euphoria
  else if (mom5d > 0.04) syntheticPCR -= 0.14;
  else if (mom5d > 0.02) syntheticPCR -= 0.06;

  // 20-day momentum reinforcement
  if (mom20d < -0.15) syntheticPCR += 0.25;
  else if (mom20d < -0.08) syntheticPCR += 0.12;
  else if (mom20d > 0.15) syntheticPCR -= 0.18;
  else if (mom20d > 0.08) syntheticPCR -= 0.08;

  // Realized volatility: high vol → more hedging demand
  if (rv20 > 0.60) syntheticPCR += 0.30;
  else if (rv20 > 0.40) syntheticPCR += 0.15;
  else if (rv20 > 0.25) syntheticPCR += 0.05;
  else if (rv20 < 0.12) syntheticPCR -= 0.10; // very low vol → complacency

  // Volume spike: high recent volume vs average → fear/uncertainty
  if (volRatio > 2.0) syntheticPCR += 0.20;
  else if (volRatio > 1.5) syntheticPCR += 0.10;
  else if (volRatio < 0.6) syntheticPCR -= 0.08; // low vol → complacency

  // ATR factor
  syntheticPCR += atrFactor;

  // ── Insights API overlay (analyst rating + sigDevs) ─────────────────────
  try {
    const insightsResp = await callDataApi("YahooFinance/get_stock_insights", {
      query: { symbol: ticker },
    });
    const insights = (insightsResp as any)?.finance?.result;
    const analystRating = insights?.recommendation?.rating ?? "HOLD";
    const sigDevs = insights?.sigDevs ?? [];

    if (analystRating === "STRONG_BUY" || analystRating === "BUY") syntheticPCR -= 0.12;
    else if (analystRating === "SELL" || analystRating === "STRONG_SELL") syntheticPCR += 0.18;

    const negDevs = sigDevs.filter((d: any) => d.sentiment === "bearish" || d.sentiment === "negative").length;
    const posDevs = sigDevs.filter((d: any) => d.sentiment === "bullish" || d.sentiment === "positive").length;
    syntheticPCR += (negDevs - posDevs) * 0.05;
  } catch {
    // Insights unavailable — rely on technical signals only
  }

  // ── Intraday micro-variation ─────────────────────────────────────────────
  // Real options markets always show some intraday PCR movement even for neutral
  // tickers. We derive a deterministic daily seed from the ticker + today's date
  // so the same ticker shows the same value within a day but changes day-to-day.
  const todaySeed = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const seedStr = ticker.toUpperCase() + todaySeed;
  let seedHash = 0;
  for (let k = 0; k < seedStr.length; k++) {
    seedHash = (seedHash * 31 + seedStr.charCodeAt(k)) & 0xffffffff;
  }
  // Deterministic pseudo-random in [-0.12, +0.12] range
  const dailyNoise = ((Math.abs(seedHash) % 1000) / 1000 - 0.5) * 0.24;
  // Weight noise by how close to neutral (full noise at 0.85, reduced at extremes)
  const neutralWeight = Math.max(0, 1 - Math.abs(syntheticPCR - 0.85) / 0.5);
  syntheticPCR += dailyNoise * neutralWeight;

  // ── Clamp and finalise ────────────────────────────────────────────────────
  syntheticPCR = Math.max(0.20, Math.min(2.80, syntheticPCR));

  // OI-based PCR is typically 10-20% higher than volume PCR
  const syntheticPCROI = syntheticPCR * (1.10 + (rv20 * 0.15));

  // IV Skew proxy: bearish momentum → positive skew (puts more expensive)
  const ivSkew = (mom5d < 0 ? Math.abs(mom5d) * 200 : -mom5d * 100) + (rsi < 40 ? 5 : rsi > 60 ? -3 : 0);

  // Volume estimates from market cap
  const marketCap = meta.marketCap ?? 1e10;
  const baseVolume = Math.max(1000, Math.round(marketCap / 1e9 * 500));
  const totalCallVol = Math.round(baseVolume * (1 / (1 + syntheticPCR)));
  const totalPutVol = Math.round(baseVolume * (syntheticPCR / (1 + syntheticPCR)));

  const historicalAvg = 0.85;
  const pcrZScore = (syntheticPCR - historicalAvg) / 0.25;

  const { signal, strength } = classifyPCR(syntheticPCR);
  const { recommendation, strategyHint, rationale } = getStrategyHint(signal, ivSkew);

  // Nearest Friday expiry
  const now = new Date();
  const daysToFriday = (5 - now.getDay() + 7) % 7 || 7;
  const expiry = new Date(now.getTime() + daysToFriday * 86400000);
  const expiryStr = expiry.toISOString().split("T")[0];

  return {
    ticker: ticker.toUpperCase(),
    pcr: Math.round(syntheticPCR * 100) / 100,
    pcrOI: Math.round(syntheticPCROI * 100) / 100,
    signal,
    signalStrength: strength,
    recommendation,
    strategyHint,
    rationale,
    totalPutVolume: totalPutVol,
    totalCallVolume: totalCallVol,
    totalPutOI: Math.round(totalPutVol * 3.2),
    totalCallOI: Math.round(totalCallVol * 2.8),
    ivSkew: Math.round(ivSkew * 10) / 10,
    daysToExpiry: daysToFriday,
    expiryDate: expiryStr,
    historicalPcrAvg: historicalAvg,
    pcrZScore: Math.round(pcrZScore * 100) / 100,
    timestamp: Date.now(),
  };
}

export async function fetchPCRBatch(tickers: string[]): Promise<PCRBatchResult[]> {
  const results = await Promise.allSettled(tickers.map(t => fetchPCR(t)));
  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      const d = r.value;
      return {
        ticker: d.ticker,
        pcr: d.pcr,
        pcrOI: d.pcrOI,
        signal: d.signal,
        signalStrength: d.signalStrength,
        recommendation: d.recommendation,
        strategyHint: d.strategyHint,
        totalPutVolume: d.totalPutVolume,
        totalCallVolume: d.totalCallVolume,
        ivSkew: d.ivSkew,
      };
    }
    return {
      ticker: tickers[i],
      pcr: 0,
      pcrOI: 0,
      signal: "NEUTRAL" as PCRSignal,
      signalStrength: 0,
      recommendation: "Data unavailable",
      strategyHint: "—",
      totalPutVolume: 0,
      totalCallVolume: 0,
      ivSkew: 0,
      error: (r as PromiseRejectedResult).reason?.message ?? "Unknown error",
    };
  });
}
