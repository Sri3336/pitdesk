/**
 * Historical Data Router — 5-Year OHLCV for Backtesting
 *
 * Procedures:
 *   startBulkDownload  — queue all tickers in selected universes, then process sequentially
 *   getDownloadStatus  — per-ticker job status (for live progress UI)
 *   queryBars          — fetch stored bars for a ticker + date range
 *   exportCsv          — return CSV string for selected tickers + date range
 *   getUniverseSummary — bar counts per ticker across all universes
 *   resetJobs          — clear all jobs so a fresh download can start
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";
import { getDb } from "../db";
import { priceBars, priceDownloadJobs } from "../../drizzle/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { PCR_TICKERS } from "../../shared/tickers";
import { TICKER_UNIVERSE } from "../../shared/tickerUniverse";
import { SCANNER_TICKERS } from "../../shared/intradayTickers";
import { DUX_UNIVERSE } from "../../shared/duxUniverse";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface YahooBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

async function fetchYahoo5yr(symbol: string): Promise<YahooBar[]> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol,
        region: "US",
        interval: "1d",
        range: "5y",
        includeAdjustedClose: "true",
      },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return [];
    const { timestamp, indicators } = result;
    const quote = indicators?.quote?.[0] ?? {};
    const adjClose = indicators?.adjclose?.[0]?.adjclose ?? [];
    const bars: YahooBar[] = [];
    for (let i = 0; i < (timestamp?.length ?? 0); i++) {
      if (!quote.close?.[i]) continue;
      bars.push({
        date: new Date(timestamp[i] * 1000).toISOString().split("T")[0],
        open: quote.open?.[i] ?? quote.close[i],
        high: quote.high?.[i] ?? quote.close[i],
        low: quote.low?.[i] ?? quote.close[i],
        close: quote.close[i],
        volume: quote.volume?.[i] ?? 0,
        adjClose: adjClose[i] ?? undefined,
      });
    }
    return bars;
  } catch {
    return [];
  }
}

function getAllTickers(universes: string[]): { ticker: string; universe: string }[] {
  const seen = new Set<string>();
  const result: { ticker: string; universe: string }[] = [];

  const add = (ticker: string, universe: string) => {
    if (!seen.has(ticker)) {
      seen.add(ticker);
      result.push({ ticker, universe });
    }
  };

  if (universes.includes("all") || universes.includes("pcr")) {
    PCR_TICKERS.forEach((t) => add(t, "pcr"));
  }
  if (universes.includes("all") || universes.includes("ticker_universe")) {
    TICKER_UNIVERSE.forEach((t) => add(t.symbol, "ticker_universe"));
  }
  if (universes.includes("all") || universes.includes("intraday")) {
    SCANNER_TICKERS.forEach((t) => add(t.symbol, "intraday"));
  }
  if (universes.includes("all") || universes.includes("dux")) {
    DUX_UNIVERSE.forEach((t) => add(t.symbol, "dux"));
  }

  return result;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const historicalDataRouter = router({
  /**
   * Queue tickers for download and kick off the first batch.
   * The download runs server-side in the background (fire-and-forget per ticker).
   * Client polls getDownloadStatus to track progress.
   */
  startBulkDownload: protectedProcedure
    .input(
      z.object({
        universes: z
          .array(z.enum(["all", "pcr", "ticker_universe", "intraday", "dux"]))
          .default(["all"]),
        forceRefresh: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const tickers = getAllTickers(input.universes);
      const now = Date.now();

      const db = await getDb();
      if (!db) return { queued: 0 };
      // Upsert job rows — skip tickers already done unless forceRefresh
      for (const { ticker, universe } of tickers) {
        const existing = await db
          .select()
          .from(priceDownloadJobs)
          .where(eq(priceDownloadJobs.ticker, ticker))
          .limit(1);

        if (existing.length > 0) {
          if (!input.forceRefresh && existing[0].status === "done") continue;
          await db
            .update(priceDownloadJobs)
            .set({ status: "pending", barsDownloaded: 0, errorMsg: null, startedAt: null, completedAt: null, createdAt: now })
            .where(eq(priceDownloadJobs.ticker, ticker));
        } else {
          await db.insert(priceDownloadJobs).values({
            ticker,
            universe,
            status: "pending",
            barsDownloaded: 0,
            createdAt: now,
          });
        }
      }

      // Fire-and-forget: process all pending jobs sequentially in the background
      // We don't await this — it runs while the client polls for status
      processDownloadQueue().catch(() => {});

      return { queued: tickers.length };
    }),

  /**
   * Return per-ticker job status for the progress table.
   */
  getDownloadStatus: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { jobs: [], total: 0, done: 0, error: 0, running: 0, pending: 0 };
    const jobs = await db.select().from(priceDownloadJobs);
    const total = jobs.length;
    const done = jobs.filter((j: any) => j.status === "done").length;
    const error = jobs.filter((j: any) => j.status === "error").length;
    const running = jobs.filter((j: any) => j.status === "running").length;
    const pending = jobs.filter((j: any) => j.status === "pending").length;
    return { jobs, total, done, error, running, pending };
  }),

  /**
   * Query stored OHLCV bars for a single ticker + optional date range.
   */
  queryBars: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(20).toUpperCase(),
        from: z.string().optional(), // YYYY-MM-DD
        to: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(priceBars.ticker, input.ticker)];
      if (input.from) conditions.push(gte(priceBars.date, input.from));
      if (input.to) conditions.push(lte(priceBars.date, input.to));
      const bars = await db
        .select()
        .from(priceBars)
        .where(and(...conditions))
        .orderBy(priceBars.date);
      return bars;
    }),

  /**
   * Export bars for selected tickers as a CSV string.
   * Returns: ticker,date,open,high,low,close,volume,adj_close
   */
  exportCsv: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string().toUpperCase()).min(1).max(300),
        from: z.string().optional(),
        to: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { csv: "", rowCount: 0 };
      const conditions = [inArray(priceBars.ticker, input.tickers)];
      if (input.from) conditions.push(gte(priceBars.date, input.from));
      if (input.to) conditions.push(lte(priceBars.date, input.to));
      const bars = await db
        .select()
        .from(priceBars)
        .where(and(...conditions))
        .orderBy(priceBars.ticker, priceBars.date);

      const header = "ticker,date,open,high,low,close,volume,adj_close";
      const rows = (bars as any[]).map(
        (b) =>
          `${b.ticker},${b.date},${b.open},${b.high},${b.low},${b.close},${b.volume},${b.adjClose ?? ""}`
      );
      return { csv: [header, ...rows].join("\n"), rowCount: rows.length };
    }),

  /**
   * Summary: how many bars are stored per ticker, grouped by universe.
   */
  getUniverseSummary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // Bar counts per ticker
    const counts: { ticker: string; barCount: number; minDate: string; maxDate: string }[] = await db
      .select({
        ticker: priceBars.ticker,
        barCount: sql<number>`COUNT(*)`,
        minDate: sql<string>`MIN(${priceBars.date})`,
        maxDate: sql<string>`MAX(${priceBars.date})`,
      })
      .from(priceBars)
      .groupBy(priceBars.ticker) as any;

    const countMap = new Map(counts.map((c) => [c.ticker, c]));

    // Build per-universe summary
    const universes = [
      { name: "PCR (60)", key: "pcr", tickers: PCR_TICKERS as unknown as string[] },
      { name: "Ticker Universe (60)", key: "ticker_universe", tickers: TICKER_UNIVERSE.map((t) => t.symbol) },
      { name: "Intraday (49)", key: "intraday", tickers: SCANNER_TICKERS.map((t) => t.symbol) },
      { name: "Dux (103)", key: "dux", tickers: DUX_UNIVERSE.map((t) => t.symbol) },
    ];

    return universes.map((u) => ({
      ...u,
      tickerDetails: u.tickers.map((t) => ({
        ticker: t,
        barCount: countMap.get(t)?.barCount ?? 0,
        minDate: countMap.get(t)?.minDate ?? null,
        maxDate: countMap.get(t)?.maxDate ?? null,
      })),
      totalBars: u.tickers.reduce((sum, t) => sum + (countMap.get(t)?.barCount ?? 0), 0),
      downloadedCount: u.tickers.filter((t) => (countMap.get(t)?.barCount ?? 0) > 0).length,
    }));
  }),

  /**
   * Reset all download jobs so a fresh bulk download can start.
   */
  resetJobs: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { ok: false };
    await db.delete(priceDownloadJobs);
    return { ok: true };
  }),
});

