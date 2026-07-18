/**
 * scheduledPriceSync.ts
 *
 * Heartbeat handler: POST /api/scheduled/price-sync
 * Runs daily at 4:45 PM ET (21:45 UTC) Mon–Fri.
 *
 * Fetches the latest daily OHLCV bar for all tracked tickers
 * and upserts into price_bars. This keeps local data fresh so
 * backtesting and Quick Proof bars run off local DB — no API latency.
 *
 * Tickers synced: PCR_TICKERS (60) + top watchlist tickers
 */
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { priceBars } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { callDataApi } from "./_core/dataApi";
import { PCR_TICKERS } from "../shared/tickers";

// Top watchlist tickers always synced regardless of PCR list
const WATCHLIST_TICKERS = [
  "SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR",
  "META", "GOOGL", "NFLX", "AMZN", "SOFI", "INTC", "HOOD",
  "SOXL", "IONQ", "RGTI", "RKLB", "APP", "UNH", "BE", "FAS", "TEM",
  "SPY", "QQQ", "IWM", "VIX",
];

function getAllSyncTickers(): string[] {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const t of [...WATCHLIST_TICKERS, ...PCR_TICKERS]) {
    if (!seen.has(t)) { seen.add(t); all.push(t); }
  }
  return all;
}

interface YahooBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

async function fetchRecentBars(symbol: string, days = 5): Promise<YahooBar[]> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol,
        region: "US",
        interval: "1d",
        range: `${days}d`,
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

export async function priceSyncHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "db unavailable" });

    const tickers = getAllSyncTickers();
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const ticker of tickers) {
      try {
        // Fetch last 5 days to ensure we get today's bar even with minor delays
        const bars = await fetchRecentBars(ticker, 5);
        if (bars.length === 0) { skipped++; continue; }

        for (const bar of bars) {
          await db
            .insert(priceBars)
            .values({
              ticker,
              date: bar.date,
              open: String(bar.open),
              high: String(bar.high),
              low: String(bar.low),
              close: String(bar.close),
              volume: bar.volume,
              adjClose: bar.adjClose != null ? String(bar.adjClose) : null,
              interval: "1d",
              source: "yahoo",
              fetchedAt: now,
            })
            .onDuplicateKeyUpdate({
              set: {
                open: sql`VALUES(open)`,
                high: sql`VALUES(high)`,
                low: sql`VALUES(low)`,
                close: sql`VALUES(close)`,
                volume: sql`VALUES(volume)`,
                adjClose: sql`VALUES(adj_close)`,
                fetchedAt: now,
              },
            })
            .catch(() => {}); // ignore duplicate key errors silently
        }

        // Count today's bar as synced
        if (bars.some(b => b.date === today)) synced++;
        else skipped++;

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 80));
      } catch {
        errors++;
      }
    }

    console.log(`[PriceSync] ${today}: synced=${synced} skipped=${skipped} errors=${errors} tickers=${tickers.length}`);
    return res.json({ ok: true, date: today, synced, skipped, errors, total: tickers.length });
  } catch (err: any) {
    console.error("[PriceSync] handler error:", err);
    return res.status(500).json({
      error: err?.message ?? "unknown",
      stack: err?.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
