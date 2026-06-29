/**
 * Dux Scanner Router — Steven Dux 5-Filter Small-Cap Scanner
 *
 * Filters:
 * 1. Up ≥ 20% for the day (change_percentage)
 * 2. Volume ≥ 1M shares (current volume, approximates pre-market + session)
 * 3. Price > $3
 * 4. Market cap < $1B (from static DUX_UNIVERSE metadata)
 * 5. Float < 100M shares (from static DUX_UNIVERSE metadata)
 *
 * Also provides:
 * - perfectTrader: compare actual morning session P&L vs ideal execution
 * - lastTradeResult: returns last trade outcome for size-down rule enforcement
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { morningSessionTrades } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { ENV } from "../_core/env";
import { DUX_UNIVERSE, BIOTECH_BLACKLIST, DUX_UNIVERSE_SYMBOLS } from "../../shared/duxUniverse";

const TRADIER_BASE = "https://api.tradier.com/v1";

// ─── Tradier multi-quote helper ───────────────────────────────────────────────

interface TradierQuoteRaw {
  symbol: string;
  last: number;
  change: number;
  change_percentage: number;
  volume: number;
  average_volume: number;
  prevclose: number;
  open: number;
  high: number;
  low: number;
  description: string;
}

async function fetchMultiQuote(symbols: string[]): Promise<TradierQuoteRaw[]> {
  const apiKey = ENV.tradierApiKey;
  if (!apiKey) throw new Error("TRADIER_API_KEY not configured");

  // Tradier allows up to 200 symbols per request
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 200) {
    chunks.push(symbols.slice(i, i + 200));
  }

  const results: TradierQuoteRaw[] = [];
  for (const chunk of chunks) {
    const url = `${TRADIER_BASE}/markets/quotes?symbols=${chunk.join(",")}&greeks=false`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!resp.ok) continue;
    const data = await resp.json() as { quotes?: { quote?: TradierQuoteRaw | TradierQuoteRaw[] } };
    const q = data?.quotes?.quote;
    if (!q) continue;
    const arr = Array.isArray(q) ? q : [q];
    results.push(...arr);
  }
  return results;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const duxScannerRouter = router({

  /**
   * Run the Dux 5-Filter Scanner
   * Returns tickers that pass all 5 criteria, sorted by gap% descending
   */
  scan: protectedProcedure.query(async () => {
    const quotes = await fetchMultiQuote(DUX_UNIVERSE_SYMBOLS);
    const metaMap = new Map(DUX_UNIVERSE.map(t => [t.symbol, t]));

    const results = quotes
      .filter(q => {
        if (!q || !q.symbol) return false;
        const meta = metaMap.get(q.symbol);
        if (!meta) return false;

        const price = q.last ?? 0;
        const gapPct = q.change_percentage ?? 0;
        const volume = q.volume ?? 0;

        // Apply all 5 Dux filters
        const filter1_gap = gapPct >= 20;           // Up ≥ 20%
        const filter2_vol = volume >= 1_000_000;    // Volume ≥ 1M
        const filter3_price = price > 3;            // Price > $3
        const filter4_mktcap = meta.mktCapM < 1000; // Market cap < $1B
        const filter5_float = meta.floatM < 100;    // Float < 100M

        return filter1_gap && filter2_vol && filter3_price && filter4_mktcap && filter5_float;
      })
      .map(q => {
        const meta = metaMap.get(q.symbol)!;
        const isBiotech = BIOTECH_BLACKLIST.has(q.symbol);
        const volumeRatio = q.average_volume > 0 ? q.volume / q.average_volume : 0;

        return {
          symbol: q.symbol,
          name: meta.name,
          sector: meta.sector,
          price: q.last,
          prevClose: q.prevclose,
          gapPct: q.change_percentage,
          volume: q.volume,
          avgVolume: q.average_volume,
          volumeRatio: parseFloat(volumeRatio.toFixed(1)),
          mktCapM: meta.mktCapM,
          floatM: meta.floatM,
          high: q.high,
          low: q.low,
          isBiotech,
          // Dux short bias: high gap + high volume = retail exhaustion approaching
          shortBias: q.change_percentage >= 40 ? "STRONG" as const :
                     q.change_percentage >= 25 ? "MODERATE" as const : "WATCH" as const,
          // All 5 filters
          filters: {
            gap: true,
            volume: true,
            price: true,
            mktCap: true,
            float: true,
          },
        };
      })
      .sort((a, b) => b.gapPct - a.gapPct);

    return {
      results,
      scannedAt: new Date().toISOString(),
      universeSize: DUX_UNIVERSE_SYMBOLS.length,
      passCount: results.length,
    };
  }),

  /**
   * Near-miss scan — tickers that pass 4 of 5 filters (gap ≥10% instead of 20%)
   * Useful for watchlist building before the gap materializes
   */
  nearMiss: protectedProcedure.query(async () => {
    const quotes = await fetchMultiQuote(DUX_UNIVERSE_SYMBOLS);
    const metaMap = new Map(DUX_UNIVERSE.map(t => [t.symbol, t]));

    const results = quotes
      .filter(q => {
        if (!q || !q.symbol) return false;
        const meta = metaMap.get(q.symbol);
        if (!meta) return false;

        const price = q.last ?? 0;
        const gapPct = q.change_percentage ?? 0;
        const volume = q.volume ?? 0;

        // Relaxed: gap ≥10%, volume ≥500K, price >$2, mktcap <$1B, float <100M
        return gapPct >= 10 && gapPct < 20 &&
               volume >= 500_000 &&
               price > 2 &&
               meta.mktCapM < 1000 &&
               meta.floatM < 100;
      })
      .map(q => {
        const meta = metaMap.get(q.symbol)!;
        const isBiotech = BIOTECH_BLACKLIST.has(q.symbol);
        return {
          symbol: q.symbol,
          name: meta.name,
          sector: meta.sector,
          price: q.last,
          gapPct: q.change_percentage,
          volume: q.volume,
          avgVolume: q.average_volume,
          mktCapM: meta.mktCapM,
          floatM: meta.floatM,
          isBiotech,
          missingFilter: "gap_under_20" as const,
        };
      })
      .sort((a, b) => b.gapPct - a.gapPct)
      .slice(0, 20);

    return results;
  }),

  /**
   * Perfect Trader Calculator
   * Compares actual morning session P&L vs ideal execution
   * Ideal: entry at OR high (entryPrice), exit at exactly 2× range (targetPrice)
   */
  perfectTrader: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const trades = await db
        .select()
        .from(morningSessionTrades)
        .where(eq(morningSessionTrades.userId, ctx.user.id))
        .orderBy(desc(morningSessionTrades.enteredAt))
        .limit(input.days * 5); // Approx 5 trades/day max

      const closedTrades = trades.filter(t => t.status !== "ACTIVE" && t.exitPrice != null);

      let actualPnl = 0;
      let idealPnl = 0;
      const tradeComparisons: Array<{
        id: number;
        date: string;
        ticker: string;
        actualPnl: number;
        idealPnl: number;
        executionScore: number;
        gap: number;
      }> = [];

      for (const t of closedTrades) {
        const entry = parseFloat(String(t.entryPrice));
        const stop = parseFloat(String(t.stopPrice));
        const target = parseFloat(String(t.targetPrice));
        const exit = parseFloat(String(t.exitPrice!));
        const shares = t.shares;

        const actual = t.direction === "LONG"
          ? (exit - entry) * shares
          : (entry - exit) * shares;

        // Ideal: always exit at target (2× range)
        const ideal = t.direction === "LONG"
          ? (target - entry) * shares
          : (entry - target) * shares;

        // Execution score: how close to ideal (capped at 100%)
        const execScore = ideal !== 0
          ? Math.min(100, Math.max(0, Math.round((actual / ideal) * 100)))
          : 100;

        actualPnl += actual;
        idealPnl += ideal;

        tradeComparisons.push({
          id: t.id,
          date: t.date,
          ticker: t.ticker,
          actualPnl: parseFloat(actual.toFixed(2)),
          idealPnl: parseFloat(ideal.toFixed(2)),
          executionScore: execScore,
          gap: parseFloat((ideal - actual).toFixed(2)),
        });
      }

      const overallExecutionScore = idealPnl !== 0
        ? Math.min(100, Math.max(0, Math.round((actualPnl / idealPnl) * 100)))
        : 100;

      const avgExecScore = tradeComparisons.length > 0
        ? Math.round(tradeComparisons.reduce((s, t) => s + t.executionScore, 0) / tradeComparisons.length)
        : 100;

      return {
        actualPnl: parseFloat(actualPnl.toFixed(2)),
        idealPnl: parseFloat(idealPnl.toFixed(2)),
        leftOnTable: parseFloat((idealPnl - actualPnl).toFixed(2)),
        overallExecutionScore,
        avgExecScore,
        tradeCount: closedTrades.length,
        trades: tradeComparisons,
      };
    }),

  /**
   * Last Trade Result — for Size-Down Rule enforcement
   * Returns the most recent closed trade and whether it was a loss
   * If loss: recommends 50% size reduction
   */
  lastTradeResult: protectedProcedure
    .input(z.object({ date: z.string().length(10) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get today's trades ordered by entry time
      const todayTrades = await db
        .select()
        .from(morningSessionTrades)
        .where(
          and(
            eq(morningSessionTrades.userId, ctx.user.id),
            eq(morningSessionTrades.date, input.date)
          )
        )
        .orderBy(desc(morningSessionTrades.enteredAt));

      // Find the most recent CLOSED trade today
      const lastClosed = todayTrades.find(t => t.status !== "ACTIVE");

      if (!lastClosed) {
        return { hasPriorTrade: false, isLoss: false, sizeDownPct: 0, lastTrade: null };
      }

      const isLoss = lastClosed.status === "LOSS";
      const pnl = parseFloat(String(lastClosed.pnl ?? "0"));

      return {
        hasPriorTrade: true,
        isLoss,
        sizeDownPct: isLoss ? 50 : 0,
        lastTrade: {
          ticker: lastClosed.ticker,
          status: lastClosed.status,
          pnl,
          setupType: lastClosed.setupType,
        },
      };
    }),
});
