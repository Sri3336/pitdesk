/**
 * Trading Agent Engine
 *
 * Scans a user's watchlist, runs the existing options analysis for each ticker,
 * filters to credit spread strategies only (Bull Put Spread, Bear Call Spread,
 * Iron Condor), selects the best-scoring one per ticker, calculates specific
 * strikes/expiry/quantity, and saves trade proposals to the database.
 *
 * Position sizing: max 5% of account per trade (based on max loss / BP required).
 */

import { callDataApi } from "./_core/dataApi";
import { runAnalysis, type PriceBar, type OptionLeg } from "./analysisEngine";
import { getDb } from "./db";
import { agentRuns, tradeProposals, watchlist } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Constants ─────────────────────────────────────────────────────────────────

const CREDIT_SPREAD_STRATEGIES = ["Bull Put Spread", "Bear Call Spread", "Iron Condor"] as const;
type CreditSpreadStrategy = (typeof CREDIT_SPREAD_STRATEGIES)[number];

const MAX_RISK_PCT = 0.05; // 5% of account per trade
const DEFAULT_TARGET_DTE = 30;
const DEFAULT_ACCOUNT_SIZE = 25000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProposedLeg {
  action: "BUY" | "SELL";
  putCall: "PUT" | "CALL";
  strike: number;
  expiry: string; // YYYY-MM-DD
  occSymbol?: string;
}

export interface TradeProposalData {
  ticker: string;
  strategy: CreditSpreadStrategy;
  legs: ProposedLeg[];
  underlyingPrice: number;
  netCredit: number;      // per share
  maxProfit: number;      // per share
  maxLoss: number;        // per share (positive number)
  breakeven: number;
  pop: number;            // 0-1
  contracts: number;
  bpRequired: number;     // total buying power required
  compositeScore: number;
  expiryDate: Date;
  targetDte: number;
}

// ── Normal distribution CDF (for PoP calculation) ────────────────────────────

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp(-0.5 * x * x);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

function blackScholesDelta(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"): number {
  if (T <= 0) return type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return type === "call" ? normCdf(d1) : normCdf(d1) - 1;
}

