// ============================================================
// Options Selling Strategy Analysis Engine
// Computes Greeks, indicators, scores all 4 strategies, and
// returns a ranked recommendation.
// ============================================================

export type StrategyName =
  | "Naked Put"
  | "Naked Call"
  | "Short Strangle"
  | "Iron Condor"
  | "Bull Put Spread"
  | "Bear Call Spread"
  | "Bull Call Spread"
  | "Bear Put Spread"
  | "Long Straddle"
  | "Long Strangle"
  | "Cash-Secured Put"
  | "Covered Call"
  | "Butterfly Spread"
  | "Jade Lizard"
  | "Broken Wing Butterfly";

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionLeg {
  strike: number;
  expiry: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  mid: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  openInterest: number;
  volume: number;
  dte: number;
}

export interface StrategyResult {
  name: StrategyName;
  legs: OptionLeg[];
  netCredit: number;
  maxProfit: number | null; // null = unlimited (e.g. Long Straddle/Strangle)
  maxLoss: number | null; // null = undefined/unlimited
  buyingPower: number;
  pop: number; // probability of profit 0-1
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  breakevens: number[];
  scores: {
    pop: number;
    liquidity: number;
    riskDefinition: number;
    directionalFit: number;
    ivRvRatio: number;
    theta: number;
    vega: number;
  };
  compositeScore: number;
  rank: number;
  rationale: string;
  pnlCurve: { price: number; pnl: number }[];
}

export interface RegimeMetrics {
  lastPrice: number;
  sma20: number;
  sma50: number;
  sma200: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  rv20: number;
  rv30: number;
  medianIV: number;
  ivRvRatio: number;
  ivPercentileRank: number; // 0-100: how elevated current IV is vs 52-week range
  directionalBias: "Bullish" | "Bearish" | "Neutral";
  directionalScore: number; // -3 to +3
  // Historical series for charts (last 252 trading days)
  rsiHistory: { date: string; value: number }[];
  macdHistory: { date: string; macd: number; signal: number; hist: number }[];
}

export interface EarningsInfo {
  nextEarningsDate: string | null; // ISO date string or null if unknown
  daysToEarnings: number | null;
  expectedEarningsMove: number | null; // % move implied by IV at earnings DTE
  historicalEarningsMoves: number[]; // last 4 actual earnings moves as % (abs)
  avgHistoricalMove: number | null; // average of historicalEarningsMoves
}

export interface AnalysisResult {
  ticker: string;
  analysisDate: string;
  targetDte: number;
  accountSize: number;
  expiryUsed: string;
  dte: number;
  regime: RegimeMetrics;
  strategies: StrategyResult[];
  recommendation: StrategyResult;
  priceHistory: PriceBar[];
  optionChain: OptionLeg[];
  expectedMove: number; // ±1σ move in dollars to expiry
  expectedMovePct: number; // ±1σ move as % of current price
  earningsInfo: EarningsInfo | null;
}

// ─── Math helpers ──────────────────────────────────────────────────────────────

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ─── Black-Scholes ─────────────────────────────────────────────────────────────

export function bsPrice(
  S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"
): number {
  if (T <= 0) return Math.max(type === "call" ? S - K : K - S, 0);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === "call") return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function bsGreeks(
  S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"
) {
  if (T <= 0) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = normCdf(d1), Nd2 = normCdf(d2);
  const nd1 = normPdf(d1);
  const price = type === "call"
    ? S * Nd1 - K * Math.exp(-r * T) * Nd2
    : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
  const delta = type === "call" ? Nd1 : Nd1 - 1;
  const gamma = nd1 / (S * sigma * sqrtT);
  const theta = (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * (type === "call" ? Nd2 : normCdf(-d2))) / 365;
  const vega = S * nd1 * sqrtT / 100;
  const rho = type === "call"
    ? K * T * Math.exp(-r * T) * Nd2 / 100
    : -K * T * Math.exp(-r * T) * normCdf(-d2) / 100;
  return { price, delta, gamma, theta, vega, rho };
}

// Implied volatility via Newton-Raphson
export function impliedVol(
  marketPrice: number, S: number, K: number, T: number, r: number, type: "call" | "put"
): number {
  if (T <= 0) return 0.3;
  let sigma = 0.3;
  for (let i = 0; i < 100; i++) {
    const g = bsGreeks(S, K, T, r, sigma, type);
    const diff = g.price - marketPrice;
    if (Math.abs(diff) < 1e-6) break;
    const vega = g.vega * 100; // undo /100 scaling
    if (Math.abs(vega) < 1e-10) break;
    sigma -= diff / vega;
    sigma = Math.max(0.01, Math.min(sigma, 5.0));
  }
  return sigma;
}

// ─── Technical indicators ──────────────────────────────────────────────────────

export function computeSMA(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result[i] = sum / period;
  }
  return result;
}

export function computeEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = new Array(closes.length).fill(NaN);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

export function computeRSI(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  result[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  }
  return result;
}

export function computeMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const macdLine = closes.map((_, i) =>
    isNaN(emaFast[i]) || isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i]
  );
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalLine: number[] = new Array(closes.length).fill(NaN);
  if (validMacd.length >= signal) {
    const signalEma = computeEMA(validMacd, signal);
    let si = 0;
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(macdLine[i])) {
        if (si < signalEma.length) signalLine[i] = signalEma[si];
        si++;
      }
    }
  }
  const histogram = closes.map((_, i) =>
    isNaN(macdLine[i]) || isNaN(signalLine[i]) ? NaN : macdLine[i] - signalLine[i]
  );
  return { macdLine, signalLine, histogram };
}

export function computeRealizedVol(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0.25;
  const returns: number[] = [];
  const start = closes.length - period - 1;
  for (let i = start + 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252);
}

// ─── Option chain selection helpers ───────────────────────────────────────────

function findClosestByDelta(
  chain: OptionLeg[], type: "call" | "put", targetAbsDelta: number
): OptionLeg | null {
  const legs = chain.filter(l => l.type === type && l.mid > 0);
  if (!legs.length) return null;
  return legs.reduce((best, leg) => {
    const bd = Math.abs(Math.abs(best.delta) - targetAbsDelta);
    const ld = Math.abs(Math.abs(leg.delta) - targetAbsDelta);
    return ld < bd ? leg : best;
  });
}

