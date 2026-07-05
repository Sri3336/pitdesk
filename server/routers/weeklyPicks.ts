/**
 * Weekly Picks Router — Top 10 Premium-Selling Opportunities
 *
 * Procedures:
 *   weeklyPicks.getWeeklyTopTickers — Score ~50 liquid S&P 500 stocks by IV Rank,
 *     options liquidity (volume + OI), and add an AI fundamental note.
 *     Results are cached for 4 hours to avoid hammering Tradier.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getTradierQuote, getTradierAtmChain } from "../tradierClient";
import { invokeLLM } from "../_core/llm";

// ─── Candidate Universe ────────────────────────────────────────────────────────
// ~50 liquid S&P 500 stocks with high options volume, suitable for premium selling.
// Excludes Sri's existing 8-ticker universe (those are always shown separately).
// Organized by sector for diversification awareness.
const CANDIDATE_UNIVERSE = [
  // Tech / Semiconductors
  { ticker: "AMD",   ivLow: 0.55, ivHigh: 0.90, sector: "Semiconductors" },
  { ticker: "INTC",  ivLow: 0.40, ivHigh: 0.75, sector: "Semiconductors" },
  { ticker: "QCOM",  ivLow: 0.35, ivHigh: 0.65, sector: "Semiconductors" },
  { ticker: "MU",    ivLow: 0.50, ivHigh: 0.85, sector: "Semiconductors" },
  { ticker: "AVGO",  ivLow: 0.35, ivHigh: 0.65, sector: "Semiconductors" },
  { ticker: "AMAT",  ivLow: 0.40, ivHigh: 0.70, sector: "Semiconductors" },
  { ticker: "LRCX",  ivLow: 0.40, ivHigh: 0.70, sector: "Semiconductors" },
  // Cloud / Software
  { ticker: "MSFT",  ivLow: 0.20, ivHigh: 0.45, sector: "Cloud / Software" },
  { ticker: "GOOGL", ivLow: 0.25, ivHigh: 0.50, sector: "Cloud / Software" },
  { ticker: "CRM",   ivLow: 0.30, ivHigh: 0.60, sector: "Cloud / Software" },
  { ticker: "NOW",   ivLow: 0.30, ivHigh: 0.60, sector: "Cloud / Software" },
  { ticker: "SNOW",  ivLow: 0.55, ivHigh: 0.90, sector: "Cloud / Software" },
  { ticker: "DDOG",  ivLow: 0.50, ivHigh: 0.85, sector: "Cloud / Software" },
  { ticker: "ZS",    ivLow: 0.45, ivHigh: 0.80, sector: "Cloud / Software" },
  // Consumer / Retail
  { ticker: "AAPL",  ivLow: 0.20, ivHigh: 0.40, sector: "Consumer Tech" },
  { ticker: "NFLX",  ivLow: 0.40, ivHigh: 0.70, sector: "Consumer Tech" },
  { ticker: "SPOT",  ivLow: 0.45, ivHigh: 0.80, sector: "Consumer Tech" },
  { ticker: "SHOP",  ivLow: 0.50, ivHigh: 0.85, sector: "E-Commerce" },
  { ticker: "MELI",  ivLow: 0.45, ivHigh: 0.75, sector: "E-Commerce" },
  // Financials
  { ticker: "JPM",   ivLow: 0.20, ivHigh: 0.40, sector: "Financials" },
  { ticker: "GS",    ivLow: 0.25, ivHigh: 0.45, sector: "Financials" },
  { ticker: "MS",    ivLow: 0.25, ivHigh: 0.45, sector: "Financials" },
  { ticker: "BAC",   ivLow: 0.20, ivHigh: 0.40, sector: "Financials" },
  { ticker: "V",     ivLow: 0.18, ivHigh: 0.35, sector: "Financials" },
  // Energy
  { ticker: "XOM",   ivLow: 0.20, ivHigh: 0.40, sector: "Energy" },
  { ticker: "CVX",   ivLow: 0.20, ivHigh: 0.40, sector: "Energy" },
  { ticker: "OXY",   ivLow: 0.30, ivHigh: 0.55, sector: "Energy" },
  { ticker: "SLB",   ivLow: 0.30, ivHigh: 0.55, sector: "Energy" },
  // Healthcare / Biotech
  { ticker: "UNH",   ivLow: 0.20, ivHigh: 0.45, sector: "Healthcare" },
  { ticker: "LLY",   ivLow: 0.30, ivHigh: 0.55, sector: "Healthcare" },
  { ticker: "ABBV",  ivLow: 0.22, ivHigh: 0.42, sector: "Healthcare" },
  { ticker: "MRNA",  ivLow: 0.60, ivHigh: 1.00, sector: "Biotech" },
  { ticker: "BNTX",  ivLow: 0.55, ivHigh: 0.90, sector: "Biotech" },
  // Industrial / Defense
  { ticker: "CAT",   ivLow: 0.22, ivHigh: 0.42, sector: "Industrial" },
  { ticker: "DE",    ivLow: 0.22, ivHigh: 0.42, sector: "Industrial" },
  { ticker: "LMT",   ivLow: 0.18, ivHigh: 0.35, sector: "Defense" },
  { ticker: "RTX",   ivLow: 0.18, ivHigh: 0.35, sector: "Defense" },
  // Commodities / Materials
  { ticker: "FCX",   ivLow: 0.35, ivHigh: 0.65, sector: "Metals / Mining" },
  { ticker: "NEM",   ivLow: 0.30, ivHigh: 0.55, sector: "Metals / Mining" },
  { ticker: "GLD",   ivLow: 0.12, ivHigh: 0.25, sector: "Gold ETF" },
  // Volatility / ETFs
  { ticker: "SPY",   ivLow: 0.12, ivHigh: 0.30, sector: "Index ETF" },
  { ticker: "QQQ",   ivLow: 0.15, ivHigh: 0.35, sector: "Index ETF" },
  { ticker: "IWM",   ivLow: 0.18, ivHigh: 0.38, sector: "Index ETF" },
  { ticker: "XLE",   ivLow: 0.20, ivHigh: 0.40, sector: "Energy ETF" },
  { ticker: "XLF",   ivLow: 0.18, ivHigh: 0.35, sector: "Financials ETF" },
  // High-IV momentum names
  { ticker: "COIN",  ivLow: 0.70, ivHigh: 1.20, sector: "Crypto / Fintech" },
  { ticker: "HOOD",  ivLow: 0.65, ivHigh: 1.10, sector: "Crypto / Fintech" },
  { ticker: "MSTR",  ivLow: 0.80, ivHigh: 1.40, sector: "Crypto / Fintech" },
  { ticker: "RBLX",  ivLow: 0.55, ivHigh: 0.90, sector: "Gaming / Metaverse" },
  { ticker: "U",     ivLow: 0.60, ivHigh: 1.00, sector: "Gaming / Metaverse" },
];

// ─── In-memory cache ───────────────────────────────────────────────────────────
interface CachedResult {
  data: PickResult[];
  fetchedAt: number;
}
let cache: CachedResult | null = null;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface PickResult {
  ticker: string;
  sector: string;
  price: number | null;
  iv: number | null;          // current ATM IV (annualised decimal)
  ivRank: number | null;      // 0–100
  ivStatus: "green" | "yellow" | "red" | "gray";
  optionsVolume: number;      // total ATM call+put volume
  openInterest: number;       // total ATM call+put OI
  liquidityScore: number;     // 0–100 composite
  score: number;              // composite score (IV Rank 50% + liquidity 50%)
  fundamentalNote: string;    // AI-generated brief note
  change: number | null;      // day % change
}

// ─── Scoring helpers ───────────────────────────────────────────────────────────
function computeIvRank(iv: number, ivLow: number, ivHigh: number): number {
  if (ivHigh <= ivLow) return 0;
  const rank = ((iv - ivLow) / (ivHigh - ivLow)) * 100;
  return Math.max(0, Math.min(100, Math.round(rank)));
}

function ivStatus(ivRank: number | null): "green" | "yellow" | "red" | "gray" {
  if (ivRank === null) return "gray";
  if (ivRank >= 40) return "green";
  if (ivRank >= 20) return "yellow";
  return "red";
}

// Normalise volume/OI to 0–100 using log scale (handles wide range)
function normaliseLiquidity(volume: number, oi: number): number {
  const combined = volume + oi * 0.5;
  if (combined <= 0) return 0;
  // log10(1) = 0, log10(1M) = 6 → scale to 0–100
  const logVal = Math.log10(combined + 1);
  return Math.min(100, Math.round((logVal / 6) * 100));
}

// ─── AI Fundamental Notes ──────────────────────────────────────────────────────
async function fetchFundamentalNotes(tickers: string[]): Promise<Record<string, string>> {
  if (tickers.length === 0) return {};
  try {
    const prompt = `You are a concise trading analyst. For each of the following tickers, write a single sentence (max 20 words) describing the key fundamental reason it is SAFE or RISKY to hold if assigned on a cash-secured put. Focus on: balance sheet strength, earnings trend, sector tailwind/headwind. Be direct, no fluff.

Tickers: ${tickers.join(", ")}

Respond ONLY with a JSON object like:
{"AAPL": "Strong cash flow, buyback machine — safe to hold if assigned.", "COIN": "Volatile crypto proxy — risky to hold, use small size."}`;

    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      responseFormat: { type: "json_object" },
      maxTokens: 600,
    });
    const content = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content : "{}";
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

// ─── Main Procedure ────────────────────────────────────────────────────────────
export const weeklyPicksRouter = router({
  getWeeklyTopTickers: protectedProcedure.query(async (): Promise<PickResult[]> => {
    // Return cached result if fresh
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return cache.data;
    }

    // Fetch IV + liquidity data for all candidates in parallel (with concurrency limit)
    const BATCH_SIZE = 10;
    const rawResults: PickResult[] = [];

    for (let i = 0; i < CANDIDATE_UNIVERSE.length; i += BATCH_SIZE) {
      const batch = CANDIDATE_UNIVERSE.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ ticker, ivLow, ivHigh, sector }) => {
          try {
            const quote = await getTradierQuote(ticker);
            const price = quote?.last ?? 0;
            if (!price) {
              return {
                ticker, sector, price: null, iv: null, ivRank: null,
                ivStatus: "gray" as const, optionsVolume: 0, openInterest: 0,
                liquidityScore: 0, score: 0, fundamentalNote: "", change: null,
              } satisfies PickResult;
            }

            const chain = await getTradierAtmChain(ticker, price);
            const atmContracts = [
              ...(chain?.calls ?? []),
              ...(chain?.puts ?? []),
            ].filter(c => c.greeks?.mid_iv && c.greeks.mid_iv > 0);

            // Compute ATM IV
            let iv: number | null = null;
            if (atmContracts.length > 0) {
              const sum = atmContracts.reduce((acc, c) => acc + (c.greeks?.mid_iv ?? 0), 0);
              iv = sum / atmContracts.length;
            }

            // Compute options volume and OI from ATM contracts
            const allContracts = [...(chain?.calls ?? []), ...(chain?.puts ?? [])];
            const optionsVolume = allContracts.reduce((acc, c) => acc + (c.volume ?? 0), 0);
            const openInterest = allContracts.reduce((acc, c) => acc + (c.open_interest ?? 0), 0);

            const ivRankVal = iv !== null ? computeIvRank(iv, ivLow, ivHigh) : null;
            const liquidityScore = normaliseLiquidity(optionsVolume, openInterest);
            // Composite score: 50% IV Rank + 50% liquidity (only score if IV data available)
            const score = ivRankVal !== null
              ? Math.round(ivRankVal * 0.5 + liquidityScore * 0.5)
              : liquidityScore * 0.3; // penalise missing IV data

            return {
              ticker,
              sector,
              price: quote?.last ?? null,
              iv: iv !== null ? Math.round(iv * 100) / 100 : null,
              ivRank: ivRankVal,
              ivStatus: ivStatus(ivRankVal),
              optionsVolume,
              openInterest,
              liquidityScore,
              score,
              fundamentalNote: "", // filled in next step
              change: quote?.change_percentage ?? null,
            } satisfies PickResult;
          } catch {
            return {
              ticker, sector, price: null, iv: null, ivRank: null,
              ivStatus: "gray" as const, optionsVolume: 0, openInterest: 0,
              liquidityScore: 0, score: 0, fundamentalNote: "", change: null,
            } satisfies PickResult;
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled") rawResults.push(r.value);
      }
    }

    // Sort by composite score descending, take top 15 candidates for AI notes
    rawResults.sort((a, b) => b.score - a.score);
    const top15 = rawResults.slice(0, 15).map(r => r.ticker);

    // Fetch AI fundamental notes for top 15 candidates
    const notes = await fetchFundamentalNotes(top15);

    // Apply notes and return top 10
    const withNotes = rawResults.map(r => ({
      ...r,
      fundamentalNote: notes[r.ticker] ?? "",
    }));

    const top10 = withNotes.slice(0, 10);

    // Cache results
    cache = { data: top10, fetchedAt: Date.now() };
    return top10;
  }),

  // Force-refresh the cache (owner-only action)
  refreshCache: protectedProcedure.mutation(async () => {
    cache = null;
    return { ok: true, message: "Cache cleared — next query will fetch fresh data" };
  }),
});