function blackScholesPrice(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"): number {
  if (T <= 0) return Math.max(0, type === "call" ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === "call") {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

// ── Find nearest expiry to target DTE ────────────────────────────────────────

function getNearestExpiry(targetDte: number): { date: Date; dte: number } {
  const today = new Date();
  // Find the nearest Friday that is approximately targetDte days out
  const target = new Date(today.getTime() + targetDte * 24 * 60 * 60 * 1000);
  // Round to nearest Friday
  const dayOfWeek = target.getDay(); // 0=Sun, 5=Fri
  const daysToFriday = (5 - dayOfWeek + 7) % 7;
  const expiry = new Date(target.getTime() + daysToFriday * 24 * 60 * 60 * 1000);
  const dte = Math.round((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return { date: expiry, dte };
}

// ── Strike selection ──────────────────────────────────────────────────────────
// Target ~0.30 delta for short strike, 1-2 strikes OTM for long strike
// Width: $5 for stocks under $100, $10 for $100-$500, $20 for $500+

function getSpreadWidth(price: number): number {
  if (price < 100) return 5;
  if (price < 500) return 10;
  return 20;
}

function roundToStrike(price: number, width: number): number {
  return Math.round(price / width) * width;
}

function buildBullPutSpread(
  S: number, iv: number, T: number, r = 0.05
): { shortPut: number; longPut: number; netCredit: number; maxLoss: number; breakeven: number; pop: number } {
  const width = getSpreadWidth(S);
  // Short put: ~0.30 delta → find strike where delta ≈ -0.30
  // Approximate: short put strike ≈ S * exp(-0.5 * iv^2 * T - 0.52 * iv * sqrt(T))
  const shortPutApprox = S * Math.exp(-0.5 * iv * iv * T - 0.52 * iv * Math.sqrt(T));
  const shortPut = roundToStrike(shortPutApprox, width);
  const longPut = shortPut - width;

  const shortPremium = blackScholesPrice(S, shortPut, T, r, iv, "put");
  const longPremium = blackScholesPrice(S, longPut, T, r, iv, "put");
  const netCredit = Math.max(0.01, shortPremium - longPremium);
  const maxLoss = width - netCredit;
  const breakeven = shortPut - netCredit;
  const pop = 1 - normCdf((Math.log(S / breakeven) + (r - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T)));

  return { shortPut, longPut, netCredit, maxLoss, breakeven, pop };
}

function buildBearCallSpread(
  S: number, iv: number, T: number, r = 0.05
): { shortCall: number; longCall: number; netCredit: number; maxLoss: number; breakeven: number; pop: number } {
  const width = getSpreadWidth(S);
  const shortCallApprox = S * Math.exp(0.5 * iv * iv * T + 0.52 * iv * Math.sqrt(T));
  const shortCall = roundToStrike(shortCallApprox, width);
  const longCall = shortCall + width;

  const shortPremium = blackScholesPrice(S, shortCall, T, r, iv, "call");
  const longPremium = blackScholesPrice(S, longCall, T, r, iv, "call");
  const netCredit = Math.max(0.01, shortPremium - longPremium);
  const maxLoss = width - netCredit;
  const breakeven = shortCall + netCredit;
  const pop = normCdf((Math.log(S / breakeven) + (r - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T)));

  return { shortCall, longCall, netCredit, maxLoss, breakeven, pop };
}

function buildIronCondor(
  S: number, iv: number, T: number, r = 0.05
): {
  shortPut: number; longPut: number; shortCall: number; longCall: number;
  netCredit: number; maxLoss: number; breakevenLow: number; breakevenHigh: number; pop: number;
} {
  const put = buildBullPutSpread(S, iv, T, r);
  const call = buildBearCallSpread(S, iv, T, r);
  const netCredit = put.netCredit + call.netCredit;
  const width = getSpreadWidth(S);
  const maxLoss = width - netCredit;
  const pop = put.pop * call.pop; // approximate combined PoP

  return {
    shortPut: put.shortPut,
    longPut: put.longPut,
    shortCall: call.shortCall,
    longCall: call.longCall,
    netCredit,
    maxLoss,
    breakevenLow: put.breakeven,
    breakevenHigh: call.breakeven,
    pop,
  };
}

// ── Contract quantity based on max 5% account risk ───────────────────────────

function calcContracts(accountSize: number, maxLossPerShare: number, maxRiskPct = MAX_RISK_PCT): number {
  const maxDollarRisk = accountSize * maxRiskPct;
  const maxLossPerContract = maxLossPerShare * 100;
  return Math.max(1, Math.floor(maxDollarRisk / maxLossPerContract));
}

// ── Fetch price history (mirrors routers.ts fetchPriceHistory) ───────────────

async function fetchPriceHistory(symbol: string): Promise<PriceBar[]> {
  const res: any = await callDataApi("YahooFinance/get_stock_chart", {
    query: {
      symbol,
      region: "US",
      interval: "1d",
      range: "1y",
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
    const d = new Date(timestamp[i] * 1000);
    bars.push({
      date: d.toISOString().split("T")[0],
      open: quote.open[i] ?? quote.close[i],
      high: quote.high[i] ?? quote.close[i],
      low: quote.low[i] ?? quote.close[i],
      close: quote.close[i],
      volume: quote.volume[i] ?? 0,
    });
  }
  return bars;
}

// ── Build synthetic option chain (mirrors routers.ts) ────────────────────────

function buildSyntheticOptionChainAgent(
  lastPrice: number,
  rv20: number,
  targetDte: number
): OptionLeg[] {
  const r = 0.045;
  const dte = Math.max(targetDte, 1);
  const T = dte / 365;
  const atmIV = rv20 * 1.2;
  const erf = (x: number) => {
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    const sign=x<0?-1:1; const ax=Math.abs(x);
    const t=1/(1+p*ax);
    return sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax));
  };
  const normCdfL = (x: number) => 0.5*(1+erf(x/Math.SQRT2));
  const normPdfL = (x: number) => Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);
  const bsPrice = (S: number, K: number, sigma: number, type: "call"|"put") => {
    if (T<=0) return Math.max(0, type==="call"?S-K:K-S);
    const sqrtT=Math.sqrt(T);
    const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*sqrtT);
    const d2=d1-sigma*sqrtT;
    if (type==="call") return S*normCdfL(d1)-K*Math.exp(-r*T)*normCdfL(d2);
    return K*Math.exp(-r*T)*normCdfL(-d2)-S*normCdfL(-d1);
  };
  const bsGreeks = (S: number, K: number, sigma: number, type: "call"|"put") => {
    if (T<=0) return { delta: type==="call"?(S>K?1:0):(S<K?-1:0), gamma:0, theta:0, vega:0, rho:0 };
    const sqrtT=Math.sqrt(T);
    const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*sqrtT);
    const d2=d1-sigma*sqrtT;
    const nd1=normPdfL(d1);
    const Nd2=normCdfL(d2);
    const delta = type==="call"?normCdfL(d1):normCdfL(d1)-1;
    const gamma = nd1/(S*sigma*sqrtT);
    const theta = (-(S*nd1*sigma)/(2*sqrtT)-r*K*Math.exp(-r*T)*(type==="call"?Nd2:normCdfL(-d2)))/365;
    const vega = S*nd1*sqrtT/100;
    const rho = type==="call"?K*T*Math.exp(-r*T)*Nd2/100:-K*T*Math.exp(-r*T)*normCdfL(-d2)/100;
    return { delta, gamma, theta, vega, rho };
  };
  const sqrtT = Math.sqrt(T);
  const lnSK_20d = 0.842 * atmIV * sqrtT - (r + 0.5 * atmIV * atmIV) * T;
  const requiredHalfRange = lastPrice * (Math.exp(Math.abs(lnSK_20d)) - 1) * 1.6;
  const strikeStep = Math.max(0.5, lastPrice * 0.005);
  const numStrikes = Math.max(60, Math.ceil(requiredHalfRange / strikeStep) + 5);
  const legs: OptionLeg[] = [];
  for (let i = -numStrikes; i <= numStrikes; i++) {
    const K = Math.round((lastPrice + i * strikeStep) * 100) / 100;
    if (K <= 0) continue;
    const moneyness = Math.log(K / lastPrice);
    const skew = moneyness < 0 ? -moneyness * 0.3 : moneyness * 0.1;
    const iv = Math.max(0.05, atmIV + skew);
    for (const type of ["call", "put"] as const) {
      const mid = bsPrice(lastPrice, K, iv, type);
      const spread = Math.max(0.01, mid * 0.04);
      const bid = Math.max(0.01, mid - spread / 2);
      const ask = mid + spread / 2;
      const greeks = bsGreeks(lastPrice, K, iv, type);
      const oi = Math.round(Math.max(100, 5000 * Math.exp(-Math.abs(moneyness) * 10)));
      legs.push({
        strike: K,
        expiry: new Date(Date.now() + dte * 86400000).toISOString().split("T")[0],
        type,
        bid: Math.round(bid * 100) / 100,
        ask: Math.round(ask * 100) / 100,
        mid: Math.round(mid * 100) / 100,
        iv,
        delta: Math.round(greeks.delta * 10000) / 10000,
        gamma: Math.round(greeks.gamma * 10000) / 10000,
        theta: Math.round(greeks.theta * 10000) / 10000,
        vega: Math.round(greeks.vega * 10000) / 10000,
        rho: Math.round(greeks.rho * 10000) / 10000,
        openInterest: oi,
        volume: Math.round(oi * 0.1),
        dte,
      });
    }
  }
  return legs;
}

// ── Main agent function ───────────────────────────────────────────────────────

export async function runTradingAgent(
  userId: number,
  triggeredBy: "schedule" | "manual",
  accountSize = DEFAULT_ACCOUNT_SIZE,
  targetDte = DEFAULT_TARGET_DTE
): Promise<{ agentRunId: number; proposals: TradeProposalData[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Create agent run record
  const [runInsert] = await db.insert(agentRuns).values({
    userId,
    triggeredBy,
    status: "running",
    tickersScanned: null,
    proposalsGenerated: 0,
  });
  const agentRunId = (runInsert as any).insertId as number;

  const proposals: TradeProposalData[] = [];
  const errors: string[] = [];

  try {
    // Get user's watchlist
    const watchlistItems = await db
      .select()
      .from(watchlist)
      .where(eq(watchlist.userId, userId));

    if (watchlistItems.length === 0) {
      await db.update(agentRuns)
        .set({ status: "completed", tickersScanned: "[]", proposalsGenerated: 0, completedAt: new Date() })
        .where(eq(agentRuns.id, agentRunId));
      return { agentRunId, proposals: [] };
    }

    const tickers = watchlistItems.map(w => w.ticker);

    // Analyze each ticker
    for (const ticker of tickers) {
      try {
        // Fetch price history and build option chain (same as main analyzer)
        const priceHistory = await fetchPriceHistory(ticker);
        if (priceHistory.length < 20) {
          errors.push(`${ticker}: insufficient price history`);
          continue;
        }
        const closes = priceHistory.map(b => b.close);
        const S = closes[closes.length - 1];
        const n20 = Math.min(20, closes.length - 1);
        let sumSq = 0;
        for (let i = closes.length - n20; i < closes.length; i++) {
          const ret = Math.log(closes[i] / closes[i - 1]);
          sumSq += ret * ret;
        }
        const rv20 = Math.sqrt((sumSq / n20) * 252);
        const optionChain = buildSyntheticOptionChainAgent(S, rv20, targetDte);

        // Run full analysis to get composite score and directional bias
        const analysisResult = runAnalysis(ticker, targetDte, accountSize, priceHistory, optionChain, undefined, "credit");

        // Filter to credit spread strategies only
        const creditSpreadResults = analysisResult.strategies?.filter(
          (s: any) => CREDIT_SPREAD_STRATEGIES.includes(s.name)
        );

        if (!creditSpreadResults || creditSpreadResults.length === 0) {
          continue;
        }

        // Pick the highest-scoring credit spread
        const best = creditSpreadResults.reduce((a: any, b: any) =>
          ((b.compositeScore as number) ?? 0) > ((a.compositeScore as number) ?? 0) ? b : a
        );

        const strategyName = best.name as CreditSpreadStrategy;
        const compositeScore = (best.compositeScore as number) ?? 0;

        // Only propose if score is meaningful (>= 5.0 out of 10)
        if (compositeScore < 5.0) continue;

        const { date: expiryDate, dte: actualDte } = getNearestExpiry(targetDte);
        const T = actualDte / 365;

        let legs: ProposedLeg[] = [];
        let netCredit = 0;
        let maxLoss = 0;
        let breakeven = 0;
        let pop = 0;

        const expiryStr = expiryDate.toISOString().split("T")[0];

        if (strategyName === "Bull Put Spread") {
          const spread = buildBullPutSpread(S, rv20 * 1.2, T);
          legs = [
            { action: "SELL", putCall: "PUT", strike: spread.shortPut, expiry: expiryStr },
            { action: "BUY", putCall: "PUT", strike: spread.longPut, expiry: expiryStr },
          ];
          netCredit = spread.netCredit;
          maxLoss = spread.maxLoss;
          breakeven = spread.breakeven;
          pop = spread.pop;
        } else if (strategyName === "Bear Call Spread") {
          const spread = buildBearCallSpread(S, rv20 * 1.2, T);
          legs = [
            { action: "SELL", putCall: "CALL", strike: spread.shortCall, expiry: expiryStr },
            { action: "BUY", putCall: "CALL", strike: spread.longCall, expiry: expiryStr },
          ];
          netCredit = spread.netCredit;
          maxLoss = spread.maxLoss;
          breakeven = spread.breakeven;
          pop = spread.pop;
        } else if (strategyName === "Iron Condor") {
          const condor = buildIronCondor(S, rv20 * 1.2, T);
          legs = [
            { action: "SELL", putCall: "PUT", strike: condor.shortPut, expiry: expiryStr },
            { action: "BUY", putCall: "PUT", strike: condor.longPut, expiry: expiryStr },
            { action: "SELL", putCall: "CALL", strike: condor.shortCall, expiry: expiryStr },
            { action: "BUY", putCall: "CALL", strike: condor.longCall, expiry: expiryStr },
          ];
          netCredit = condor.netCredit;
          maxLoss = condor.maxLoss;
          breakeven = condor.breakevenLow; // use lower breakeven for display
          pop = condor.pop;
        }

        const contracts = calcContracts(accountSize, maxLoss);
        const bpRequired = maxLoss * 100 * contracts;
        const maxProfit = netCredit * 100 * contracts;

        const proposal: TradeProposalData = {
          ticker,
          strategy: strategyName,
          legs,
          underlyingPrice: S,
          netCredit,
          maxProfit: netCredit, // per share
          maxLoss,
          breakeven,
          pop,
          contracts,
          bpRequired,
          compositeScore,
          expiryDate,
          targetDte: actualDte,
        };

        proposals.push(proposal);

        // Save to database
        await db.insert(tradeProposals).values({
          agentRunId,
          userId,
          ticker,
          strategy: strategyName,
          legsJson: JSON.stringify(legs),
          underlyingPrice: S.toFixed(4),
          netCredit: netCredit.toFixed(4),
          maxProfit: netCredit.toFixed(4),
          maxLoss: maxLoss.toFixed(4),
          breakeven: breakeven.toFixed(4),
          pop: pop.toFixed(4),
          contracts,
          bpRequired: bpRequired.toFixed(2),
          compositeScore: compositeScore.toFixed(2),
          expiryDate,
          targetDte: actualDte,
          status: "pending",
        });
      } catch (err) {
        errors.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Update agent run as completed
    await db.update(agentRuns)
      .set({
        status: "completed",
        tickersScanned: JSON.stringify(tickers),
        proposalsGenerated: proposals.length,
        completedAt: new Date(),
        errorMessage: errors.length > 0 ? errors.join("; ") : null,
      })
      .where(eq(agentRuns.id, agentRunId));

  } catch (err) {
    await db.update(agentRuns)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, agentRunId));
    throw err;
  }

  return { agentRunId, proposals };
}