function findWing(
  chain: OptionLeg[], type: "call" | "put", shortStrike: number, width: number
): OptionLeg | null {
  const targetStrike = type === "put" ? shortStrike - width : shortStrike + width;
  // Only consider legs that are strictly on the correct side of the short strike
  // (long put must be BELOW short put; long call must be ABOVE short call)
  const legs = chain.filter(l =>
    l.type === type &&
    l.mid > 0 &&
    (type === "put" ? l.strike < shortStrike : l.strike > shortStrike)
  );
  if (!legs.length) return null;
  return legs.reduce((best, leg) => {
    return Math.abs(leg.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? leg : best;
  });
}

// ─── P&L curve generation ─────────────────────────────────────────────────────

function generatePnlCurve(
  strategy: StrategyName,
  legs: OptionLeg[],
  netCredit: number,
  lastPrice: number
): { price: number; pnl: number }[] {
  const range = lastPrice * 0.25;
  const points = 80;
  const step = (range * 2) / points;
  const curve: { price: number; pnl: number }[] = [];

  for (let i = 0; i <= points; i++) {
    const S = lastPrice - range + i * step;
    let pnl = netCredit * 100; // start with credit received (per contract)

    for (const leg of legs) {
      const intrinsic = leg.type === "call"
        ? Math.max(S - leg.strike, 0)
        : Math.max(leg.strike - S, 0);
      // Use explicit position tag if present, otherwise default to short
      const pos = (leg as any).position ?? "short";
      if (pos === "short") pnl -= intrinsic * 100;
      if (pos === "long") pnl += intrinsic * 100;
    }
    curve.push({ price: parseFloat(S.toFixed(2)), pnl: parseFloat(pnl.toFixed(2)) });
  }
  return curve;
}

// ─── Scoring engine ────────────────────────────────────────────────────────────

function scoreStrategy(
  strategy: StrategyName,
  legs: OptionLeg[],
  netCredit: number,
  maxLoss: number | null,
  pop: number,
  regime: RegimeMetrics
): StrategyResult["scores"] {
  const { ivRvRatio: ivRv, directionalScore, rsi14 } = regime;

  // ── 1. POP score (0-20) ──
  // For multi-leg strategies the joint probability is already computed as a
  // product of two deltas in runAnalysis, which is overly pessimistic because
  // both legs can't expire worthless independently. Use the raw POP value
  // directly — it already reflects the actual probability of the position
  // being profitable at expiry.
  const popScore = Math.min(20, pop * 20);

  // ── 2. Liquidity score (0-20) ──
  // Average across ALL legs (short and long) — multi-leg strategies should not
  // be penalised for having more legs if each leg is liquid.
  const shortLegs = legs.filter(l => (l as any).position !== "long");
  const legsForLiquidity = shortLegs.length > 0 ? shortLegs : legs;
  const avgSpreadPct = legsForLiquidity.reduce((s, l) => {
    const mid = l.mid > 0 ? l.mid : 0.01;
    return s + (l.ask - l.bid) / mid;
  }, 0) / legsForLiquidity.length;
  const avgOI = legsForLiquidity.reduce((s, l) => s + l.openInterest, 0) / legsForLiquidity.length;
  const spreadScore = Math.max(0, 10 - avgSpreadPct * 20);
  const oiScore = Math.min(10, Math.log10(Math.max(avgOI, 1)) * 2.5);
  const liquidityScore = spreadScore + oiScore;

  // ── 3. Risk definition score (0-20) ──
  const riskScore =
    strategy === "Iron Condor" || strategy === "Butterfly Spread" ? 20
    : strategy === "Bull Put Spread" || strategy === "Bear Call Spread"
      || strategy === "Bull Call Spread" || strategy === "Bear Put Spread" ? 18
    : strategy === "Jade Lizard" ? 16 // put side naked, call side defined — partial protection
    : strategy === "Broken Wing Butterfly" ? 17 // net credit, defined risk with skewed protection
    : strategy === "Short Strangle" || strategy === "Cash-Secured Put"
      || strategy === "Covered Call" ? 10
    : strategy === "Long Straddle" || strategy === "Long Strangle" ? 14 // defined risk (debit paid)
    : strategy === "Naked Put" ? 6
    : 2; // Naked Call: unlimited upside risk

  // ── 4. Directional fit score (0-20) ──
  // Key fix: Neutral/range-bound markets (the most common regime for liquid
  // underlyings) should strongly favour Iron Condor and Short Strangle, not
  // give Naked Put a free 10-point head start.
  // Naked Put needs a clearly bullish market to score well here.
  // Naked Call needs a clearly bearish market.
  // IC/Strangle peak at neutral and decay with directional bias.
  let dirScore: number;
  if (strategy === "Naked Put" || strategy === "Cash-Secured Put") {
    dirScore = 8 + directionalScore * 4; // bullish-leaning
  } else if (strategy === "Naked Call" || strategy === "Covered Call") {
    dirScore = 8 - directionalScore * 4; // bearish/neutral-leaning
  } else if (strategy === "Bull Put Spread" || strategy === "Bull Call Spread") {
    dirScore = 6 + directionalScore * 5; // needs bullish
  } else if (strategy === "Bear Call Spread" || strategy === "Bear Put Spread") {
    dirScore = 6 - directionalScore * 5; // needs bearish
  } else if (strategy === "Long Straddle" || strategy === "Long Strangle") {
    // Needs big move in either direction — best when IV is low and move expected
    dirScore = 10 + Math.abs(directionalScore) * 2;
  } else if (strategy === "Butterfly Spread") {
    // Best when price pins near ATM — neutral, low-move expectation
    dirScore = 20 - Math.abs(directionalScore) * 4;
  } else if (strategy === "Short Strangle") {
    dirScore = 18 - Math.abs(directionalScore) * 2.5;
  } else if (strategy === "Jade Lizard") {
    // Bullish-to-neutral: short put + short call spread. Best when slightly bullish.
    dirScore = 10 + directionalScore * 3;
  } else if (strategy === "Broken Wing Butterfly") {
    // Bearish-to-neutral: best when slightly bearish or neutral, skewed short call side.
    dirScore = 12 - directionalScore * 3;
  } else {
    // Iron Condor: best in neutral
    dirScore = 20 - Math.abs(directionalScore) * 3.5;
  }
  dirScore = Math.max(0, Math.min(20, dirScore));

  // ── 5. IV/RV ratio score (0-20) ──
  // Long-premium strategies (Long Straddle/Strangle) prefer LOW IV (cheap options).
  // Short-premium strategies prefer HIGH IV (rich premium to sell).
  let ivRvScore: number;
  if (strategy === "Long Straddle" || strategy === "Long Strangle") {
    // Inverse: low IV/RV is good for buying premium
    ivRvScore = Math.min(20, Math.max(0, (1.5 - ivRv) * 15));
  } else {
    ivRvScore = Math.min(20, Math.max(0, (ivRv - 0.8) * 20));
    if (ivRv > 1.5 && (strategy === "Iron Condor" || strategy === "Short Strangle"
        || strategy === "Bull Put Spread" || strategy === "Bear Call Spread")) {
      ivRvScore = Math.min(20, ivRvScore + 2);
    }
  }

  // ── 6. Theta score (0-10) ──
  // Normalise by number of SHORT legs only — long legs in IC reduce net theta
  // and that is already captured by using the actual net theta sum.
  // Avoid penalising IC just because it has 4 legs total.
  const netTheta = Math.abs(legs.reduce((s, l) => {
    const sign = (l as any).position === "long" ? -1 : 1;
    return s + sign * Math.abs(l.theta);
  }, 0));
  const thetaScore = Math.min(10, netTheta * 50);

  // ── 7. Vega score (0-10) ──
  // Net vega exposure (short legs add vega risk, long legs reduce it).
  // Iron Condor's long wings reduce net vega — this should be rewarded, not
  // penalised. Use net vega (short minus long) rather than total absolute vega.
  const netVega = Math.abs(legs.reduce((s, l) => {
    const sign = (l as any).position === "long" ? -1 : 1;
    return s + sign * Math.abs(l.vega);
  }, 0));
  const vegaScore = Math.max(0, 10 - netVega * 5);

  return {
    pop: parseFloat(Math.min(20, Math.max(0, popScore)).toFixed(2)),
    liquidity: parseFloat(Math.min(20, Math.max(0, liquidityScore)).toFixed(2)),
    riskDefinition: parseFloat(Math.min(20, Math.max(0, riskScore)).toFixed(2)),
    directionalFit: parseFloat(Math.min(20, Math.max(0, dirScore)).toFixed(2)),
    ivRvRatio: parseFloat(Math.min(20, Math.max(0, ivRvScore)).toFixed(2)),
    theta: parseFloat(Math.min(10, Math.max(0, thetaScore)).toFixed(2)),
    vega: parseFloat(Math.min(10, Math.max(0, vegaScore)).toFixed(2)),
  };
}

function buildRationale(strategy: StrategyName, scores: StrategyResult["scores"], regime: RegimeMetrics, breakevens: number[]): string {
  const be = breakevens.map(b => b.toFixed(2)).join(" to ");
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const ivRvLabel = regime.ivRvRatio > 1.2 ? "elevated" : regime.ivRvRatio > 0.9 ? "fair" : "compressed";
  const biasLabel = regime.directionalBias.toLowerCase();
  const s = total.toFixed(1);

  const map: Partial<Record<StrategyName, string>> = {
    "Iron Condor": `Defined-risk range-income setup. Breakeven range ${be}; max loss capped. IV/RV is ${ivRvLabel}, directional bias is ${biasLabel}. Composite score ${s}/100.`,
    "Short Strangle": `Undefined-risk premium collection on both sides. Breakevens at ${be}. IV/RV is ${ivRvLabel}, market bias is ${biasLabel}. Composite score ${s}/100.`,
    "Naked Put": `Bullish-leaning premium collection. Put breakeven near ${be}. IV/RV ${ivRvLabel}, bias ${biasLabel}. Composite score ${s}/100.`,
    "Naked Call": `Bearish premium collection. Call breakeven near ${be}. IV/RV ${ivRvLabel}, bias ${biasLabel}. Composite score ${s}/100.`,
    "Bull Put Spread": `Bullish credit spread. Sell higher put, buy lower put. Max profit if price stays above ${breakevens[0]?.toFixed(2)}. Defined risk. Composite score ${s}/100.`,
    "Bear Call Spread": `Bearish credit spread. Sell lower call, buy higher call. Max profit if price stays below ${breakevens[0]?.toFixed(2)}. Defined risk. Composite score ${s}/100.`,
    "Bull Call Spread": `Bullish debit spread. Buy lower call, sell higher call. Profits if price rises above ${breakevens[0]?.toFixed(2)}. Defined risk and reward. Composite score ${s}/100.`,
    "Bear Put Spread": `Bearish debit spread. Buy higher put, sell lower put. Profits if price falls below ${breakevens[0]?.toFixed(2)}. Defined risk and reward. Composite score ${s}/100.`,
    "Long Straddle": `Buy ATM call and put. Profits from large move in either direction. Breakeven at ${be}. Best when IV is low. Composite score ${s}/100.`,
    "Long Strangle": `Buy OTM call and put. Profits from large move in either direction. Breakevens at ${be}. Lower cost than straddle. Composite score ${s}/100.`,
    "Cash-Secured Put": `Sell put fully cash-secured. Collect premium; acquire stock at discount if assigned. Breakeven at ${be}. Composite score ${s}/100.`,
    "Covered Call": `Sell call against long stock position. Collect premium; cap upside above ${be}. Income strategy. Composite score ${s}/100.`,
    "Butterfly Spread": `Buy 1 lower call, sell 2 ATM calls, buy 1 higher call. Max profit if price pins at ${be} at expiry. Defined risk. Composite score ${s}/100.`,
    "Jade Lizard": `Short put + short call spread. If total credit > call spread width, there is ZERO upside risk. Only risk is to the downside below ${be}. Bullish-to-neutral. Composite score ${s}/100.`,
    "Broken Wing Butterfly": `Skewed short butterfly (1×2×1 with skipped strike) that generates a net credit. Zero upside risk if stock rallies. Max profit if price pins near short strikes. Breakevens at ${be}. Composite score ${s}/100.`,
  };
  return map[strategy] ?? `Composite score ${s}/100. IV/RV ${ivRvLabel}, bias ${biasLabel}.`;
}

// ─── Main analysis function ────────────────────────────────────────────────────

export function runAnalysis(
  ticker: string,
  targetDte: number,
  accountSize: number,
  priceHistory: PriceBar[],
  optionChain: OptionLeg[],
  minCredit?: number, // optional minimum net credit per contract ($)
  strategyCategory: "all" | "credit" | "debit" = "all",
  earningsInfo?: EarningsInfo | null
): AnalysisResult {
  const closes = priceHistory.map(b => b.close);
  const lastPrice = closes[closes.length - 1];
  const analysisDate = new Date().toISOString();
  const r = 0.045; // risk-free rate

  // ── Regime metrics ──
  const sma20Arr = computeSMA(closes, 20);
  const sma50Arr = computeSMA(closes, 50);
  const sma200Arr = computeSMA(closes, 200);
  const rsiArr = computeRSI(closes, 14);
  const { macdLine, signalLine, histogram } = computeMACD(closes);

  const last = closes.length - 1;
  const sma20 = sma20Arr[last] ?? lastPrice;
  const sma50 = sma50Arr[last] ?? lastPrice;
  const sma200 = sma200Arr[last] ?? lastPrice;
  const rsi14 = rsiArr[last] ?? 50;
  const macdLineVal = macdLine[last] ?? 0;
  const macdSignalVal = signalLine[last] ?? 0;
  const macdHistVal = histogram[last] ?? 0;
  const rv20 = computeRealizedVol(closes, 20);
  const rv30 = computeRealizedVol(closes, 30);

  // Median IV from chain
  const ivValues = optionChain.filter(l => l.iv > 0).map(l => l.iv).sort((a, b) => a - b);
  const medianIV = ivValues.length > 0 ? ivValues[Math.floor(ivValues.length / 2)] : rv30 * 1.1;
  const ivRvRatio = rv20 > 0 ? medianIV / rv20 : 1.0;

  // IV Percentile Rank: compare current IV against rolling 252-day IV estimates
  // We approximate historical IV as realized vol * 1.2 for each 20-day window
  const historicalIVs: number[] = [];
  for (let i = 20; i < closes.length; i++) {
    const windowCloses = closes.slice(i - 20, i + 1);
    const windowRV = computeRealizedVol(windowCloses, 20);
    historicalIVs.push(windowRV * 1.2);
  }
  const ivBelow = historicalIVs.filter(iv => iv < medianIV).length;
  const ivPercentileRank = historicalIVs.length > 0
    ? Math.round((ivBelow / historicalIVs.length) * 100)
    : 50;

  // Directional score: sum of signals (-3 to +3)
  let dirScore = 0;
  if (lastPrice > sma20) dirScore += 0.5;
  if (lastPrice > sma50) dirScore += 0.75;
  if (lastPrice > sma200) dirScore += 0.75;
  if (macdHistVal > 0) dirScore += 0.5;
  if (rsi14 > 55) dirScore += 0.5; else if (rsi14 < 45) dirScore -= 0.5;
  if (rsi14 > 70) dirScore -= 0.25; // overbought mean-reversion
  if (rsi14 < 30) dirScore += 0.25; // oversold mean-reversion

  const directionalBias: "Bullish" | "Bearish" | "Neutral" =
    dirScore > 0.75 ? "Bullish" : dirScore < -0.75 ? "Bearish" : "Neutral";

  // Build historical series for RSI and MACD charts (last 252 bars)
  const historyBars = priceHistory.slice(-252);
  const histCloses = historyBars.map(b => b.close);
  const histRsi = computeRSI(histCloses, 14);
  const histMacd = computeMACD(histCloses);
  const rsiHistory = historyBars
    .map((b, i) => ({ date: b.date, value: isNaN(histRsi[i]) ? null : parseFloat(histRsi[i].toFixed(2)) }))
    .filter(p => p.value !== null) as { date: string; value: number }[];
  const macdHistory = historyBars
    .map((b, i) => ({
      date: b.date,
      macd: isNaN(histMacd.macdLine[i]) ? null : parseFloat(histMacd.macdLine[i].toFixed(4)),
      signal: isNaN(histMacd.signalLine[i]) ? null : parseFloat(histMacd.signalLine[i].toFixed(4)),
      hist: isNaN(histMacd.histogram[i]) ? null : parseFloat(histMacd.histogram[i].toFixed(4)),
    }))
    .filter(p => p.macd !== null && p.signal !== null) as { date: string; macd: number; signal: number; hist: number }[];

  const regime: RegimeMetrics = {
    lastPrice, sma20, sma50, sma200, rsi14,
    macdLine: macdLineVal, macdSignal: macdSignalVal, macdHist: macdHistVal,
    rv20, rv30, medianIV, ivRvRatio, ivPercentileRank,
    directionalBias, directionalScore: dirScore,
    rsiHistory, macdHistory,
  };

  // ── Select expiry ──
  const expiries = Array.from(new Set(optionChain.map(l => l.expiry))).sort();
  let expiryUsed = expiries[0] ?? "";
  let dte = optionChain.find(l => l.expiry === expiryUsed)?.dte ?? targetDte;

  // Try to find expiry closest to targetDte
  for (const exp of expiries) {
    const d = optionChain.find(l => l.expiry === exp)?.dte ?? 0;
    if (Math.abs(d - targetDte) < Math.abs(dte - targetDte)) {
      expiryUsed = exp;
      dte = d;
    }
  }

  const chainForExpiry = optionChain.filter(l => l.expiry === expiryUsed);
  const T = Math.max(dte, 1) / 365;

  // ── Build strategies ──
  const strategies: StrategyResult[] = [];

  // ── 1. Naked Put ──
  const npLeg = findClosestByDelta(chainForExpiry, "put", 0.30);
  if (npLeg) {
    const credit = npLeg.mid;
    const be = npLeg.strike - credit;
    const pop = 1 - Math.abs(npLeg.delta);
    const maxLoss = npLeg.strike * 100; // cash-secured max loss
    const bp = Math.min(npLeg.strike * 100, accountSize);
    const shortLeg = { ...npLeg, position: "short" };
    const pnlLegs = [shortLeg];
    const pnlCurve = generatePnlCurve("Naked Put", pnlLegs, credit, lastPrice);
    const scores = scoreStrategy("Naked Put", [npLeg], credit, maxLoss, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    const rationale = buildRationale("Naked Put", scores, regime, [be]);
    strategies.push({
      name: "Naked Put", legs: [shortLeg],
      netCredit: parseFloat(credit.toFixed(2)),
      maxProfit: parseFloat((credit * 100).toFixed(2)),
      maxLoss: parseFloat(maxLoss.toFixed(2)),
      buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat(npLeg.delta.toFixed(4)),
      gamma: parseFloat(npLeg.gamma.toFixed(6)),
      theta: parseFloat(npLeg.theta.toFixed(4)),
      vega: parseFloat(npLeg.vega.toFixed(4)),
      rho: parseFloat(npLeg.rho.toFixed(4)),
      breakevens: [parseFloat(be.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale, pnlCurve,
    });
  }

  // ── 2. Naked Call ──
  const ncLeg = findClosestByDelta(chainForExpiry, "call", 0.30);
  if (ncLeg) {
    const credit = ncLeg.mid;
    const be = ncLeg.strike + credit;
    const pop = 1 - Math.abs(ncLeg.delta);
    const bp = Math.min(ncLeg.strike * 100 * 0.20, accountSize); // margin estimate
    const shortLeg = { ...ncLeg, position: "short" };
    const pnlCurve = generatePnlCurve("Naked Call", [shortLeg], credit, lastPrice);
    const scores = scoreStrategy("Naked Call", [ncLeg], credit, null, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    const rationale = buildRationale("Naked Call", scores, regime, [be]);
    strategies.push({
      name: "Naked Call", legs: [shortLeg],
      netCredit: parseFloat(credit.toFixed(2)),
      maxProfit: parseFloat((credit * 100).toFixed(2)),
      maxLoss: null,
      buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat(ncLeg.delta.toFixed(4)),
      gamma: parseFloat(ncLeg.gamma.toFixed(6)),
      theta: parseFloat(ncLeg.theta.toFixed(4)),
      vega: parseFloat(ncLeg.vega.toFixed(4)),
      rho: parseFloat(ncLeg.rho.toFixed(4)),
      breakevens: [parseFloat(be.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale, pnlCurve,
    });
  }

  // ── 3. Short Strangle ──
  const ssPut = findClosestByDelta(chainForExpiry, "put", 0.25);
  const ssCall = findClosestByDelta(chainForExpiry, "call", 0.25);
  if (ssPut && ssCall) {
    const credit = ssPut.mid + ssCall.mid;
    const beLow = ssPut.strike - credit;
    const beHigh = ssCall.strike + credit;
    // POP for strangle: probability that price stays between both breakevens.
    // The product formula (p1 * p2) is too pessimistic because the two legs
    // are not independent — if the put side is safe, the call side is also
    // likely safe. Use the average of the two individual POPs as a better
    // approximation of the range-bound probability.
    const popPut = 1 - Math.abs(ssPut.delta);
    const popCall = 1 - Math.abs(ssCall.delta);
    const pop = (popPut + popCall) / 2;
    const bp = Math.min(Math.max(ssPut.strike, ssCall.strike) * 100 * 0.20, accountSize);
    const shortPut = { ...ssPut, position: "short" };
    const shortCall = { ...ssCall, position: "short" };
    const pnlCurve = generatePnlCurve("Short Strangle", [shortPut, shortCall], credit, lastPrice);
    const scores = scoreStrategy("Short Strangle", [ssPut, ssCall], credit, null, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    const rationale = buildRationale("Short Strangle", scores, regime, [beLow, beHigh]);
    strategies.push({
      name: "Short Strangle", legs: [shortPut, shortCall],
      netCredit: parseFloat(credit.toFixed(2)),
      maxProfit: parseFloat((credit * 100).toFixed(2)),
      maxLoss: null,
      buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat((ssPut.delta + ssCall.delta).toFixed(4)),
      gamma: parseFloat((ssPut.gamma + ssCall.gamma).toFixed(6)),
      theta: parseFloat((ssPut.theta + ssCall.theta).toFixed(4)),
      vega: parseFloat((ssPut.vega + ssCall.vega).toFixed(4)),
      rho: parseFloat((ssPut.rho + ssCall.rho).toFixed(4)),
      breakevens: [parseFloat(beLow.toFixed(2)), parseFloat(beHigh.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale, pnlCurve,
    });
  }

  // ── 4. Iron Condor ──
  const icShortPut = findClosestByDelta(chainForExpiry, "put", 0.20);
  const icShortCall = findClosestByDelta(chainForExpiry, "call", 0.20);
  if (icShortPut && icShortCall) {
    // Wing width: ~5% of stock price, rounded to nearest $5 increment.
    // Minimum is 3× the strike step so the long wing is always at least
    // 3 strikes away from the short strike (prevents zero-credit collapse).
    const strikeStep = lastPrice * 0.005;
    const minWidth = strikeStep * 3;
    const wingWidth = Math.max(minWidth, Math.round(lastPrice * 0.05 / 5) * 5);
    const icLongPut = findWing(chainForExpiry, "put", icShortPut.strike, wingWidth);
    const icLongCall = findWing(chainForExpiry, "call", icShortCall.strike, wingWidth);
    if (icLongPut && icLongCall) {
      const credit = (icShortPut.mid - icLongPut.mid) + (icShortCall.mid - icLongCall.mid);
      // Skip if the spread produces zero or negative credit (degenerate case)
      if (credit <= 0.01) {
        // Fall through — don't push this strategy
      } else {
      const beLow = icShortPut.strike - credit;
      const beHigh = icShortCall.strike + credit;
      // Use actual spread width from selected strikes (not the target wingWidth)
      const actualPutWidth = icShortPut.strike - icLongPut.strike;
      const actualCallWidth = icLongCall.strike - icShortCall.strike;
      const actualWidth = Math.max(actualPutWidth, actualCallWidth);
      const maxLoss = Math.max(0, (actualWidth - credit)) * 100;
      const bp = maxLoss > 0 ? maxLoss : actualWidth * 100;
      // Same fix as strangle: use average of individual POPs, not the product.
      const icPopPut = 1 - Math.abs(icShortPut.delta);
      const icPopCall = 1 - Math.abs(icShortCall.delta);
      const pop = (icPopPut + icPopCall) / 2;
      const shortPutL = { ...icShortPut, position: "short" };
      const longPutL = { ...icLongPut, position: "long" };
      const shortCallL = { ...icShortCall, position: "short" };
      const longCallL = { ...icLongCall, position: "long" };
      const pnlCurve = generatePnlCurve("Iron Condor", [shortPutL, longPutL, shortCallL, longCallL], credit, lastPrice);
      const allLegs = [icShortPut, icLongPut, icShortCall, icLongCall];
      const scores = scoreStrategy("Iron Condor", allLegs, credit, maxLoss, pop, regime);
      const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
      const rationale = buildRationale("Iron Condor", scores, regime, [beLow, beHigh]);
      strategies.push({
        name: "Iron Condor", legs: [shortPutL, longPutL, shortCallL, longCallL],
        netCredit: parseFloat(credit.toFixed(2)),
        maxProfit: parseFloat((credit * 100).toFixed(2)),
        maxLoss: parseFloat(maxLoss.toFixed(2)),
        buyingPower: parseFloat(bp.toFixed(2)),
        pop: parseFloat(pop.toFixed(4)),
        delta: parseFloat((icShortPut.delta + icShortCall.delta).toFixed(4)),
        gamma: parseFloat((icShortPut.gamma + icShortCall.gamma + icLongPut.gamma + icLongCall.gamma).toFixed(6)),
        theta: parseFloat((icShortPut.theta + icShortCall.theta + icLongPut.theta + icLongCall.theta).toFixed(4)),
        vega: parseFloat((icShortPut.vega + icShortCall.vega + icLongPut.vega + icLongCall.vega).toFixed(4)),
        rho: parseFloat((icShortPut.rho + icShortCall.rho + icLongPut.rho + icLongCall.rho).toFixed(4)),
        breakevens: [parseFloat(beLow.toFixed(2)), parseFloat(beHigh.toFixed(2))],
        scores, compositeScore: parseFloat(composite.toFixed(2)),
        rank: 0, rationale, pnlCurve,
      });
      } // end else (credit > 0.01)
    }
  }

  // ── 5. Bull Put Spread (credit spread, bullish) ──
  const bpsBuyPut = findClosestByDelta(chainForExpiry, "put", 0.30);
  if (bpsBuyPut) {
    const strikeStep = lastPrice * 0.005;
    const spreadWidth = Math.max(strikeStep * 3, Math.round(lastPrice * 0.04 / 5) * 5);
    const bpsSellPut = findWing(chainForExpiry, "call", bpsBuyPut.strike, spreadWidth); // find higher put
    const bpsSellPutActual = chainForExpiry
      .filter(l => l.type === "put" && l.strike > bpsBuyPut.strike)
      .sort((a, b) => Math.abs(a.strike - (bpsBuyPut.strike + spreadWidth)) - Math.abs(b.strike - (bpsBuyPut.strike + spreadWidth)))[0];
    if (bpsSellPutActual) {
      const credit = bpsSellPutActual.mid - bpsBuyPut.mid;
      if (credit > 0.01) {
        const width = bpsSellPutActual.strike - bpsBuyPut.strike;
        const maxLoss = (width - credit) * 100;
        const be = bpsSellPutActual.strike - credit;
        const pop = 1 - Math.abs(bpsSellPutActual.delta);
        const bp = maxLoss;
        const shortL = { ...bpsSellPutActual, position: "short" };
        const longL = { ...bpsBuyPut, position: "long" };
        const pnlCurve = generatePnlCurve("Bull Put Spread", [shortL, longL], credit, lastPrice);
        const scores = scoreStrategy("Bull Put Spread", [bpsSellPutActual, bpsBuyPut], credit, maxLoss, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        strategies.push({
          name: "Bull Put Spread", legs: [shortL, longL],
          netCredit: parseFloat(credit.toFixed(2)), maxProfit: parseFloat((credit * 100).toFixed(2)),
          maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((bpsSellPutActual.delta + bpsBuyPut.delta).toFixed(4)),
          gamma: parseFloat((bpsSellPutActual.gamma + bpsBuyPut.gamma).toFixed(6)),
          theta: parseFloat((bpsSellPutActual.theta + bpsBuyPut.theta).toFixed(4)),
          vega: parseFloat((bpsSellPutActual.vega + bpsBuyPut.vega).toFixed(4)),
          rho: parseFloat((bpsSellPutActual.rho + bpsBuyPut.rho).toFixed(4)),
          breakevens: [parseFloat(be.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0, rationale: buildRationale("Bull Put Spread", scores, regime, [be]), pnlCurve,
        });
      }
    }
  }

  // ── 6. Bear Call Spread (credit spread, bearish) ──
  const bcsSellCall = findClosestByDelta(chainForExpiry, "call", 0.30);
  if (bcsSellCall) {
    const strikeStep = lastPrice * 0.005;
    const spreadWidth = Math.max(strikeStep * 3, Math.round(lastPrice * 0.04 / 5) * 5);
    const bcsBuyCallActual = chainForExpiry
      .filter(l => l.type === "call" && l.strike > bcsSellCall.strike)
      .sort((a, b) => Math.abs(a.strike - (bcsSellCall.strike + spreadWidth)) - Math.abs(b.strike - (bcsSellCall.strike + spreadWidth)))[0];
    if (bcsBuyCallActual) {
      const credit = bcsSellCall.mid - bcsBuyCallActual.mid;
      if (credit > 0.01) {
        const width = bcsBuyCallActual.strike - bcsSellCall.strike;
        const maxLoss = (width - credit) * 100;
        const be = bcsSellCall.strike + credit;
        const pop = 1 - Math.abs(bcsSellCall.delta);
        const bp = maxLoss;
        const shortL = { ...bcsSellCall, position: "short" };
        const longL = { ...bcsBuyCallActual, position: "long" };
        const pnlCurve = generatePnlCurve("Bear Call Spread", [shortL, longL], credit, lastPrice);
        const scores = scoreStrategy("Bear Call Spread", [bcsSellCall, bcsBuyCallActual], credit, maxLoss, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        strategies.push({
          name: "Bear Call Spread", legs: [shortL, longL],
          netCredit: parseFloat(credit.toFixed(2)), maxProfit: parseFloat((credit * 100).toFixed(2)),
          maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((bcsSellCall.delta + bcsBuyCallActual.delta).toFixed(4)),
          gamma: parseFloat((bcsSellCall.gamma + bcsBuyCallActual.gamma).toFixed(6)),
          theta: parseFloat((bcsSellCall.theta + bcsBuyCallActual.theta).toFixed(4)),
          vega: parseFloat((bcsSellCall.vega + bcsBuyCallActual.vega).toFixed(4)),
          rho: parseFloat((bcsSellCall.rho + bcsBuyCallActual.rho).toFixed(4)),
          breakevens: [parseFloat(be.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0, rationale: buildRationale("Bear Call Spread", scores, regime, [be]), pnlCurve,
        });
      }
    }
  }

  // ── 7. Bull Call Spread (debit spread, bullish) ──
  const bcsLongCall = findClosestByDelta(chainForExpiry, "call", 0.50); // ATM long call
  if (bcsLongCall) {
    const strikeStep = lastPrice * 0.005;
    const spreadWidth = Math.max(strikeStep * 3, Math.round(lastPrice * 0.04 / 5) * 5);
    const bcsShortCallActual = chainForExpiry
      .filter(l => l.type === "call" && l.strike > bcsLongCall.strike)
      .sort((a, b) => Math.abs(a.strike - (bcsLongCall.strike + spreadWidth)) - Math.abs(b.strike - (bcsLongCall.strike + spreadWidth)))[0];
    if (bcsShortCallActual) {
      const debit = bcsLongCall.mid - bcsShortCallActual.mid;
      if (debit > 0.01) {
        const width = bcsShortCallActual.strike - bcsLongCall.strike;
        const maxProfit = (width - debit) * 100;
        const maxLoss = debit * 100;
        const be = bcsLongCall.strike + debit;
        const pop = Math.abs(bcsLongCall.delta); // approx POP for debit spread
        const bp = maxLoss;
        const longL = { ...bcsLongCall, position: "long" };
        const shortL = { ...bcsShortCallActual, position: "short" };
        const pnlCurve = generatePnlCurve("Bull Call Spread", [longL, shortL], -debit, lastPrice);
        const scores = scoreStrategy("Bull Call Spread", [bcsLongCall, bcsShortCallActual], -debit, maxLoss, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        strategies.push({
          name: "Bull Call Spread", legs: [longL, shortL],
          netCredit: parseFloat((-debit).toFixed(2)), maxProfit: parseFloat(maxProfit.toFixed(2)),
          maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((bcsLongCall.delta + bcsShortCallActual.delta).toFixed(4)),
          gamma: parseFloat((bcsLongCall.gamma + bcsShortCallActual.gamma).toFixed(6)),
          theta: parseFloat((bcsLongCall.theta + bcsShortCallActual.theta).toFixed(4)),
          vega: parseFloat((bcsLongCall.vega + bcsShortCallActual.vega).toFixed(4)),
          rho: parseFloat((bcsLongCall.rho + bcsShortCallActual.rho).toFixed(4)),
          breakevens: [parseFloat(be.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0, rationale: buildRationale("Bull Call Spread", scores, regime, [be]), pnlCurve,
        });
      }
    }
  }

  // ── 8. Bear Put Spread (debit spread, bearish) ──
  const bpsLongPut = findClosestByDelta(chainForExpiry, "put", 0.50); // ATM long put
  if (bpsLongPut) {
    const strikeStep = lastPrice * 0.005;
    const spreadWidth = Math.max(strikeStep * 3, Math.round(lastPrice * 0.04 / 5) * 5);
    const bpsShortPutActual = chainForExpiry
      .filter(l => l.type === "put" && l.strike < bpsLongPut.strike)
      .sort((a, b) => Math.abs(a.strike - (bpsLongPut.strike - spreadWidth)) - Math.abs(b.strike - (bpsLongPut.strike - spreadWidth)))[0];
    if (bpsShortPutActual) {
      const debit = bpsLongPut.mid - bpsShortPutActual.mid;
      if (debit > 0.01) {
        const width = bpsLongPut.strike - bpsShortPutActual.strike;
        const maxProfit = (width - debit) * 100;
        const maxLoss = debit * 100;
        const be = bpsLongPut.strike - debit;
        const pop = Math.abs(bpsLongPut.delta);
        const bp = maxLoss;
        const longL = { ...bpsLongPut, position: "long" };
        const shortL = { ...bpsShortPutActual, position: "short" };
        const pnlCurve = generatePnlCurve("Bear Put Spread", [longL, shortL], -debit, lastPrice);
        const scores = scoreStrategy("Bear Put Spread", [bpsLongPut, bpsShortPutActual], -debit, maxLoss, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        strategies.push({
          name: "Bear Put Spread", legs: [longL, shortL],
          netCredit: parseFloat((-debit).toFixed(2)), maxProfit: parseFloat(maxProfit.toFixed(2)),
          maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((bpsLongPut.delta + bpsShortPutActual.delta).toFixed(4)),
          gamma: parseFloat((bpsLongPut.gamma + bpsShortPutActual.gamma).toFixed(6)),
          theta: parseFloat((bpsLongPut.theta + bpsShortPutActual.theta).toFixed(4)),
          vega: parseFloat((bpsLongPut.vega + bpsShortPutActual.vega).toFixed(4)),
          rho: parseFloat((bpsLongPut.rho + bpsShortPutActual.rho).toFixed(4)),
          breakevens: [parseFloat(be.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0, rationale: buildRationale("Bear Put Spread", scores, regime, [be]), pnlCurve,
        });
      }
    }
  }

  // ── 9. Long Straddle (buy ATM call + ATM put) ──
  const lsCall = findClosestByDelta(chainForExpiry, "call", 0.50);
  const lsPut = findClosestByDelta(chainForExpiry, "put", 0.50);
  if (lsCall && lsPut) {
    const debit = lsCall.mid + lsPut.mid;
    const beUp = lsCall.strike + debit;
    const beDown = lsPut.strike - debit;
    const maxLoss = debit * 100;
    const pop = 0.45; // long straddle POP is typically ~40-50%
    const bp = maxLoss;
    const longCall = { ...lsCall, position: "long" };
    const longPut = { ...lsPut, position: "long" };
    const pnlCurve = generatePnlCurve("Long Straddle", [longCall, longPut], -debit, lastPrice);
    const scores = scoreStrategy("Long Straddle", [lsCall, lsPut], -debit, maxLoss, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    strategies.push({
      name: "Long Straddle", legs: [longCall, longPut],
      netCredit: parseFloat((-debit).toFixed(2)), maxProfit: null as null, // unlimited
      maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat((lsCall.delta + lsPut.delta).toFixed(4)),
      gamma: parseFloat((lsCall.gamma + lsPut.gamma).toFixed(6)),
      theta: parseFloat((lsCall.theta + lsPut.theta).toFixed(4)),
      vega: parseFloat((lsCall.vega + lsPut.vega).toFixed(4)),
      rho: parseFloat((lsCall.rho + lsPut.rho).toFixed(4)),
      breakevens: [parseFloat(beDown.toFixed(2)), parseFloat(beUp.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale: buildRationale("Long Straddle", scores, regime, [beDown, beUp]), pnlCurve,
    });
  }

  // ── 10. Long Strangle (buy OTM call + OTM put) ──
  const lsgCall = findClosestByDelta(chainForExpiry, "call", 0.25);
  const lsgPut = findClosestByDelta(chainForExpiry, "put", 0.25);
  if (lsgCall && lsgPut) {
    const debit = lsgCall.mid + lsgPut.mid;
    const beUp = lsgCall.strike + debit;
    const beDown = lsgPut.strike - debit;
    const maxLoss = debit * 100;
    const pop = 0.40;
    const bp = maxLoss;
    const longCall = { ...lsgCall, position: "long" };
    const longPut = { ...lsgPut, position: "long" };
    const pnlCurve = generatePnlCurve("Long Strangle", [longCall, longPut], -debit, lastPrice);
    const scores = scoreStrategy("Long Strangle", [lsgCall, lsgPut], -debit, maxLoss, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    strategies.push({
      name: "Long Strangle", legs: [longCall, longPut],
      netCredit: parseFloat((-debit).toFixed(2)), maxProfit: null as null,
      maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat((lsgCall.delta + lsgPut.delta).toFixed(4)),
      gamma: parseFloat((lsgCall.gamma + lsgPut.gamma).toFixed(6)),
      theta: parseFloat((lsgCall.theta + lsgPut.theta).toFixed(4)),
      vega: parseFloat((lsgCall.vega + lsgPut.vega).toFixed(4)),
      rho: parseFloat((lsgCall.rho + lsgPut.rho).toFixed(4)),
      breakevens: [parseFloat(beDown.toFixed(2)), parseFloat(beUp.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale: buildRationale("Long Strangle", scores, regime, [beDown, beUp]), pnlCurve,
    });
  }

  // ── 11. Cash-Secured Put (same as Naked Put but full cash secured) ──
  const cspLeg = findClosestByDelta(chainForExpiry, "put", 0.30);
  if (cspLeg) {
    const credit = cspLeg.mid;
    const be = cspLeg.strike - credit;
    const pop = 1 - Math.abs(cspLeg.delta);
    const maxLoss = cspLeg.strike * 100;
    const bp = cspLeg.strike * 100; // fully cash secured
    const shortLeg = { ...cspLeg, position: "short" };
    const pnlCurve = generatePnlCurve("Cash-Secured Put", [shortLeg], credit, lastPrice);
    const scores = scoreStrategy("Cash-Secured Put", [cspLeg], credit, maxLoss, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    strategies.push({
      name: "Cash-Secured Put", legs: [shortLeg],
      netCredit: parseFloat(credit.toFixed(2)), maxProfit: parseFloat((credit * 100).toFixed(2)),
      maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat(cspLeg.delta.toFixed(4)),
      gamma: parseFloat(cspLeg.gamma.toFixed(6)),
      theta: parseFloat(cspLeg.theta.toFixed(4)),
      vega: parseFloat(cspLeg.vega.toFixed(4)),
      rho: parseFloat(cspLeg.rho.toFixed(4)),
      breakevens: [parseFloat(be.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale: buildRationale("Cash-Secured Put", scores, regime, [be]), pnlCurve,
    });
  }

  // ── 12. Covered Call (sell OTM call against stock) ──
  const ccLeg = findClosestByDelta(chainForExpiry, "call", 0.30);
  if (ccLeg) {
    const credit = ccLeg.mid;
    const be = lastPrice - credit; // effective cost basis reduction
    const pop = 1 - Math.abs(ccLeg.delta);
    const maxProfit = (ccLeg.strike - lastPrice + credit) * 100;
    const maxLoss = (lastPrice - credit) * 100; // stock goes to zero
    const bp = lastPrice * 100; // cost of 100 shares
    const shortLeg = { ...ccLeg, position: "short" };
    const pnlCurve = generatePnlCurve("Covered Call", [shortLeg], credit, lastPrice);
    const scores = scoreStrategy("Covered Call", [ccLeg], credit, maxLoss, pop, regime);
    const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
    strategies.push({
      name: "Covered Call", legs: [shortLeg],
      netCredit: parseFloat(credit.toFixed(2)), maxProfit: parseFloat(maxProfit.toFixed(2)),
      maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
      pop: parseFloat(pop.toFixed(4)),
      delta: parseFloat(ccLeg.delta.toFixed(4)),
      gamma: parseFloat(ccLeg.gamma.toFixed(6)),
      theta: parseFloat(ccLeg.theta.toFixed(4)),
      vega: parseFloat(ccLeg.vega.toFixed(4)),
      rho: parseFloat(ccLeg.rho.toFixed(4)),
      breakevens: [parseFloat(be.toFixed(2))],
      scores, compositeScore: parseFloat(composite.toFixed(2)),
      rank: 0, rationale: buildRationale("Covered Call", scores, regime, [be]), pnlCurve,
    });
  }

  // ── 13. Butterfly Spread (call butterfly: buy 1 lower, sell 2 ATM, buy 1 higher) ──
  const bfAtm = findClosestByDelta(chainForExpiry, "call", 0.50);
  if (bfAtm) {
    const strikeStep = lastPrice * 0.005;
    const wingW = Math.max(strikeStep * 4, Math.round(lastPrice * 0.04 / 5) * 5);
    const bfLower = chainForExpiry
      .filter(l => l.type === "call" && l.strike < bfAtm.strike)
      .sort((a, b) => Math.abs(a.strike - (bfAtm.strike - wingW)) - Math.abs(b.strike - (bfAtm.strike - wingW)))[0];
    const bfUpper = chainForExpiry
      .filter(l => l.type === "call" && l.strike > bfAtm.strike)
      .sort((a, b) => Math.abs(a.strike - (bfAtm.strike + wingW)) - Math.abs(b.strike - (bfAtm.strike + wingW)))[0];
    if (bfLower && bfUpper) {
      const debit = bfLower.mid - 2 * bfAtm.mid + bfUpper.mid;
      if (debit > 0.01) {
        const maxProfit = (bfAtm.strike - bfLower.strike - debit) * 100;
        const maxLoss = debit * 100;
        const beLow = bfLower.strike + debit;
        const beHigh = bfUpper.strike - debit;
        const pop = 0.35; // butterfly POP is typically 30-40%
        const bp = maxLoss;
        const longLower = { ...bfLower, position: "long" };
        const shortAtm1 = { ...bfAtm, position: "short" };
        const shortAtm2 = { ...bfAtm, position: "short" };
        const longUpper = { ...bfUpper, position: "long" };
        const pnlCurve = generatePnlCurve("Butterfly Spread", [longLower, shortAtm1, shortAtm2, longUpper], -debit, lastPrice);
        const scores = scoreStrategy("Butterfly Spread", [bfLower, bfAtm, bfUpper], -debit, maxLoss, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        strategies.push({
          name: "Butterfly Spread", legs: [longLower, shortAtm1, shortAtm2, longUpper],
          netCredit: parseFloat((-debit).toFixed(2)), maxProfit: parseFloat(maxProfit.toFixed(2)),
          maxLoss: parseFloat(maxLoss.toFixed(2)), buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((bfLower.delta - 2 * bfAtm.delta + bfUpper.delta).toFixed(4)),
          gamma: parseFloat((bfLower.gamma - 2 * bfAtm.gamma + bfUpper.gamma).toFixed(6)),
          theta: parseFloat((bfLower.theta - 2 * bfAtm.theta + bfUpper.theta).toFixed(4)),
          vega: parseFloat((bfLower.vega - 2 * bfAtm.vega + bfUpper.vega).toFixed(4)),
          rho: parseFloat((bfLower.rho - 2 * bfAtm.rho + bfUpper.rho).toFixed(4)),
          breakevens: [parseFloat(beLow.toFixed(2)), parseFloat(beHigh.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0, rationale: buildRationale("Butterfly Spread", scores, regime, [bfAtm.strike]), pnlCurve,
        });
      }
    }
  }

  // ── 14. Jade Lizard (short put + short call spread) ──
  // Structure: sell OTM put (16-22 delta) + sell OTM call spread (short call + long call above)
  // Key property: if total credit > call spread width → ZERO upside risk
  const jlPut = findClosestByDelta(chainForExpiry, "put", 0.20);
  const jlShortCall = findClosestByDelta(chainForExpiry, "call", 0.20);
  if (jlPut && jlShortCall) {
    const strikeStep = lastPrice * 0.005;
    const callSpreadWidth = Math.max(strikeStep * 3, Math.round(lastPrice * 0.03 / 5) * 5);
    const jlLongCall = findWing(chainForExpiry, "call", jlShortCall.strike, callSpreadWidth);
    if (jlLongCall) {
      const callSpreadCredit = jlShortCall.mid - jlLongCall.mid;
      const putCredit = jlPut.mid;
      const totalCredit = putCredit + callSpreadCredit;
      const actualCallWidth = jlLongCall.strike - jlShortCall.strike;
      // Zero upside risk condition: totalCredit >= callSpreadWidth
      const hasZeroUpsideRisk = totalCredit >= actualCallWidth;
      if (totalCredit > 0.01) {
        const beLow = jlPut.strike - totalCredit;
        // Max loss: put side only (call side is fully hedged if zero upside risk)
        const putMaxLoss = jlPut.strike * 100; // put goes to zero
        const callSideMaxLoss = hasZeroUpsideRisk ? 0 : (actualCallWidth - callSpreadCredit) * 100;
        const maxLoss = putMaxLoss; // dominated by put side
        const bp = Math.min(jlPut.strike * 100 * 0.20, accountSize);
        const pop = (1 - Math.abs(jlPut.delta) + 1 - Math.abs(jlShortCall.delta)) / 2;
        const shortPutL = { ...jlPut, position: "short" };
        const shortCallL = { ...jlShortCall, position: "short" };
        const longCallL = { ...jlLongCall, position: "long" };
        const pnlCurve = generatePnlCurve("Jade Lizard", [shortPutL, shortCallL, longCallL], totalCredit, lastPrice);
        const scores = scoreStrategy("Jade Lizard", [jlPut, jlShortCall, jlLongCall], totalCredit, maxLoss, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        const zeroRiskNote = hasZeroUpsideRisk ? " ZERO upside risk (credit > spread width)." : " Upside risk capped at call spread width.";
        strategies.push({
          name: "Jade Lizard", legs: [shortPutL, shortCallL, longCallL],
          netCredit: parseFloat(totalCredit.toFixed(2)),
          maxProfit: parseFloat((totalCredit * 100).toFixed(2)),
          maxLoss: parseFloat(maxLoss.toFixed(2)),
          buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((jlPut.delta + jlShortCall.delta + jlLongCall.delta).toFixed(4)),
          gamma: parseFloat((jlPut.gamma + jlShortCall.gamma + jlLongCall.gamma).toFixed(6)),
          theta: parseFloat((jlPut.theta + jlShortCall.theta + jlLongCall.theta).toFixed(4)),
          vega: parseFloat((jlPut.vega + jlShortCall.vega + jlLongCall.vega).toFixed(4)),
          rho: parseFloat((jlPut.rho + jlShortCall.rho + jlLongCall.rho).toFixed(4)),
          breakevens: [parseFloat(beLow.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0,
          rationale: `Short put @ ${jlPut.strike} + short call spread ${jlShortCall.strike}/${jlLongCall.strike}. Total credit $${totalCredit.toFixed(2)}.${zeroRiskNote} Breakeven at ${beLow.toFixed(2)}. Composite score ${composite.toFixed(1)}/100.`,
          pnlCurve,
        });
      }
    }
  }

  // ── 15. Broken Wing Butterfly (BWB) — skewed short butterfly for net credit ──
  // Structure: long 1 OTM put, short 2 lower puts, long 1 even-lower put (skipped strike)
  // Net credit because the long wing is further OTM than the short wing width implies
  // Key property: generates a net credit; zero upside risk; max profit if price pins at short strikes
  const bwbShortPut = findClosestByDelta(chainForExpiry, "put", 0.30);
  if (bwbShortPut) {
    const strikeStep = lastPrice * 0.005;
    const innerWidth = Math.max(strikeStep * 3, Math.round(lastPrice * 0.03 / 5) * 5);
    const outerWidth = innerWidth * 2; // skipped strike — outer wing is 2x the inner width
    // Long put above short puts (closer to ATM)
    const bwbLongPutUpper = chainForExpiry
      .filter(l => l.type === "put" && l.strike > bwbShortPut.strike)
      .sort((a, b) => Math.abs(a.strike - (bwbShortPut.strike + innerWidth)) - Math.abs(b.strike - (bwbShortPut.strike + innerWidth)))[0];
    // Long put below short puts (further OTM — the skipped wing)
    const bwbLongPutLower = chainForExpiry
      .filter(l => l.type === "put" && l.strike < bwbShortPut.strike)
      .sort((a, b) => Math.abs(a.strike - (bwbShortPut.strike - outerWidth)) - Math.abs(b.strike - (bwbShortPut.strike - outerWidth)))[0];
    if (bwbLongPutUpper && bwbLongPutLower && bwbLongPutUpper.strike !== bwbShortPut.strike && bwbLongPutLower.strike !== bwbShortPut.strike) {
      // Net credit = 2 × short put mid - long upper mid - long lower mid
      const credit = 2 * bwbShortPut.mid - bwbLongPutUpper.mid - bwbLongPutLower.mid;
      if (credit > 0.01) {
        // Max profit: if price pins at short put strike at expiry
        const upperWidth = bwbLongPutUpper.strike - bwbShortPut.strike;
        const lowerWidth = bwbShortPut.strike - bwbLongPutLower.strike;
        const maxProfit = (upperWidth + credit) * 100;
        // Max loss: the wider lower wing minus credit received
        const maxLoss = Math.max(0, (lowerWidth - upperWidth - credit)) * 100;
        const beLow = bwbLongPutLower.strike + (lowerWidth - upperWidth - credit);
        const beHigh = bwbLongPutUpper.strike + credit; // above this, keep full credit
        const pop = (1 - Math.abs(bwbShortPut.delta));
        const bp = maxLoss > 0 ? maxLoss : upperWidth * 100;
        const longUpperL = { ...bwbLongPutUpper, position: "long" };
        const shortPut1 = { ...bwbShortPut, position: "short" };
        const shortPut2 = { ...bwbShortPut, position: "short" };
        const longLowerL = { ...bwbLongPutLower, position: "long" };
        const pnlCurve = generatePnlCurve("Broken Wing Butterfly", [longUpperL, shortPut1, shortPut2, longLowerL], credit, lastPrice);
        const scores = scoreStrategy("Broken Wing Butterfly", [bwbLongPutUpper, bwbShortPut, bwbLongPutLower], credit, maxLoss > 0 ? maxLoss : null, pop, regime);
        const composite = Math.min(100, Object.values(scores).reduce((a, b) => a + b, 0));
        strategies.push({
          name: "Broken Wing Butterfly", legs: [longUpperL, shortPut1, shortPut2, longLowerL],
          netCredit: parseFloat(credit.toFixed(2)),
          maxProfit: parseFloat(maxProfit.toFixed(2)),
          maxLoss: maxLoss > 0 ? parseFloat(maxLoss.toFixed(2)) : null,
          buyingPower: parseFloat(bp.toFixed(2)),
          pop: parseFloat(pop.toFixed(4)),
          delta: parseFloat((bwbLongPutUpper.delta - 2 * bwbShortPut.delta + bwbLongPutLower.delta).toFixed(4)),
          gamma: parseFloat((bwbLongPutUpper.gamma - 2 * bwbShortPut.gamma + bwbLongPutLower.gamma).toFixed(6)),
          theta: parseFloat((bwbLongPutUpper.theta - 2 * bwbShortPut.theta + bwbLongPutLower.theta).toFixed(4)),
          vega: parseFloat((bwbLongPutUpper.vega - 2 * bwbShortPut.vega + bwbLongPutLower.vega).toFixed(4)),
          rho: parseFloat((bwbLongPutUpper.rho - 2 * bwbShortPut.rho + bwbLongPutLower.rho).toFixed(4)),
          breakevens: [parseFloat(beLow.toFixed(2)), parseFloat(beHigh.toFixed(2))],
          scores, compositeScore: parseFloat(composite.toFixed(2)),
          rank: 0,
          rationale: `Long ${bwbLongPutUpper.strike}P / Short 2× ${bwbShortPut.strike}P / Long ${bwbLongPutLower.strike}P. Net credit $${credit.toFixed(2)}. Zero upside risk. Max profit if price pins at ${bwbShortPut.strike}. Composite score ${composite.toFixed(1)}/100.`,
          pnlCurve,
        });
      }
    }
  }

  // ── Apply strategy category filter ──
  const CREDIT_STRATEGIES = new Set([
    "Naked Put", "Naked Call", "Short Strangle", "Iron Condor",
    "Bull Put Spread", "Bear Call Spread", "Cash-Secured Put", "Covered Call",
    "Jade Lizard", "Broken Wing Butterfly",
  ]);
  const DEBIT_STRATEGIES = new Set([
    "Bull Call Spread", "Bear Put Spread", "Long Straddle", "Long Strangle", "Butterfly Spread",
  ]);
  const categoryFiltered = strategyCategory === "credit"
    ? strategies.filter(s => CREDIT_STRATEGIES.has(s.name))
    : strategyCategory === "debit"
      ? strategies.filter(s => DEBIT_STRATEGIES.has(s.name))
      : strategies;

  // ── Apply minimum credit filter ──
  const filteredStrategies = minCredit && minCredit > 0
    ? categoryFiltered.filter(s => s.netCredit >= minCredit)
    : categoryFiltered;

  // ── Rank strategies ──
  const sorted = [...filteredStrategies].sort((a, b) => b.compositeScore - a.compositeScore);
  sorted.forEach((s, i) => { s.rank = i + 1; });

  // Assign ranks back to original array (only ranked strategies)
  for (const s of filteredStrategies) {
    s.rank = sorted.findIndex(r => r.name === s.name) + 1;
  }

  const recommendation = sorted[0] ?? filteredStrategies[0] ?? strategies[0];

  // ── Expected Move (±1σ to expiry) ──
  // Formula: lastPrice × medianIV × sqrt(dte / 365)
  const expectedMove = regime.lastPrice * regime.medianIV * Math.sqrt(dte / 365);
  const expectedMovePct = (expectedMove / regime.lastPrice) * 100;

  return {
    ticker: ticker.toUpperCase(),
    analysisDate,
    targetDte,
    accountSize,
    expiryUsed,
    dte,
    regime,
    strategies: filteredStrategies,
    recommendation,
    priceHistory,
    optionChain: chainForExpiry,
    expectedMove,
    expectedMovePct,
    earningsInfo: earningsInfo ?? null,
  };
}
