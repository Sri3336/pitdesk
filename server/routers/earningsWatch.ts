/**
 * Earnings Watch Router
 * Fetches upcoming earnings dates for all PCR tickers from Yahoo Finance
 * using the chart events API (same source as fetchEarningsInfo in routers.ts).
 * Results are cached for 6 hours to avoid hammering the API.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";
import { PCR_TICKERS } from "../../shared/tickers";

// ETFs don't report earnings
const ETF_TICKERS = new Set([
  "SPY","QQQ","IWM","DIA","GLD","SLV","TLT","HYG",
  "XLF","XLE","XLK","XLV","XLI","XLU","XLP","XLB","XLRE","XLC","XLY",
]);

// Portfolio positions (Sridhar's holdings)
const PORTFOLIO_TICKERS = new Set(["WDC","SNDK","AVGO","MU","ZS","DRAM"]);

export interface EarningsEntry {
  ticker: string;
  date: string;        // YYYY-MM-DD
  daysAway: number;
  confirmed: boolean;
  inPortfolio: boolean;
  isEtf: boolean;
}

// 6-hour cache
let cache: { entries: EarningsEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchEarningsDate(ticker: string): Promise<{ date: string; confirmed: boolean } | null> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        region: "US",
        interval: "1d",
        range: "1y",
        includeAdjustedClose: "false",
        events: "earnings",
      },
    });
    const result = res?.chart?.result?.[0];
    const earningsEvents = result?.events?.earnings;
    if (!earningsEvents) return null;

    const now = Date.now() / 1000;
    const futureEarnings = Object.values(earningsEvents as Record<string, any>)
      .filter((e: any) => e.date > now)
      .sort((a: any, b: any) => a.date - b.date);

    if (futureEarnings.length === 0) return null;

    const next = futureEarnings[0] as any;
    const date = new Date(next.date * 1000).toISOString().split("T")[0];

    // If the event has a startdatetime field it's confirmed; otherwise estimated
    const confirmed = !!next.startdatetime || !!next.date;

    return { date, confirmed };
  } catch {
    return null;
  }
}

async function buildEarningsEntries(): Promise<EarningsEntry[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch all non-ETF tickers in parallel (batches of 10 to avoid rate limits)
  const stockTickers = PCR_TICKERS.filter(t => !ETF_TICKERS.has(t));
  const entries: EarningsEntry[] = [];

  const BATCH_SIZE = 10;
  for (let i = 0; i < stockTickers.length; i += BATCH_SIZE) {
    const batch = stockTickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        const result = await fetchEarningsDate(ticker);
        if (!result) return null;
        const earningsDate = new Date(result.date);
        earningsDate.setHours(0, 0, 0, 0);
        const daysAway = Math.round((earningsDate.getTime() - today.getTime()) / 86400000);
        return {
          ticker,
          date: result.date,
          daysAway,
          confirmed: result.confirmed,
          inPortfolio: PORTFOLIO_TICKERS.has(ticker),
          isEtf: false,
        } as EarningsEntry;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) {
        entries.push(r.value);
      }
    }
    // Small delay between batches to be polite to the API
    if (i + BATCH_SIZE < stockTickers.length) {
      await new Promise(res => setTimeout(res, 200));
    }
  }

  // Sort by date ascending
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

export const earningsWatchRouter = router({
  getAll: protectedProcedure.query(async () => {
    // Return cached if fresh
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return { entries: cache.entries, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true };
    }

    const entries = await buildEarningsEntries();
    cache = { entries, fetchedAt: Date.now() };

    return {
      entries,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      cached: false,
    };
  }),

  refresh: protectedProcedure.mutation(async () => {
    // Force refresh — clear cache
    cache = null;
    const entries = await buildEarningsEntries();
    cache = { entries, fetchedAt: Date.now() };
    return {
      entries,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      cached: false,
    };
  }),
});
