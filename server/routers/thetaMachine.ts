/**
 * Theta Machine — Calendar Spread & Iron Butterfly Builder
 *
 * Strategy by Ravish: "Act like the casino — sell time decay."
 * Core concept: Buy a longer-dated option + sell a shorter-dated option at the
 * same strike. The short leg decays faster → profit from the differential.
 *
 * Modes:
 *   1. Bullish Calendar  — call spread, strike above market (20–30 delta)
 *   2. Neutral Calendar  — call/put spread, strike at-the-money
 *   3. Bearish Calendar  — put spread, strike below market (20–30 delta)
 *   4. Earnings Iron Butterfly — sell ATM call + ATM put, buy wings for protection
 *
 * Rules:
 *   - Short leg: 1–2 weeks out | Long leg: 3–4 weeks out
 *   - Target delta 20–30 for directional setups
 *   - Exit at 30–50% profit — never hold to expiry
 *   - Close entire spread before short leg expires
 *   - Max loss = net debit paid (defined risk)
 */
import { z } from "zod";

// ─── IV Rank lookup (52-week IV ranges per ticker) ────────────────────────────
// These are annualised decimal IV ranges calibrated from historical options data.
// IVR = (currentIV - ivLow) / (ivHigh - ivLow) * 100
const THETA_IV_RANGES: Record<string, { ivLow: number; ivHigh: number }> = {
  SNDK:  { ivLow: 0.70, ivHigh: 1.20 },
  WDC:   { ivLow: 0.80, ivHigh: 1.00 },
  MU:    { ivLow: 0.55, ivHigh: 0.90 },
  NVDA:  { ivLow: 0.60, ivHigh: 0.90 },
  ASML:  { ivLow: 0.40, ivHigh: 0.70 },
  AMD:   { ivLow: 0.55, ivHigh: 0.85 },
  APP:   { ivLow: 0.60, ivHigh: 1.00 },
  META:  { ivLow: 0.50, ivHigh: 0.80 },
  GOOGL: { ivLow: 0.35, ivHigh: 0.65 },
  MSFT:  { ivLow: 0.30, ivHigh: 0.55 },
  AAPL:  { ivLow: 0.25, ivHigh: 0.50 },
  AMZN:  { ivLow: 0.30, ivHigh: 0.55 },
  TSLA:  { ivLow: 0.80, ivHigh: 1.20 },
  PLTR:  { ivLow: 0.70, ivHigh: 1.10 },
  SOFI:  { ivLow: 0.65, ivHigh: 1.05 },
  INTC:  { ivLow: 0.40, ivHigh: 0.80 },
  HOOD:  { ivLow: 0.70, ivHigh: 1.20 },
  IONQ:  { ivLow: 0.90, ivHigh: 1.50 },
  RGTI:  { ivLow: 0.90, ivHigh: 1.60 },
  RKLB:  { ivLow: 0.80, ivHigh: 1.30 },
  SPY:   { ivLow: 0.12, ivHigh: 0.30 },
  QQQ:   { ivLow: 0.15, ivHigh: 0.35 },
  MSTR:  { ivLow: 0.80, ivHigh: 1.50 },
  JPM:   { ivLow: 0.25, ivHigh: 0.50 },
  GS:    { ivLow: 0.30, ivHigh: 0.55 },
  NBIS:  { ivLow: 0.70, ivHigh: 1.30 },
  LLY:   { ivLow: 0.35, ivHigh: 0.65 },
  XOM:   { ivLow: 0.25, ivHigh: 0.50 },
  NFLX:  { ivLow: 0.40, ivHigh: 0.75 },
};

function computeIvRankForTicker(ticker: string, currentIV: number): number {
  const range = THETA_IV_RANGES[ticker.toUpperCase()];
  if (!range || range.ivHigh <= range.ivLow) {
    // Fallback: use a generic range of 0.15–1.20 for unknown tickers
    const fallbackLow = 0.15, fallbackHigh = 1.20;
    const rank = ((currentIV - fallbackLow) / (fallbackHigh - fallbackLow)) * 100;
    return Math.max(0, Math.min(100, Math.round(rank)));
  }
  const rank = ((currentIV - range.ivLow) / (range.ivHigh - range.ivLow)) * 100;
  return Math.max(0, Math.min(100, Math.round(rank)));
}
import { router, protectedProcedure } from "../_core/trpc";
import {
  getTradierQuote,
  getTradierExpirations,
  getTradierOptionsChain,
} from "../tradierClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarLeg {
  expiration: string;
  strike: number;
  optionType: "call" | "put";
  bid: number;
  ask: number;
  mid: number;
  delta: number | null;
  theta: number | null;
  iv: number | null;
  dte: number;
}

