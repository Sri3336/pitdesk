/**
 * Tradier API Client — Real Options Chain Data
 *
 * Fetches live options chain data (OI + volume per strike) from Tradier.
 * Used by the PCR/COI strategy engine to get real institutional positioning.
 *
 * API docs: https://documentation.tradier.com/brokerage-api/markets/get-options-chains
 */

import { ENV } from "./_core/env";

const TRADIER_BASE = "https://api.tradier.com/v1";

export interface TradierOptionContract {
  symbol: string;
  description: string;
  exch: string;
  type: "call" | "put";
  last: number | null;
  change: number | null;
  volume: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  bid: number;
  ask: number;
  underlying: string;
  strike: number;
  change_percentage: number | null;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  prevclose: number | null;
  week_52_high: number;
  week_52_low: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  asksize: number;
  askexch: string;
  ask_date: number;
  open_interest: number;
  contract_size: number;
  expiration_date: string;
  expiration_type: string;
  option_type: "call" | "put";
  root_symbol: string;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    phi: number;
    bid_iv: number;
    mid_iv: number;
    ask_iv: number;
    smv_vol: number;
    updated_at: string;
  };
}

export interface TradierOptionsChain {
  ticker: string;
  expiration: string;
  calls: TradierOptionContract[];
  puts: TradierOptionContract[];
  atmStrike: number;
  currentPrice: number;
}

export interface TradierQuote {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prevclose: number;
  change: number;
  change_percentage: number;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  week_52_high: number;
  week_52_low: number;
}