// ─── Background download queue processor ──────────────────────────────────────
// Runs in the same Node.js process, processes one ticker at a time to avoid
// hammering the Yahoo Finance API. ~212 tickers × ~1s each ≈ 3-4 minutes total.

let isProcessing = false;

async function processDownloadQueue() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const db = await getDb();
    if (!db) { isProcessing = false; return; }
    while (true) {
      // Pick next pending job
      const pending = await db
        .select()
        .from(priceDownloadJobs)
        .where(eq(priceDownloadJobs.status, "pending"))
        .limit(1);
      if (pending.length === 0) break;

      const job = pending[0];
      const startedAt = Date.now();

      // Mark as running
      await db
        .update(priceDownloadJobs)
        .set({ status: "running", startedAt })
        .where(eq(priceDownloadJobs.ticker, job.ticker));

      try {
        const bars = await fetchYahoo5yr(job.ticker);
        if (bars.length === 0) throw new Error("No data returned");

        const now = Date.now();
        // Upsert bars (INSERT IGNORE on duplicate key)
        for (let i = 0; i < bars.length; i += 500) {
          const chunk = bars.slice(i, i + 500);
          await db
            .insert(priceBars)
            .values(
              chunk.map((b) => ({
                ticker: job.ticker,
                date: b.date,
                open: String(b.open),
                high: String(b.high),
                low: String(b.low),
                close: String(b.close),
                volume: b.volume,
                adjClose: b.adjClose != null ? String(b.adjClose) : null,
                interval: "1d",
                source: "yahoo",
                fetchedAt: now,
              }))
            )
            .onDuplicateKeyUpdate({
              set: {
                open: sql`VALUES(open)`,
                high: sql`VALUES(high)`,
                low: sql`VALUES(low)`,
                close: sql`VALUES(close)`,
                volume: sql`VALUES(volume)`,
                adjClose: sql`VALUES(adj_close)`,
                fetchedAt: sql`VALUES(fetched_at)`,
              },
            });
        }

        await db
          .update(priceDownloadJobs)
          .set({ status: "done", barsDownloaded: bars.length, completedAt: Date.now() })
          .where(eq(priceDownloadJobs.ticker, job.ticker));
      } catch (err: any) {
        await db
          .update(priceDownloadJobs)
          .set({ status: "error", errorMsg: err?.message ?? "Unknown error", completedAt: Date.now() })
          .where(eq(priceDownloadJobs.ticker, job.ticker));
      }

      // Small delay to be polite to the API
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    isProcessing = false;
  }
}