export interface CalendarSpread {
  ticker: string;
  currentPrice: number;
  mode: "bullish" | "neutral" | "bearish";
  optionType: "call" | "put";
  strike: number;
  shortLeg: CalendarLeg;
  longLeg: CalendarLeg;
  netDebit: number;           // cost to enter (max loss)
  maxProfit: number;          // estimated peak profit at strike at short expiry
  profitTarget30: number;     // 30% of max profit
  profitTarget50: number;     // 50% of max profit
  thetaDifferential: number;  // long theta - short theta (daily decay advantage)
  vegaRisk: string;           // description of vega exposure
  breakevens: { lower: number; upper: number };
  recommendation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
}

export interface IronButterfly {
  ticker: string;
  currentPrice: number;
  expiration: string;
  dte: number;
  atmStrike: number;
  shortCall: CalendarLeg;
  shortPut: CalendarLeg;
  longCall: CalendarLeg;
  longPut: CalendarLeg;
  netCredit: number;
  maxLoss: number;
  breakevens: { lower: number; upper: number };
  profitZone: { lower: number; upper: number };
  recommendation: string;
  ivCrushEstimate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysToExpiry(expirationDate: string): number {
  const now = new Date();
  const exp = new Date(expirationDate + "T16:00:00-05:00");
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function midPrice(bid: number, ask: number): number {
  return Math.round(((bid + ask) / 2) * 100) / 100;
}

/**
 * Find the best strike for a calendar spread based on mode and target delta.
 * Bullish: find call strike with delta 20–30 (OTM call)
 * Neutral: find strike nearest to ATM
 * Bearish: find put strike with delta 20–30 (OTM put, delta will be negative)
 */
function findTargetStrike(
  contracts: { strike: number; greeks?: { delta: number } }[],
  mode: "bullish" | "neutral" | "bearish",
  currentPrice: number
): number {
  if (mode === "neutral") {
    // ATM: nearest strike to current price
    return contracts.reduce((prev, curr) =>
      Math.abs(curr.strike - currentPrice) < Math.abs(prev.strike - currentPrice) ? curr : prev
    ).strike;
  }

  if (mode === "bullish") {
    // OTM call: delta 20–30, strike above current price
    const otmCalls = contracts.filter(c => c.strike > currentPrice && c.greeks?.delta);
    if (otmCalls.length) {
      const target = otmCalls.reduce((best, curr) => {
        const d = Math.abs((curr.greeks?.delta ?? 0));
        const bestD = Math.abs((best.greeks?.delta ?? 0));
        const targetD = 0.25; // aim for 25 delta
        return Math.abs(d - targetD) < Math.abs(bestD - targetD) ? curr : best;
      });
      return target.strike;
    }
    // Fallback: ~5% OTM
    const strikes = contracts.map(c => c.strike).sort((a, b) => a - b);
    const target5pct = currentPrice * 1.05;
    return strikes.reduce((prev, curr) =>
      Math.abs(curr - target5pct) < Math.abs(prev - target5pct) ? curr : prev
    );
  }

  // Bearish: OTM put, delta ~-0.20 to -0.30
  const otmPuts = contracts.filter(c => c.strike < currentPrice && c.greeks?.delta);
  if (otmPuts.length) {
    const target = otmPuts.reduce((best, curr) => {
      const d = Math.abs((curr.greeks?.delta ?? 0));
      const bestD = Math.abs((best.greeks?.delta ?? 0));
      const targetD = 0.25;
      return Math.abs(d - targetD) < Math.abs(bestD - targetD) ? curr : best;
    });
    return target.strike;
  }
  // Fallback: ~5% OTM put
  const strikes = contracts.map(c => c.strike).sort((a, b) => a - b);
  const target5pct = currentPrice * 0.95;
  return strikes.reduce((prev, curr) =>
    Math.abs(curr - target5pct) < Math.abs(prev - target5pct) ? curr : prev
  );
}

/**
 * Estimate max profit for a calendar spread.
 * At expiry of the short leg, if stock = strike, the short leg expires worthless
 * and the long leg retains most of its value. Rough estimate: long leg mid × 0.7
 * (it loses some time value but retains intrinsic + remaining extrinsic).
 */
function estimateMaxProfit(longLegMid: number, netDebit: number): number {
  // Conservative: long leg retains ~70% of its value when short expires worthless
  const longLegResidual = longLegMid * 0.7;
  return Math.max(0, Math.round((longLegResidual - netDebit) * 100) / 100);
}

/**
 * Estimate calendar spread breakevens.
 * Approximation: the tent is roughly ±(netDebit × 3) around the strike.
 */
function estimateBreakevens(strike: number, netDebit: number): { lower: number; upper: number } {
  const halfWidth = netDebit * 3;
  return {
    lower: Math.round((strike - halfWidth) * 100) / 100,
    upper: Math.round((strike + halfWidth) * 100) / 100,
  };
}

/**
 * Like findTargetStrike but returns the full contract object (needed for scan).
 */
function findTargetDeltaContract(
  contracts: { strike: number; bid: number; ask: number; greeks?: { delta?: number; theta?: number; mid_iv?: number; vega?: number } }[],
  mode: "bullish" | "neutral" | "bearish",
  currentPrice: number
) {
  if (mode === "neutral") {
    return contracts.reduce((prev, curr) =>
      Math.abs(curr.strike - currentPrice) < Math.abs(prev.strike - currentPrice) ? curr : prev
    );
  }
  if (mode === "bullish") {
    const otm = contracts.filter(c => c.strike > currentPrice && c.greeks?.delta);
    if (otm.length) {
      return otm.reduce((best, curr) => {
        const d = Math.abs(curr.greeks?.delta ?? 0);
        const bd = Math.abs(best.greeks?.delta ?? 0);
        return Math.abs(d - 0.25) < Math.abs(bd - 0.25) ? curr : best;
      });
    }
    const t = currentPrice * 1.05;
    return contracts.reduce((prev, curr) => Math.abs(curr.strike - t) < Math.abs(prev.strike - t) ? curr : prev);
  }
  // bearish
  const otm = contracts.filter(c => c.strike < currentPrice && c.greeks?.delta);
  if (otm.length) {
    return otm.reduce((best, curr) => {
      const d = Math.abs(curr.greeks?.delta ?? 0);
      const bd = Math.abs(best.greeks?.delta ?? 0);
      return Math.abs(d - 0.25) < Math.abs(bd - 0.25) ? curr : best;
    });
  }
  const t = currentPrice * 0.95;
  return contracts.reduce((prev, curr) => Math.abs(curr.strike - t) < Math.abs(prev.strike - t) ? curr : prev);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const thetaMachineRouter = router({
  /**
   * Build a calendar spread for a given ticker and mode.
   * Returns both legs with full greeks, P&L profile, and recommendations.
   */
  buildCalendar: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).transform(s => s.toUpperCase()),
      mode: z.enum(["bullish", "neutral", "bearish"]),
      targetDelta: z.number().min(0.10).max(0.50).default(0.25),
    }))
    .query(async ({ input }) => {
      const { ticker, mode, targetDelta } = input;

      // 1. Get current price
      const quote = await getTradierQuote(ticker);
      if (!quote) throw new Error(`Could not fetch quote for ${ticker}`);
      const currentPrice = quote.last ?? quote.close ?? 0;
      if (!currentPrice) throw new Error(`No price data for ${ticker}`);

      // 2. Get expirations
      const expirations = await getTradierExpirations(ticker);
      if (expirations.length < 2) throw new Error(`Not enough expirations for ${ticker}`);

      // Filter to future expirations only
      const today = new Date().toISOString().slice(0, 10);
      const futureExps = expirations.filter(e => e > today);
      if (futureExps.length < 2) throw new Error(`Not enough future expirations for ${ticker}`);

      // Short leg: 1–2 weeks out (7–14 days)
      // Long leg: 3–4 weeks out (21–28 days)
      const shortExp = futureExps.find(e => daysToExpiry(e) >= 5 && daysToExpiry(e) <= 16)
        ?? futureExps[0];
      const longExp = futureExps.find(e => daysToExpiry(e) >= 17 && daysToExpiry(e) <= 35)
        ?? futureExps[1];

      if (shortExp === longExp) throw new Error(`Could not find two distinct expirations for ${ticker}`);

      // 3. Determine option type
      const optionType: "call" | "put" = mode === "bearish" ? "put" : "call";

      // 4. Fetch chains for both expirations
      const [shortChain, longChain] = await Promise.all([
        getTradierOptionsChain(ticker, shortExp),
        getTradierOptionsChain(ticker, longExp),
      ]);

      const shortContracts = optionType === "call" ? shortChain.calls : shortChain.puts;
      const longContracts = optionType === "call" ? longChain.calls : longChain.puts;

      if (!shortContracts.length || !longContracts.length) {
        throw new Error(`No ${optionType} options available for ${ticker}`);
      }

      // 5. Find target strike
      const strike = findTargetStrike(shortContracts, mode, currentPrice);

      // 6. Find the specific contracts at that strike
      const shortContract = shortContracts.find(c => c.strike === strike)
        ?? shortContracts.reduce((prev, curr) =>
          Math.abs(curr.strike - strike) < Math.abs(prev.strike - strike) ? curr : prev
        );
      const longContract = longContracts.find(c => c.strike === strike)
        ?? longContracts.reduce((prev, curr) =>
          Math.abs(curr.strike - strike) < Math.abs(prev.strike - strike) ? curr : prev
        );

      // 7. Build leg objects
      const shortLeg: CalendarLeg = {
        expiration: shortExp,
        strike: shortContract.strike,
        optionType,
        bid: shortContract.bid,
        ask: shortContract.ask,
        mid: midPrice(shortContract.bid, shortContract.ask),
        delta: shortContract.greeks?.delta ?? null,
        theta: shortContract.greeks?.theta ?? null,
        iv: shortContract.greeks?.mid_iv ?? null,
        dte: daysToExpiry(shortExp),
      };

      const longLeg: CalendarLeg = {
        expiration: longExp,
        strike: longContract.strike,
        optionType,
        bid: longContract.bid,
        ask: longContract.ask,
        mid: midPrice(longContract.bid, longContract.ask),
        delta: longContract.greeks?.delta ?? null,
        theta: longContract.greeks?.theta ?? null,
        iv: longContract.greeks?.mid_iv ?? null,
        dte: daysToExpiry(longExp),
      };

      // 8. Calculate spread economics
      const netDebit = Math.round((longLeg.mid - shortLeg.mid) * 100) / 100;
      const maxProfit = estimateMaxProfit(longLeg.mid, netDebit);
      const profitTarget30 = Math.round(maxProfit * 0.30 * 100) / 100;
      const profitTarget50 = Math.round(maxProfit * 0.50 * 100) / 100;

      // Theta differential: short leg decays faster (more negative theta per dollar)
      const shortTheta = shortLeg.theta ?? 0;
      const longTheta = longLeg.theta ?? 0;
      // Net daily theta benefit: we collect short theta, pay long theta
      // Short theta is negative (we're short → we receive that decay)
      // Long theta is negative (we're long → we pay that decay)
      // Net benefit = |shortTheta| - |longTheta|
      const thetaDifferential = Math.round((Math.abs(shortTheta) - Math.abs(longTheta)) * 100) / 100;

      const breakevens = estimateBreakevens(strike, netDebit);

      // 9. Build warnings and recommendation
      const warnings: string[] = [];

      // Vega risk assessment
      const shortIV = shortLeg.iv ?? 0;
      const longIV = longLeg.iv ?? 0;
      const ivSpread = Math.abs(longIV - shortIV);
      let vegaRisk = "Moderate";
      if (ivSpread > 0.05) {
        vegaRisk = "High — IV term structure is steep. If front-month IV drops, the spread loses value.";
        warnings.push("High IV term structure spread — vega risk elevated");
      } else {
        vegaRisk = "Moderate — standard term structure. Monitor if IV drops sharply.";
      }

      // Delta check
      const shortDelta = Math.abs(shortLeg.delta ?? 0);
      if (shortDelta > 0.40) {
        warnings.push(`Short leg delta is ${(shortDelta * 100).toFixed(0)} — too close to ATM, consider moving further OTM`);
      }
      if (shortDelta < 0.15) {
        warnings.push(`Short leg delta is ${(shortDelta * 100).toFixed(0)} — very far OTM, low premium collected`);
      }

      // DTE check
      if (shortLeg.dte < 5) {
        warnings.push("Short leg has fewer than 5 DTE — gamma risk is high, consider next week's expiry");
      }
      if (longLeg.dte - shortLeg.dte < 7) {
        warnings.push("Long and short legs are too close in time — theta differential will be minimal");
      }

      // R:R check
      const rr = netDebit > 0 ? maxProfit / netDebit : 0;
      if (rr < 2) {
        warnings.push(`R:R is ${rr.toFixed(1)}:1 — below the 2:1 minimum. Consider adjusting strike.`);
      }

      // Liquidity check
      const shortSpread = shortLeg.ask - shortLeg.bid;
      const longSpread = longLeg.ask - longLeg.bid;
      if (shortSpread > shortLeg.mid * 0.15 || longSpread > longLeg.mid * 0.15) {
        warnings.push("Wide bid/ask spread detected — use limit orders at the midpoint");
      }

      // Confidence
      let confidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
      if (warnings.length >= 3) confidence = "LOW";
      else if (warnings.length >= 1) confidence = "MEDIUM";

      // Recommendation
      let recommendation = "";
      if (mode === "bullish") {
        recommendation = `Bullish calendar on ${ticker}: sell the ${shortExp} $${strike} call, buy the ${longExp} $${strike} call for a net debit of $${netDebit}. Target: stock drifts toward $${strike} over ${shortLeg.dte} days. Exit at ${profitTarget30}–${profitTarget50} profit.`;
      } else if (mode === "neutral") {
        recommendation = `Neutral calendar on ${ticker}: sell the ${shortExp} $${strike} ${optionType}, buy the ${longExp} $${strike} ${optionType} for $${netDebit}. Target: stock stays near $${strike}. Exit at ${profitTarget30}–${profitTarget50} profit.`;
      } else {
        recommendation = `Bearish calendar on ${ticker}: sell the ${shortExp} $${strike} put, buy the ${longExp} $${strike} put for $${netDebit}. Target: stock drifts toward $${strike} over ${shortLeg.dte} days. Exit at ${profitTarget30}–${profitTarget50} profit.`;
      }

      const spread: CalendarSpread = {
        ticker,
        currentPrice,
        mode,
        optionType,
        strike,
        shortLeg,
        longLeg,
        netDebit,
        maxProfit,
        profitTarget30,
        profitTarget50,
        thetaDifferential,
        vegaRisk,
        breakevens,
        recommendation,
        confidence,
        warnings,
      };

      return spread;
    }),