async function tradierFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const apiKey = ENV.tradierApiKey;
  if (!apiKey) throw new Error("TRADIER_API_KEY is not configured");

  const url = new URL(`${TRADIER_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Tradier API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.json() as Promise<T>;
}

/**
 * Get current quote for a ticker
 */
export async function getTradierQuote(ticker: string): Promise<TradierQuote | null> {
  try {
    const data = await tradierFetch<{ quotes: { quote: TradierQuote | TradierQuote[] } }>(
      "/markets/quotes",
      { symbols: ticker, greeks: "false" }
    );
    const q = data?.quotes?.quote;
    if (!q) return null;
    return Array.isArray(q) ? q[0] : q;
  } catch (err) {
    console.error(`[Tradier] Quote error for ${ticker}:`, (err as Error).message);
    return null;
  }
}

/**
 * Get options expiration dates for a ticker
 */
export async function getTradierExpirations(ticker: string): Promise<string[]> {
  try {
    const data = await tradierFetch<{ expirations: { date: string[] | { date: string }[] } }>(
      "/markets/options/expirations",
      { symbol: ticker, includeAllRoots: "true", strikes: "false" }
    );
    const exps = data?.expirations?.date;
    if (!exps || !Array.isArray(exps)) return [];
    // Handle both string[] and {date: string}[] formats
    return exps.map((e: string | { date: string }) => (typeof e === "string" ? e : e.date));
  } catch (err) {
    console.error(`[Tradier] Expirations error for ${ticker}:`, (err as Error).message);
    return [];
  }
}

/**
 * Get full options chain for a ticker on a specific expiration date
 * Includes greeks (delta) for strike selection
 */
export async function getTradierOptionsChain(
  ticker: string,
  expiration: string
): Promise<{ calls: TradierOptionContract[]; puts: TradierOptionContract[] }> {
  try {
    const data = await tradierFetch<{ options: { option: TradierOptionContract[] } }>(
      "/markets/options/chains",
      { symbol: ticker, expiration, greeks: "true" }
    );
    const options = data?.options?.option;
    if (!options || !Array.isArray(options)) return { calls: [], puts: [] };

    const calls = options.filter(o => o.option_type === "call");
    const puts = options.filter(o => o.option_type === "put");
    return { calls, puts };
  } catch (err) {
    console.error(`[Tradier] Chain error for ${ticker} ${expiration}:`, (err as Error).message);
    return { calls: [], puts: [] };
  }
}

/**
 * Get the nearest expiry options chain for a ticker with ATM window selection.
 *
 * Strategy: Select 7 strikes around ATM (±3 strikes) for COI calculation.
 * Skips current expiry if today is expiry day or day before (expiry filter from video).
 */
export async function getTradierAtmChain(
  ticker: string,
  currentPrice: number
): Promise<TradierOptionsChain | null> {
  try {
    const expirations = await getTradierExpirations(ticker);
    if (!expirations.length) return null;

    // Expiry filter: skip current week if today is expiry or day before
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    let selectedExpiry = expirations[0];
    if (selectedExpiry === todayStr || selectedExpiry === tomorrowStr) {
      // Use next week's expiry
      selectedExpiry = expirations[1] ?? expirations[0];
    }

    const { calls, puts } = await getTradierOptionsChain(ticker, selectedExpiry);
    if (!calls.length && !puts.length) return null;

    // Find ATM strike (nearest to current price)
    const strikeSet = new Set<number>();
    calls.forEach(c => strikeSet.add(c.strike));
    puts.forEach(p => strikeSet.add(p.strike));
    const allStrikes = Array.from(strikeSet).sort((a, b) => a - b);
    const atmStrike = allStrikes.reduce((prev, curr) =>
      Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
    );

    return {
      ticker,
      expiration: selectedExpiry,
      calls,
      puts,
      atmStrike,
      currentPrice,
    };
  } catch (err) {
    console.error(`[Tradier] ATM chain error for ${ticker}:`, (err as Error).message);
    return null;
  }
}

/**
 * Calculate COI (Change in Open Interest) imbalance for 7 strikes around ATM.
 *
 * Returns:
 * - callCoiTotal: sum of call OI across 7 ATM strikes
 * - putCoiTotal: sum of put OI across 7 ATM strikes
 * - callCoiPct: call COI as % of total
 * - putCoiPct: put COI as % of total
 * - imbalancePct: |callCoiPct - putCoiPct| — the signal strength
 * - signal: "BUY_CALL" | "BUY_PUT" | "NEUTRAL"
 * - atmStrikes: the 7 strikes used
 */
export interface CoiAnalysis {
  ticker: string;
  currentPrice: number;
  atmStrike: number;
  expiration: string;
  callCoiTotal: number;
  putCoiTotal: number;
  callCoiPct: number;
  putCoiPct: number;
  imbalancePct: number;
  signal: "BUY_CALL" | "BUY_PUT" | "NEUTRAL";
  signalStrength: number; // 1-5
  atmStrikes: number[];
  isExpiryDay: boolean;
  isExpiryEve: boolean;
  // For delta-based risk management hints
  atmCallDelta: number | null;
  atmPutDelta: number | null;
  // Raw totals for EOD snapshot
  totalCallOI: number;
  totalPutOI: number;
  totalCallVolume: number;
  totalPutVolume: number;
  pcrOI: number;
  pcrVolume: number;
}

export async function analyzeCoiImbalance(
  ticker: string,
  priorPutOI?: number,
  priorCallOI?: number
): Promise<CoiAnalysis | null> {
  try {
    // Get current price
    const quote = await getTradierQuote(ticker);
    if (!quote) return null;
    const currentPrice = quote.last ?? quote.close ?? 0;
    if (!currentPrice) return null;

    // Check expiry filter
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const expirations = await getTradierExpirations(ticker);
    if (!expirations.length) return null;

    const nearestExpiry = expirations[0];
    const isExpiryDay = nearestExpiry === todayStr;
    const isExpiryEve = nearestExpiry === tomorrowStr;

    // Use next week if expiry day or eve
    const selectedExpiry = (isExpiryDay || isExpiryEve) ? (expirations[1] ?? expirations[0]) : expirations[0];

    const { calls, puts } = await getTradierOptionsChain(ticker, selectedExpiry);
    if (!calls.length && !puts.length) return null;

    // Find ATM strike
    const strikeSet2 = new Set<number>();
    calls.forEach(c => strikeSet2.add(c.strike));
    puts.forEach(p => strikeSet2.add(p.strike));
    const allStrikes = Array.from(strikeSet2).sort((a, b) => a - b);
    const atmStrike = allStrikes.reduce((prev, curr) =>
      Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
    );
    const atmIdx = allStrikes.indexOf(atmStrike);

    // Select 7 strikes: ATM ± 3
    const atmStrikes = allStrikes.slice(Math.max(0, atmIdx - 3), atmIdx + 4);

    // Sum OI for the 7 ATM strikes
    const callMap = new Map(calls.map(c => [c.strike, c]));
    const putMap = new Map(puts.map(p => [p.strike, p]));

    let callCoiTotal = 0;
    let putCoiTotal = 0;

    for (const strike of atmStrikes) {
      const callContract = callMap.get(strike);
      const putContract = putMap.get(strike);

      // COI = current OI (if no prior snapshot, use current OI as the "change" proxy)
      // When prior EOD OI is available: COI = currentOI - priorOI
      // For intraday: OI changes during the session as new positions open
      const callOI = callContract?.open_interest ?? 0;
      const putOI = putContract?.open_interest ?? 0;

      // If we have prior EOD data, compute delta; otherwise use raw OI
      const callCoi = priorCallOI !== undefined ? Math.max(0, callOI - (priorCallOI / allStrikes.length)) : callOI;
      const putCoi = priorPutOI !== undefined ? Math.max(0, putOI - (priorPutOI / allStrikes.length)) : putOI;

      callCoiTotal += callCoi;
      putCoiTotal += putCoi;
    }

    const totalCoi = callCoiTotal + putCoiTotal;
    const callCoiPct = totalCoi > 0 ? (callCoiTotal / totalCoi) * 100 : 50;
    const putCoiPct = totalCoi > 0 ? (putCoiTotal / totalCoi) * 100 : 50;
    const imbalancePct = Math.abs(callCoiPct - putCoiPct);

    // Signal classification (from video: >40% imbalance is actionable)
    let signal: "BUY_CALL" | "BUY_PUT" | "NEUTRAL" = "NEUTRAL";
    let signalStrength = 1;

    if (imbalancePct >= 60) {
      signalStrength = 5;
      // Heavy call writing → market faces resistance → Buy Put
      // Heavy put writing → market has support → Buy Call
      signal = callCoiPct > putCoiPct ? "BUY_PUT" : "BUY_CALL";
    } else if (imbalancePct >= 45) {
      signalStrength = 4;
      signal = callCoiPct > putCoiPct ? "BUY_PUT" : "BUY_CALL";
    } else if (imbalancePct >= 30) {
      signalStrength = 3;
      signal = callCoiPct > putCoiPct ? "BUY_PUT" : "BUY_CALL";
    } else if (imbalancePct >= 15) {
      signalStrength = 2;
      // Weak signal — still neutral for trading purposes
    }

    // ATM delta for risk management hints
    const atmCall = callMap.get(atmStrike);
    const atmPut = putMap.get(atmStrike);
    const atmCallDelta = atmCall?.greeks?.delta ?? null;
    const atmPutDelta = atmPut?.greeks?.delta ?? null;

    // Full chain totals for EOD snapshot
    const totalCallOI = calls.reduce((s, c) => s + (c.open_interest ?? 0), 0);
    const totalPutOI = puts.reduce((s, p) => s + (p.open_interest ?? 0), 0);
    const totalCallVolume = calls.reduce((s, c) => s + (c.volume ?? 0), 0);
    const totalPutVolume = puts.reduce((s, p) => s + (p.volume ?? 0), 0);
    const pcrOI = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
    const pcrVolume = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;

    return {
      ticker,
      currentPrice,
      atmStrike,
      expiration: selectedExpiry,
      callCoiTotal,
      putCoiTotal,
      callCoiPct,
      putCoiPct,
      imbalancePct,
      signal,
      signalStrength,
      atmStrikes,
      isExpiryDay,
      isExpiryEve,
      atmCallDelta,
      atmPutDelta,
      totalCallOI,
      totalPutOI,
      totalCallVolume,
      totalPutVolume,
      pcrOI,
      pcrVolume,
    };
  } catch (err) {
    console.error(`[Tradier] COI analysis error for ${ticker}:`, (err as Error).message);
    return null;
  }
}
