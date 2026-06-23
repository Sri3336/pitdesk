/**
 * optionsFlow.ts
 *
 * Options Flow / Dark Pool screen — surfaces unusual call/put activity
 * by scanning Tradier options chains for a watchlist of tickers.
 *
 * "Unusual score" = (volume / openInterest) * premium * iv
 * Higher score = more unusual institutional-style activity.
 *
 * Route: /options-flow
 * tRPC namespace: optionsFlow
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getTradierExpirations, getTradierOptionsChain } from "../tradierClient";
import { callDataApi } from "../_core/dataApi";

// ─── Default watchlist ────────────────────────────────────────────────────────

const DEFAULT_FLOW_TICKERS = [
  "SPY", "QQQ", "IWM", "NVDA", "TSLA", "AAPL", "META", "AMZN", "GOOGL", "MSFT",
  "AMD", "PLTR", "SOFI", "INTC", "NFLX", "HOOD", "SOXL", "IONQ", "RKLB", "APP",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptionsFlowContract {
  ticker: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  volume: number;
  openInterest: number;
  iv: number;
  bid: number;
  ask: number;
  premium: number;       // mid-price × 100 (per contract)
  unusualScore: number;  // (volume / openInterest) * premium * iv
  daysToExpiry: number;
  delta: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDte(expirationDate: string): number {
  const now = new Date();
  const exp = new Date(expirationDate + "T16:00:00-05:00"); // 4 PM ET
  const diff = exp.getTime() - now.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function calcUnusualScore(volume: number, openInterest: number, premium: number, iv: number): number {
  if (openInterest <= 0 || premium <= 0) return 0;
  const volOiRatio = volume / openInterest;
  return parseFloat((volOiRatio * premium * iv).toFixed(4));
}

async function getFlowForTicker(
  ticker: string,
  minPremium: number,
  maxDte: number
): Promise<OptionsFlowContract[]> {
  try {
    // Get expirations within maxDte
    const expirations = await getTradierExpirations(ticker);
    if (!expirations.length) return [];

    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + maxDte);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Pick first 2 expirations within the DTE window
    const validExps = expirations
      .filter(e => e >= today.toISOString().slice(0, 10) && e <= cutoffStr)
      .slice(0, 2);

    if (!validExps.length) return [];

    const results: OptionsFlowContract[] = [];

    for (const exp of validExps) {
      const { calls, puts } = await getTradierOptionsChain(ticker, exp);
      const dte = calcDte(exp);

      for (const contract of [...calls, ...puts]) {
        const volume = contract.volume ?? 0;
        const openInterest = contract.open_interest ?? 0;
        const iv = contract.greeks?.mid_iv ?? 0;
        const mid = (contract.bid + contract.ask) / 2;
        const premium = mid * 100; // per contract value

        if (volume < 10) continue;           // skip illiquid
        if (premium < minPremium) continue;  // below min premium filter

        const unusualScore = calcUnusualScore(volume, openInterest, premium, iv);

        results.push({
          ticker,
          strike: contract.strike,
          expiration: exp,
          type: contract.option_type,
          volume,
          openInterest,
          iv: parseFloat((iv * 100).toFixed(1)), // as percentage
          bid: contract.bid,
          ask: contract.ask,
          premium: parseFloat(premium.toFixed(2)),
          unusualScore,
          daysToExpiry: dte,
          delta: contract.greeks?.delta ?? null,
        });
      }
    }

    return results;
  } catch (err) {
    console.error(`[OptionsFlow] Error for ${ticker}:`, (err as Error).message);
    return [];
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const optionsFlowRouter = router({
  /**
   * Get unusual options flow for a list of tickers.
   * Returns contracts sorted by unusualScore desc (most unusual first).
   */
  getFlow: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string().min(1).max(10)).min(1).max(30).optional(),
        minPremium: z.number().min(0).max(100000).default(500),
        maxDte: z.number().min(1).max(90).default(45),
        contractType: z.enum(["all", "call", "put"]).default("all"),
        sortBy: z.enum(["unusualScore", "premium", "volume", "iv"]).default("unusualScore"),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? DEFAULT_FLOW_TICKERS;
      const { minPremium, maxDte, contractType, sortBy, limit } = input;

      // Fetch all tickers in parallel (cap concurrency to avoid rate limits)
      const BATCH_SIZE = 5;
      const allContracts: OptionsFlowContract[] = [];

      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(t => getFlowForTicker(t, minPremium, maxDte))
        );
        for (const contracts of batchResults) {
          allContracts.push(...contracts);
        }
      }

      // Filter by contract type
      const filtered = contractType === "all"
        ? allContracts
        : allContracts.filter(c => c.type === contractType);

      // Sort
      const sorted = filtered.sort((a, b) => {
        if (sortBy === "premium") return b.premium - a.premium;
        if (sortBy === "volume") return b.volume - a.volume;
        if (sortBy === "iv") return b.iv - a.iv;
        return b.unusualScore - a.unusualScore;
      });

      return {
        contracts: sorted.slice(0, limit),
        total: sorted.length,
        tickers,
        scannedAt: new Date().toISOString(),
      };
    }),

  /**
   * Get the default watchlist tickers for the Options Flow screen.
   */
  getDefaultTickers: protectedProcedure.query(() => {
    return DEFAULT_FLOW_TICKERS;
  }),
});