  /**
   * Build an Iron Butterfly for earnings IV crush plays.
   * Sell ATM call + ATM put, buy wings for protection.
   */
  buildIronButterfly: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).transform(s => s.toUpperCase()),
      wingWidth: z.number().min(5).max(200).default(20),
    }))
    .query(async ({ input }) => {
      const { ticker, wingWidth } = input;

      const quote = await getTradierQuote(ticker);
      if (!quote) throw new Error(`Could not fetch quote for ${ticker}`);
      const currentPrice = quote.last ?? quote.close ?? 0;
      if (!currentPrice) throw new Error(`No price data for ${ticker}`);

      const expirations = await getTradierExpirations(ticker);
      const today = new Date().toISOString().slice(0, 10);
      const futureExps = expirations.filter(e => e > today);
      if (!futureExps.length) throw new Error(`No future expirations for ${ticker}`);

      // For earnings plays, use the nearest expiry (0–7 DTE for IV crush)
      const nearestExp = futureExps[0];
      const dte = daysToExpiry(nearestExp);

      const chain = await getTradierOptionsChain(ticker, nearestExp);

      // Find ATM strike
      const allStrikes = Array.from(new Set([
        ...chain.calls.map(c => c.strike),
        ...chain.puts.map(p => p.strike),
      ])).sort((a, b) => a - b);

      const atmStrike = allStrikes.reduce((prev, curr) =>
        Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
      );

      const wingCallStrike = atmStrike + wingWidth;
      const wingPutStrike = atmStrike - wingWidth;

      const shortCallContract = chain.calls.find(c => c.strike === atmStrike);
      const shortPutContract = chain.puts.find(p => p.strike === atmStrike);
      const longCallContract = chain.calls.find(c => c.strike === wingCallStrike)
        ?? chain.calls.reduce((prev, curr) =>
          Math.abs(curr.strike - wingCallStrike) < Math.abs(prev.strike - wingCallStrike) ? curr : prev
        );
      const longPutContract = chain.puts.find(p => p.strike === wingPutStrike)
        ?? chain.puts.reduce((prev, curr) =>
          Math.abs(curr.strike - wingPutStrike) < Math.abs(prev.strike - wingPutStrike) ? curr : prev
        );

      if (!shortCallContract || !shortPutContract) {
        throw new Error(`Could not find ATM options for ${ticker} at $${atmStrike}`);
      }

      const toCalendarLeg = (c: typeof shortCallContract, type: "call" | "put", exp: string): CalendarLeg => ({
        expiration: exp,
        strike: c!.strike,
        optionType: type,
        bid: c!.bid,
        ask: c!.ask,
        mid: midPrice(c!.bid, c!.ask),
        delta: c!.greeks?.delta ?? null,
        theta: c!.greeks?.theta ?? null,
        iv: c!.greeks?.mid_iv ?? null,
        dte,
      });

      const shortCall = toCalendarLeg(shortCallContract, "call", nearestExp);
      const shortPut = toCalendarLeg(shortPutContract, "put", nearestExp);
      const longCall = toCalendarLeg(longCallContract, "call", nearestExp);
      const longPut = toCalendarLeg(longPutContract, "put", nearestExp);

      // Iron butterfly economics
      const netCredit = Math.round(
        (shortCall.mid + shortPut.mid - longCall.mid - longPut.mid) * 100
      ) / 100;
      const maxLoss = Math.round((wingWidth - netCredit) * 100) / 100;

      const breakevens = {
        lower: Math.round((atmStrike - netCredit) * 100) / 100,
        upper: Math.round((atmStrike + netCredit) * 100) / 100,
      };
      const profitZone = {
        lower: Math.round((atmStrike - netCredit * 0.5) * 100) / 100,
        upper: Math.round((atmStrike + netCredit * 0.5) * 100) / 100,
      };

      // IV crush estimate
      const atmIV = shortCall.iv ?? shortPut.iv ?? 0;
      const ivCrushEstimate = atmIV > 0
        ? `Current ATM IV: ${(atmIV * 100).toFixed(0)}%. After earnings, IV typically drops 40–60%. A 50% IV crush would reduce option values by ~${(atmIV * 50).toFixed(0)}%, benefiting this short-vega position.`
        : "IV data unavailable — check current IV before entering.";

      const recommendation = `Earnings Iron Butterfly on ${ticker}: sell ${nearestExp} $${atmStrike} call + $${atmStrike} put, buy $${longCall.strike} call + $${longPut.strike} put. Collect $${netCredit} credit. Profit if ${ticker} stays between $${breakevens.lower} and $${breakevens.upper} after earnings. Max loss: $${maxLoss}.`;

      return {
        ticker,
        currentPrice,
        expiration: nearestExp,
        dte,
        atmStrike,
        shortCall,
        shortPut,
        longCall,
        longPut,
        netCredit,
        maxLoss,
        breakevens,
        profitZone,
        recommendation,
        ivCrushEstimate,
      } as IronButterfly;
    }),

  /**
   * Scan multiple tickers and return ranked results for a given mode.
   */
  scan: protectedProcedure
    .input(z.object({
      tickers: z.array(z.string().min(1).max(10)).min(1).max(30),
      mode: z.enum(["NEUTRAL", "BULLISH", "BEARISH", "EARNINGS_BUTTERFLY"]),
    }))
    .query(async ({ input }) => {
      const { tickers, mode } = input;
      const results = await Promise.allSettled(
        tickers.map(async (rawTicker) => {
          const ticker = rawTicker.toUpperCase();
          try {
            const quote = await getTradierQuote(ticker);
            if (!quote) return null;
            const price = quote.last ?? quote.close ?? 0;
            if (!price) return null;

            if (mode === "EARNINGS_BUTTERFLY") {
              const expirations = await getTradierExpirations(ticker);
              const today = new Date().toISOString().slice(0, 10);
              const futureExps = expirations.filter(e => e > today);
              if (!futureExps.length) return null;
              const nearestExp = futureExps[0];
              const dte = daysToExpiry(nearestExp);
              const chain = await getTradierOptionsChain(ticker, nearestExp);
              const atmStrike = chain.calls.reduce((best, c) =>
                Math.abs(c.strike - price) < Math.abs(best.strike - price) ? c : best
              , chain.calls[0])?.strike ?? price;
              const wingWidth = Math.max(5, Math.round(price * 0.08));
              const sc = chain.calls.find(c => c.strike === atmStrike);
              const sp = chain.puts.find(c => c.strike === atmStrike);
              const lc = chain.calls.reduce((best, c) =>
                Math.abs(c.strike - (atmStrike + wingWidth)) < Math.abs(best.strike - (atmStrike + wingWidth)) ? c : best
              , chain.calls[0]);
              const lp = chain.puts.reduce((best, c) =>
                Math.abs(c.strike - (atmStrike - wingWidth)) < Math.abs(best.strike - (atmStrike - wingWidth)) ? c : best
              , chain.puts[0]);
              if (!sc || !sp || !lc || !lp) return null;
              const mid = (b: number, a: number) => Math.round(((b + a) / 2) * 100) / 100;
              const netCredit = Math.round((mid(sc.bid, sc.ask) + mid(sp.bid, sp.ask) - mid(lc.bid, lc.ask) - mid(lp.bid, lp.ask)) * 100) / 100;
              const maxLoss = Math.round((lc.strike - atmStrike - netCredit) * 100) / 100;
              const atmIV = sc.greeks?.mid_iv ?? sp.greeks?.mid_iv ?? 0;
              const signal: "STRONG" | "MODERATE" | "WATCH" | "SKIP" =
                dte <= 3 ? "STRONG" : dte <= 7 ? "MODERATE" : dte <= 14 ? "WATCH" : "SKIP";
              return {
                ticker, price, iv30: atmIV, ivRank: computeIvRankForTicker(ticker, atmIV),
                mode: "EARNINGS_BUTTERFLY", signal,
                recommendation: `Iron Butterfly on ${ticker}: sell $${atmStrike} call+put, buy $${lp.strike}/$${lc.strike} wings. Collect $${netCredit} credit. ${dte} DTE.`,
                legs: [] as object[],
                daysToEarnings: dte,
                ironButterfly: {
                  strike: atmStrike,
                  callSell: atmStrike, putSell: atmStrike,
                  callBuy: lc.strike, putBuy: lp.strike,
                  maxProfit: Math.round(netCredit * 100),
                  maxLoss: Math.round(maxLoss * 100),
                  breakEvenLow: Math.round((atmStrike - netCredit) * 100) / 100,
                  breakEvenHigh: Math.round((atmStrike + netCredit) * 100) / 100,
                  ivCrushTarget: Math.round(atmIV * 50 * 100) / 100,
                },
              };
            } else {
              const calMode = mode === "BULLISH" ? "bullish" : mode === "BEARISH" ? "bearish" : "neutral";
              const expirations = await getTradierExpirations(ticker);
              const today = new Date().toISOString().slice(0, 10);
              const futureExps = expirations.filter(e => e > today);
              if (futureExps.length < 2) return null;
              const shortExp = futureExps.find(e => daysToExpiry(e) >= 5 && daysToExpiry(e) <= 16) ?? futureExps[0];
              const longExp = futureExps.find(e => daysToExpiry(e) >= 17 && daysToExpiry(e) <= 35) ?? futureExps[1];
              if (shortExp === longExp) return null;
              const optionType: "call" | "put" = calMode === "bearish" ? "put" : "call";
              const [shortChain, longChain] = await Promise.all([
                getTradierOptionsChain(ticker, shortExp),
                getTradierOptionsChain(ticker, longExp),
              ]);
              const shortContracts = optionType === "call" ? shortChain.calls : shortChain.puts;
              const longContracts = optionType === "call" ? longChain.calls : longChain.puts;
              if (!shortContracts.length || !longContracts.length) return null;
              const shortLegContract = findTargetDeltaContract(shortContracts, calMode, price);
              if (!shortLegContract) return null;
              const strike = shortLegContract.strike;
              const longLegContract = longContracts.reduce((best, c) =>
                Math.abs(c.strike - strike) < Math.abs(best.strike - strike) ? c : best
              , longContracts[0]);
              const mid = (b: number, a: number) => Math.round(((b + a) / 2) * 100) / 100;
              const shortPremium = mid(shortLegContract.bid, shortLegContract.ask);
              const longPremium = mid(longLegContract.bid, longLegContract.ask);
              const netDebit = Math.round((longPremium - shortPremium) * 100) / 100;
              const shortTheta = shortLegContract.greeks?.theta ?? 0;
              const longTheta = longLegContract.greeks?.theta ?? 0;
              const netTheta = Math.round((Math.abs(shortTheta) - Math.abs(longTheta)) * 1000) / 1000;
              const shortDelta = Math.abs(shortLegContract.greeks?.delta ?? 0);
              const shortIV = shortLegContract.greeks?.mid_iv ?? 0;
              const maxProfit = Math.round(netDebit * 2.5 * 100) / 100;
              const breakEvenLow = Math.round((strike - netDebit * 3) * 100) / 100;
              const breakEvenHigh = Math.round((strike + netDebit * 3) * 100) / 100;
              const rr = netDebit > 0 ? maxProfit / netDebit : 0;
              const signal: "STRONG" | "MODERATE" | "WATCH" | "SKIP" =
                rr >= 2.5 && shortIV >= 0.20 && shortDelta >= 0.18 && shortDelta <= 0.38 ? "STRONG" :
                rr >= 1.5 && shortIV >= 0.12 ? "MODERATE" :
                rr >= 1.0 ? "WATCH" : "SKIP";
              const leg = {
                strike, shortExpiry: shortExp, longExpiry: longExp,
                shortDte: daysToExpiry(shortExp), longDte: daysToExpiry(longExp),
                shortTheta, longTheta, netTheta,
                shortPremium, longPremium, netDebit,
                maxProfit, breakEvenLow, breakEvenHigh,
                delta: shortLegContract.greeks?.delta ?? 0,
                vega: shortLegContract.greeks?.vega ?? 0,
                type: optionType,
              };
              return {
                ticker, price, iv30: shortIV, ivRank: computeIvRankForTicker(ticker, shortIV),
                mode, signal,
                recommendation: `${calMode.charAt(0).toUpperCase() + calMode.slice(1)} calendar on ${ticker}: sell ${shortExp} $${strike} ${optionType}, buy ${longExp} $${strike} ${optionType}. Net debit $${netDebit}. Net \u03b8 +$${Math.abs(netTheta).toFixed(3)}/day.`,
                legs: [leg],
              };
            }
          } catch {
            return null;
          }
        })
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fulfilled: any[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value !== null) {
          fulfilled.push(r.value);
        }
      }
      const order: Record<string, number> = { STRONG: 0, MODERATE: 1, WATCH: 2, SKIP: 3 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fulfilled.sort((a: any, b: any) => (order[a.signal] ?? 3) - (order[b.signal] ?? 3));
    }),

  /**
   * Get available expirations for a ticker (for the UI expiry selector).
   */
  getExpirations: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).transform(s => s.toUpperCase()),
    }))
    .query(async ({ input }) => {
      const expirations = await getTradierExpirations(input.ticker);
      const today = new Date().toISOString().slice(0, 10);
      return expirations
        .filter(e => e > today)
        .slice(0, 12)
        .map(e => ({ date: e, dte: daysToExpiry(e) }));
    }),
});
