/**
 * Decision Bench Router
 *
 * Two-stage pre-trade workflow for PitDesk:
 *   Stage 1 — Morning Scan: system recommends top 3 setups from the 20-ticker watchlist
 *   Stage 2 — Pre-Trade Gate: 5-gate GO/WAIT/NO-GO checklist before entering a trade
 *
 * Procedures:
 *   decisionBench.getWatchlist          — returns user's watchlist with sector tags
 *   decisionBench.seedDefaultWatchlist  — seeds the 20 default tickers for a new user
 *   decisionBench.addTicker             — add a ticker to the watchlist
 *   decisionBench.removeTicker          — remove a ticker from the watchlist
 *   decisionBench.checkSectorConcentration — warns if 2+ open positions in same sector
 *   decisionBench.runMorningScan        — scans watchlist, returns top 3 ranked setups
 *   decisionBench.runPreTradeGate       — 5-gate GO/WAIT/NO-GO for a specific trade
 *   decisionBench.saveVoiceJournal      — save transcribed voice note for a trade
 *   decisionBench.getVoiceJournals      — list voice journals (by ticker or all)
 *   decisionBench.uploadAudioAndTranscribe — upload audio blob URL + transcribe + AI extract
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  decisionBenchWatchlist,
  tradeVoiceJournal,
  playbookPositions,
} from "../../drizzle/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getTradierQuote, getTradierAtmChain } from "../tradierClient";
import { callDataApi } from "../_core/dataApi";
import { invokeLLM } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { storagePut } from "../storage";

// ─── Constants ─────────────────────────────────────────────────────────────────

const OWNER_USER_ID = 1; // Sri's DB user ID

// Sector map for the 20-ticker default watchlist
const DEFAULT_WATCHLIST: Array<{ ticker: string; sector: string; sortOrder: number }> = [
  { ticker: "SNDK",  sector: "Memory/Storage",    sortOrder: 1  },
  { ticker: "WDC",   sector: "Memory/Storage",    sortOrder: 2  },
  { ticker: "MU",    sector: "Memory/Storage",    sortOrder: 3  },
  { ticker: "DRAM",  sector: "Memory/Storage",    sortOrder: 4  },
  { ticker: "NVDA",  sector: "Memory/Storage",    sortOrder: 5  },
  { ticker: "ASML",  sector: "Semiconductors",    sortOrder: 6  },
  { ticker: "AMD",   sector: "Semiconductors",    sortOrder: 7  },
  { ticker: "APP",   sector: "AdTech/Mobile",     sortOrder: 8  },
  { ticker: "META",  sector: "Cloud/Software",    sortOrder: 9  },
  { ticker: "GOOGL", sector: "Cloud/Software",    sortOrder: 10 },
  { ticker: "MSFT",  sector: "Cloud/Software",    sortOrder: 11 },
  { ticker: "JPM",   sector: "Financials",        sortOrder: 12 },
  { ticker: "GS",    sector: "Financials",        sortOrder: 13 },
  { ticker: "NBIS",  sector: "Healthcare/Biotech", sortOrder: 14 },
  { ticker: "LLY",   sector: "Healthcare/Biotech", sortOrder: 15 },
  { ticker: "XOM",   sector: "Energy",            sortOrder: 16 },
  { ticker: "SPY",   sector: "ETF",               sortOrder: 17 },
  { ticker: "QQQ",   sector: "ETF",               sortOrder: 18 },
  { ticker: "MSTR",  sector: "High Volatility",   sortOrder: 19 },
  { ticker: "TSLA",  sector: "High Volatility",   sortOrder: 20 },
];

// Sector concentration limit: warn if user has 2+ open positions in same sector
const SECTOR_CONCENTRATION_WARN_AT = 2;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id: number;
  ticker: string;
  sector: string;
  isActive: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface MorningScanResult {
  ticker: string;
  sector: string;
  currentPrice: number | null;
  dayChangePct: number | null;
  ivRank: number | null;
  ivStatus: "green" | "yellow" | "red" | "gray";
  signalStrength: "STRONG" | "MODERATE" | "WATCH" | "NONE";
  signals: string[];
  recommendedStrategy: string;
  entryWindow: string;
  tradeRationale: string;
  score: number;
}

export interface PreTradeGateResult {
  ticker: string;
  strategy: string;
  overallVerdict: "GO" | "WAIT" | "NO-GO";
  gates: GateResult[];
  summary: string;
}

export interface GateResult {
  gateNumber: number;
  gateName: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// Known IV ranges for watchlist tickers (annualised decimal)
const IV_RANGES: Record<string, { ivLow: number; ivHigh: number }> = {
  SNDK:  { ivLow: 0.70, ivHigh: 1.20 },
  WDC:   { ivLow: 0.80, ivHigh: 1.00 },
  MU:    { ivLow: 0.55, ivHigh: 0.90 },
  DRAM:  { ivLow: 0.60, ivHigh: 1.00 },
  NVDA:  { ivLow: 0.60, ivHigh: 0.90 },
  ASML:  { ivLow: 0.40, ivHigh: 0.70 },
  AMD:   { ivLow: 0.55, ivHigh: 0.85 },
  APP:   { ivLow: 0.60, ivHigh: 1.00 },
  META:  { ivLow: 0.50, ivHigh: 0.80 },
  GOOGL: { ivLow: 0.35, ivHigh: 0.65 },
  MSFT:  { ivLow: 0.30, ivHigh: 0.55 },
  JPM:   { ivLow: 0.25, ivHigh: 0.50 },
  GS:    { ivLow: 0.30, ivHigh: 0.55 },
  NBIS:  { ivLow: 0.70, ivHigh: 1.30 },
  LLY:   { ivLow: 0.35, ivHigh: 0.65 },
  XOM:   { ivLow: 0.25, ivHigh: 0.50 },
  SPY:   { ivLow: 0.12, ivHigh: 0.30 },
  QQQ:   { ivLow: 0.15, ivHigh: 0.35 },
  MSTR:  { ivLow: 0.80, ivHigh: 1.50 },
  TSLA:  { ivLow: 0.80, ivHigh: 1.20 },
};

function pickStrategy(ivRank: number | null, dayChangePct: number | null): string {
  if (ivRank === null) return "Wait for data";
  if (ivRank >= 50) return "Naked Put / Strangle";
  if (ivRank >= 35) return "Iron Condor";
  if (ivRank >= 20) return "Credit Spread";
  return "Avoid premium selling — IV too low";
}

function scoreSetup(ivRank: number | null, dayChangePct: number | null, signals: string[]): number {
  let score = 0;
  if (ivRank !== null) score += Math.min(ivRank, 60);
  if (signals.length >= 3) score += 30;
  else if (signals.length >= 2) score += 20;
  else if (signals.length >= 1) score += 10;
  if (dayChangePct !== null && Math.abs(dayChangePct) < 2) score += 10; // stable price = good for premium selling
  return Math.min(100, score);
}

function signalStrength(score: number): "STRONG" | "MODERATE" | "WATCH" | "NONE" {
  if (score >= 70) return "STRONG";
  if (score >= 50) return "MODERATE";
  if (score >= 30) return "WATCH";
  return "NONE";
}

// ─── EMA helper (simple, from close prices) ───────────────────────────────────
function calcEma(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) { ema.push(prices[0]); continue; }
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const decisionBenchRouter = router({

  // ─── Watchlist CRUD ──────────────────────────────────────────────────────────

  getWatchlist: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(decisionBenchWatchlist)
      .where(and(
        eq(decisionBenchWatchlist.userId, ctx.user.id),
        eq(decisionBenchWatchlist.isActive, 1),
      ))
      .orderBy(decisionBenchWatchlist.sortOrder);
    return rows as WatchlistItem[];
  }),

  seedDefaultWatchlist: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const now = Date.now();
    // Check if already seeded
    const existing = await db
      .select()
      .from(decisionBenchWatchlist)
      .where(eq(decisionBenchWatchlist.userId, ctx.user.id));
    if (existing.length > 0) return { seeded: false, message: "Watchlist already exists" };
    // Insert all 20 default tickers
    await db.insert(decisionBenchWatchlist).values(
      DEFAULT_WATCHLIST.map(item => ({
        userId: ctx.user.id,
        ticker: item.ticker,
        sector: item.sector,
        isActive: 1,
        sortOrder: item.sortOrder,
        createdAt: now,
        updatedAt: now,
      }))
    );
    return { seeded: true, message: `Seeded ${DEFAULT_WATCHLIST.length} tickers` };
  }),

  addTicker: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10).toUpperCase(),
      sector: z.string().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      // Get current max sort order
      const existing = await db
        .select()
        .from(decisionBenchWatchlist)
        .where(eq(decisionBenchWatchlist.userId, ctx.user.id))
        .orderBy(desc(decisionBenchWatchlist.sortOrder));
      const maxOrder = existing.length > 0 ? (existing[0].sortOrder + 1) : 1;
      // Upsert (re-activate if soft-deleted)
      const dupe = existing.find(r => r.ticker === input.ticker.toUpperCase());
      if (dupe) {
        await db.update(decisionBenchWatchlist)
          .set({ isActive: 1, sector: input.sector, updatedAt: now })
          .where(eq(decisionBenchWatchlist.id, dupe.id));
        return { ok: true, id: dupe.id };
      }
      const [result] = await db.insert(decisionBenchWatchlist).values({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        sector: input.sector,
        isActive: 1,
        sortOrder: maxOrder,
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true, id: (result as any).insertId };
    }),

  removeTicker: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(decisionBenchWatchlist)
        .set({ isActive: 0, updatedAt: Date.now() })
        .where(and(
          eq(decisionBenchWatchlist.id, input.id),
          eq(decisionBenchWatchlist.userId, ctx.user.id),
        ));
      return { ok: true };
    }),

  // ─── Sector Concentration Check ──────────────────────────────────────────────

  checkSectorConcentration: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(10) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { warning: false, sector: null, openCount: 0, message: null };

      const upperTicker = input.ticker.toUpperCase();

      // Find sector for this ticker in the watchlist
      const watchlistRow = await db
        .select()
        .from(decisionBenchWatchlist)
        .where(and(
          eq(decisionBenchWatchlist.userId, ctx.user.id),
          eq(decisionBenchWatchlist.ticker, upperTicker),
          eq(decisionBenchWatchlist.isActive, 1),
        ));

      // If not in watchlist, try to find sector from default map
      let sector: string | null = null;
      if (watchlistRow.length > 0) {
        sector = watchlistRow[0].sector;
      } else {
        const defaultEntry = DEFAULT_WATCHLIST.find(d => d.ticker === upperTicker);
        sector = defaultEntry?.sector ?? null;
      }

      if (!sector) return { warning: false, sector: null, openCount: 0, message: null };

      // Find all tickers in the same sector from the watchlist
      const sectorTickers = await db
        .select()
        .from(decisionBenchWatchlist)
        .where(and(
          eq(decisionBenchWatchlist.userId, ctx.user.id),
          eq(decisionBenchWatchlist.sector, sector),
          eq(decisionBenchWatchlist.isActive, 1),
        ));
      const sectorTickerList = sectorTickers.map(r => r.ticker);

      // Count open positions in that sector
      const openPositions = await db
        .select()
        .from(playbookPositions)
        .where(and(
          eq(playbookPositions.userId, OWNER_USER_ID),
          eq(playbookPositions.status, "open"),
          inArray(playbookPositions.ticker, sectorTickerList),
        ));

      const openCount = openPositions.length;
      const warning = openCount >= SECTOR_CONCENTRATION_WARN_AT;

      return {
        warning,
        sector,
        openCount,
        sectorTickers: sectorTickerList,
        openTickers: openPositions.map(p => p.ticker),
        message: warning
          ? `Sector concentration alert: you already have ${openCount} open position${openCount > 1 ? "s" : ""} in ${sector}. Adding ${upperTicker} would exceed the 2-position limit.`
          : null,
      };
    }),

  // ─── Morning Scan ─────────────────────────────────────────────────────────────

  runMorningScan: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get user's watchlist
    const watchlist = await db
      .select()
      .from(decisionBenchWatchlist)
      .where(and(
        eq(decisionBenchWatchlist.userId, ctx.user.id),
        eq(decisionBenchWatchlist.isActive, 1),
      ))
      .orderBy(decisionBenchWatchlist.sortOrder);

    if (watchlist.length === 0) {
      return { setups: [], scannedAt: new Date().toISOString(), message: "Watchlist is empty — seed it first." };
    }

    // Scan each ticker in parallel (with concurrency limit)
    const BATCH_SIZE = 5;
    const results: MorningScanResult[] = [];

    for (let i = 0; i < watchlist.length; i += BATCH_SIZE) {
      const batch = watchlist.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ ticker, sector }) => {
          try {
            const quote = await getTradierQuote(ticker);
            const price = quote?.last ?? null;
            const dayChangePct = quote?.change_percentage ?? null;

            // Get ATM IV
            let ivRank: number | null = null;
            let ivVal: number | null = null;
            if (price) {
              const chain = await getTradierAtmChain(ticker, price);
              const atmContracts = [
                ...(chain?.calls ?? []),
                ...(chain?.puts ?? []),
              ].filter(c => c.greeks?.mid_iv && c.greeks.mid_iv > 0);
              if (atmContracts.length > 0) {
                const sum = atmContracts.reduce((acc, c) => acc + (c.greeks?.mid_iv ?? 0), 0);
                ivVal = sum / atmContracts.length;
                const range = IV_RANGES[ticker];
                if (range) ivRank = computeIvRank(ivVal, range.ivLow, range.ivHigh);
              }
            }

            // Build signals list
            const signals: string[] = [];
            if (ivRank !== null && ivRank >= 40) signals.push(`IV Rank ${ivRank}% — premium selling window`);
            if (dayChangePct !== null && Math.abs(dayChangePct) < 1.5) signals.push("Price stable — good for range-bound strategies");
            if (dayChangePct !== null && dayChangePct < -3) signals.push("Down move — elevated put premium, consider naked put");
            if (dayChangePct !== null && dayChangePct > 3) signals.push("Up move — elevated call premium, consider naked call");

            // Try to get EMA trend from daily bars
            try {
              const barsResp = await callDataApi("YahooFinance/get_stock_chart", {
                query: { symbol: ticker, region: "US", interval: "1d", range: "6mo", includeAdjustedClose: "true" },
              });
              const bars = (barsResp as any)?.chart?.result?.[0];
              if (bars) {
                const closes: number[] = bars.indicators?.quote?.[0]?.close ?? [];
                const validCloses = closes.filter((c: number) => c != null && !isNaN(c));
                if (validCloses.length >= 50) {
                  const ema50 = calcEma(validCloses, 50);
                  const ema200 = calcEma(validCloses, 200);
                  const lastClose = validCloses[validCloses.length - 1];
                  const lastEma50 = ema50[ema50.length - 1];
                  const lastEma200 = ema200[ema200.length - 1];
                  if (lastClose > lastEma50 && lastEma50 > lastEma200) {
                    signals.push("Uptrend confirmed: price > 50 EMA > 200 EMA");
                  } else if (lastClose < lastEma50 && lastEma50 < lastEma200) {
                    signals.push("Downtrend: price < 50 EMA < 200 EMA — caution");
                  }
                }
              }
            } catch {
              // EMA data not critical — skip
            }

            const recommendedStrategy = pickStrategy(ivRank, dayChangePct);
            const score = scoreSetup(ivRank, dayChangePct, signals);
            const strength = signalStrength(score);

            return {
              ticker,
              sector,
              currentPrice: price,
              dayChangePct,
              ivRank,
              ivStatus: ivStatus(ivRank),
              signalStrength: strength,
              signals,
              recommendedStrategy,
              entryWindow: "10:00–11:00 AM ET",
              tradeRationale: signals.length > 0 ? signals[0] : "No clear signal — skip today",
              score,
            } satisfies MorningScanResult;
          } catch {
            return {
              ticker,
              sector,
              currentPrice: null,
              dayChangePct: null,
              ivRank: null,
              ivStatus: "gray" as const,
              signalStrength: "NONE" as const,
              signals: [],
              recommendedStrategy: "Data unavailable",
              entryWindow: "10:00–11:00 AM ET",
              tradeRationale: "Could not fetch data",
              score: 0,
            } satisfies MorningScanResult;
          }
        })
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled") results.push(r.value);
      }
    }

    // Sort by score descending, return top 3
    results.sort((a, b) => b.score - a.score);
    const top3 = results.slice(0, 3);

    return {
      setups: top3,
      allResults: results,
      scannedAt: new Date().toISOString(),
      message: top3.length > 0
        ? `Top ${top3.length} setup${top3.length > 1 ? "s" : ""} identified from ${watchlist.length} tickers`
        : "No strong setups today — consider sitting out",
    };
  }),

  // ─── Pre-Trade Gate (5-gate GO/WAIT/NO-GO) ───────────────────────────────────

  runPreTradeGate: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10),
      strategy: z.enum(["iron_condor", "strangle", "naked_put", "naked_call", "credit_spread", "other"]),
      entryTime: z.string().optional(), // "HH:MM" in ET — for time gate
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const ticker = input.ticker.toUpperCase();
      const gates: GateResult[] = [];

      // ── Gate 1: Market Context ─────────────────────────────────────────────
      let spyQuote: { last: number; change_percentage: number } | null = null;
      let vixLevel: number | null = null;
      try {
        spyQuote = await getTradierQuote("SPY");
        const vixQuote = await getTradierQuote("VIX");
        vixLevel = vixQuote?.last ?? null;
      } catch { /* non-fatal */ }

      const spyChange = spyQuote?.change_percentage ?? null;
      let gate1Status: "PASS" | "WARN" | "FAIL" = "PASS";
      let gate1Detail = "";
      if (vixLevel !== null && vixLevel > 30) {
        gate1Status = "WARN";
        gate1Detail = `VIX at ${vixLevel.toFixed(1)} — elevated fear. Reduce size or skip.`;
      } else if (spyChange !== null && spyChange < -1.5) {
        gate1Status = "WARN";
        gate1Detail = `SPY down ${Math.abs(spyChange).toFixed(1)}% — market weakness. Prefer puts or wait.`;
      } else {
        gate1Detail = `Market context OK. VIX: ${vixLevel !== null ? vixLevel.toFixed(1) : "N/A"}. SPY: ${spyChange !== null ? (spyChange > 0 ? "+" : "") + spyChange.toFixed(1) + "%" : "N/A"}.`;
      }
      gates.push({ gateNumber: 1, gateName: "Market Context", status: gate1Status, detail: gate1Detail });

      // ── Gate 2: Technical Setup ────────────────────────────────────────────
      let gate2Status: "PASS" | "WARN" | "FAIL" = "PASS";
      let gate2Detail = "";
      try {
        const quote = await getTradierQuote(ticker);
        const price = quote?.last ?? null;
        const dayChange = quote?.change_percentage ?? null;
        if (!price) {
          gate2Status = "WARN";
          gate2Detail = `Could not fetch price for ${ticker}. Verify ticker is valid.`;
        } else {
          // Check EMA trend from daily bars
          const barsResp = await callDataApi("YahooFinance/get_stock_chart", {
            query: { symbol: ticker, region: "US", interval: "1d", range: "6mo", includeAdjustedClose: "true" },
          });
          const bars = (barsResp as any)?.chart?.result?.[0];
          if (bars) {
            const closes: number[] = (bars.indicators?.quote?.[0]?.close ?? []).filter((c: number) => c != null && !isNaN(c));
            if (closes.length >= 50) {
              const ema50 = calcEma(closes, 50);
              const ema200 = calcEma(closes, 200);
              const lastClose = closes[closes.length - 1];
              const lastEma50 = ema50[ema50.length - 1];
              const lastEma200 = ema200[ema200.length - 1];
              const inUptrend = lastClose > lastEma50 && lastEma50 > lastEma200;
              const inDowntrend = lastClose < lastEma50 && lastEma50 < lastEma200;
              if (inUptrend) {
                gate2Detail = `Uptrend confirmed: ${ticker} @ $${price.toFixed(2)} > 50 EMA > 200 EMA. Bullish bias.`;
              } else if (inDowntrend) {
                gate2Status = "WARN";
                gate2Detail = `Downtrend: ${ticker} @ $${price.toFixed(2)} < 50 EMA < 200 EMA. Prefer puts or avoid.`;
              } else {
                gate2Detail = `${ticker} @ $${price.toFixed(2)} — mixed trend. Check chart before entering.`;
              }
            } else {
              gate2Detail = `${ticker} @ $${price.toFixed(2)}. Insufficient history for EMA check.`;
            }
          } else {
            gate2Detail = `${ticker} @ $${price.toFixed(2)}. Could not load daily bars for EMA check.`;
          }
          if (dayChange !== null && Math.abs(dayChange) > 5) {
            gate2Status = "WARN";
            gate2Detail += ` WARNING: ${Math.abs(dayChange).toFixed(1)}% move today — avoid entering on big day moves.`;
          }
        }
      } catch {
        gate2Status = "WARN";
        gate2Detail = "Technical data unavailable. Manually verify setup before entering.";
      }
      gates.push({ gateNumber: 2, gateName: "Technical Setup", status: gate2Status, detail: gate2Detail });

      // ── Gate 3: IV / Catalyst Check ────────────────────────────────────────
      let gate3Status: "PASS" | "WARN" | "FAIL" = "PASS";
      let gate3Detail = "";
      try {
        const quote = await getTradierQuote(ticker);
        const price = quote?.last ?? null;
        if (price) {
          const chain = await getTradierAtmChain(ticker, price);
          const atmContracts = [
            ...(chain?.calls ?? []),
            ...(chain?.puts ?? []),
          ].filter(c => c.greeks?.mid_iv && c.greeks.mid_iv > 0);
          if (atmContracts.length > 0) {
            const sum = atmContracts.reduce((acc, c) => acc + (c.greeks?.mid_iv ?? 0), 0);
            const iv = sum / atmContracts.length;
            const ivPct = (iv * 100).toFixed(1);
            const range = IV_RANGES[ticker];
            if (range) {
              const rank = computeIvRank(iv, range.ivLow, range.ivHigh);
              if (rank >= 40) {
                gate3Detail = `IV Rank ${rank}% — premium selling window open. ATM IV: ${ivPct}%.`;
              } else if (rank >= 20) {
                gate3Status = "WARN";
                gate3Detail = `IV Rank ${rank}% — borderline. ATM IV: ${ivPct}%. Consider smaller size.`;
              } else {
                gate3Status = "FAIL";
                gate3Detail = `IV Rank ${rank}% — too low for premium selling. ATM IV: ${ivPct}%. Wait for IV expansion.`;
              }
            } else {
              gate3Detail = `ATM IV: ${ivPct}%. No IV range baseline for ${ticker} — use judgment.`;
            }
          } else {
            gate3Status = "WARN";
            gate3Detail = "Could not compute ATM IV. Verify options liquidity manually.";
          }
        } else {
          gate3Status = "WARN";
          gate3Detail = "Price unavailable — cannot check IV.";
        }
      } catch {
        gate3Status = "WARN";
        gate3Detail = "IV data unavailable. Check IV rank manually before entering.";
      }
      gates.push({ gateNumber: 3, gateName: "IV / Catalyst Check", status: gate3Status, detail: gate3Detail });

      // ── Gate 4: Strategy Math ──────────────────────────────────────────────
      let gate4Status: "PASS" | "WARN" | "FAIL" = "PASS";
      let gate4Detail = "";
      const strategyRules: Record<string, string> = {
        iron_condor:   "Iron Condor: IVR ≥ 30, sell 1σ wings, max risk ≤ 2× credit, exit at 50% profit or 2× loss.",
        strangle:      "Strangle: IVR ≥ 40, sell 1σ OTM call + put, exit at 50% profit or 2× loss.",
        naked_put:     "Naked Put: IVR ≥ 35, sell 0.20–0.30 delta put, exit at 50% profit or 2× loss. Enter 10–11 AM ET only.",
        naked_call:    "Naked Call: IVR ≥ 40, sell 0.20–0.30 delta call, exit at 50% profit or 2× loss. Enter 10–11 AM ET only.",
        credit_spread: "Credit Spread: IVR ≥ 25, sell 0.30 delta, buy 0.10 delta wing, R:R ≥ 1:2.",
        other:         "Custom strategy — verify R:R ≥ 1:2 and max risk ≤ 2% of account.",
      };
      gate4Detail = strategyRules[input.strategy] ?? "Verify strategy rules before entering.";
      // Check if IV gate failed — if so, strategy math gate is also a warning
      if (gate3Status === "FAIL") {
        gate4Status = "WARN";
        gate4Detail += " IV too low — strategy math may not work. Reconsider.";
      }
      gates.push({ gateNumber: 4, gateName: "Strategy Math", status: gate4Status, detail: gate4Detail });

      // ── Gate 5: Playbook Rules ─────────────────────────────────────────────
      let gate5Status: "PASS" | "WARN" | "FAIL" = "PASS";
      let gate5Detail = "";

      // Check entry time (must be 10:00–11:00 AM ET for naked puts/calls)
      const entryTime = input.entryTime;
      if (entryTime && (input.strategy === "naked_put" || input.strategy === "naked_call")) {
        const [h, m] = entryTime.split(":").map(Number);
        const minutesSinceMidnight = h * 60 + m;
        const openWindow = 10 * 60;   // 10:00 AM
        const closeWindow = 11 * 60;  // 11:00 AM
        if (minutesSinceMidnight < openWindow || minutesSinceMidnight > closeWindow) {
          gate5Status = "WARN";
          gate5Detail = `Entry time ${entryTime} ET is outside the 10:00–11:00 AM window. Playbook rule: enter naked puts/calls only in this window.`;
        } else {
          gate5Detail = `Entry time ${entryTime} ET is within the 10:00–11:00 AM window. ✓`;
        }
      }

      // Check sector concentration
      const watchlistRow = await db
        .select()
        .from(decisionBenchWatchlist)
        .where(and(
          eq(decisionBenchWatchlist.userId, ctx.user.id),
          eq(decisionBenchWatchlist.ticker, ticker),
          eq(decisionBenchWatchlist.isActive, 1),
        ));
      const defaultEntry = DEFAULT_WATCHLIST.find(d => d.ticker === ticker);
      const sector = watchlistRow.length > 0 ? watchlistRow[0].sector : (defaultEntry?.sector ?? null);

      if (sector) {
        const sectorTickers = await db
          .select()
          .from(decisionBenchWatchlist)
          .where(and(
            eq(decisionBenchWatchlist.userId, ctx.user.id),
            eq(decisionBenchWatchlist.sector, sector),
            eq(decisionBenchWatchlist.isActive, 1),
          ));
        const sectorTickerList = sectorTickers.map(r => r.ticker);
        if (sectorTickerList.length > 0) {
          const openInSector = await db
            .select()
            .from(playbookPositions)
            .where(and(
              eq(playbookPositions.userId, OWNER_USER_ID),
              eq(playbookPositions.status, "open"),
              inArray(playbookPositions.ticker, sectorTickerList),
            ));
          if (openInSector.length >= SECTOR_CONCENTRATION_WARN_AT) {
            gate5Status = "WARN";
            gate5Detail += ` Sector concentration: ${openInSector.length} open position${openInSector.length > 1 ? "s" : ""} already in ${sector}. Max 2 per sector.`;
          } else {
            gate5Detail += gate5Detail ? ` Sector OK: ${openInSector.length}/2 positions in ${sector}.` : `Sector OK: ${openInSector.length}/2 positions in ${sector}.`;
          }
        }
      }

      if (!gate5Detail) gate5Detail = "Playbook rules check passed.";
      gates.push({ gateNumber: 5, gateName: "Playbook Rules", status: gate5Status, detail: gate5Detail });

      // ── Overall Verdict ────────────────────────────────────────────────────
      const failCount = gates.filter(g => g.status === "FAIL").length;
      const warnCount = gates.filter(g => g.status === "WARN").length;
      let overallVerdict: "GO" | "WAIT" | "NO-GO";
      let summary: string;

      if (failCount >= 1) {
        overallVerdict = "NO-GO";
        summary = `${failCount} gate${failCount > 1 ? "s" : ""} failed. Do not enter this trade.`;
      } else if (warnCount >= 2) {
        overallVerdict = "WAIT";
        summary = `${warnCount} warnings. Conditions are borderline — wait for a cleaner setup.`;
      } else if (warnCount === 1) {
        overallVerdict = "WAIT";
        summary = "1 warning. Proceed with caution and smaller size.";
      } else {
        overallVerdict = "GO";
        summary = "All 5 gates passed. Setup looks clean — execute with discipline.";
      }

      return {
        ticker,
        strategy: input.strategy,
        overallVerdict,
        gates,
        summary,
      } satisfies PreTradeGateResult;
    }),

  // ─── Voice Trade Journal ──────────────────────────────────────────────────────

  uploadAudioAndTranscribe: protectedProcedure
    .input(z.object({
      audioDataUrl: z.string(), // base64 data URL or S3 URL
      ticker: z.string().min(1).max(10),
      strategy: z.string().optional(),
      tradeLogId: z.number().optional(),
      playbookPositionId: z.number().optional(),
      entryPrice: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Upload audio to S3 if it's a data URL
      let audioUrl = input.audioDataUrl;
      if (input.audioDataUrl.startsWith("data:")) {
        const [header, base64Data] = input.audioDataUrl.split(",");
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch?.[1] ?? "audio/webm";
        const ext = mimeType.split("/")[1] ?? "webm";
        const buffer = Buffer.from(base64Data, "base64");
        const { url } = await storagePut(
          `voice-journal/${ctx.user.id}/${Date.now()}.${ext}`,
          buffer,
          mimeType,
        );
        audioUrl = url;
      }

      // Transcribe audio
      const transcription = await transcribeAudio({
        audioUrl,
        language: "en",
        prompt: "Transcribe this trading voice note. The user is describing their trade rationale, risks, and market observations.",
      });

      if ("error" in transcription) {
        throw new Error(`Transcription failed: ${transcription.error}`);
      }

      const transcript = transcription.text;

      // AI extraction: rationale, risks, sentiment
      let aiRationale = "";
      let aiRisksIdentified = "";
      let aiSentiment: "confident" | "uncertain" | "hedged" = "uncertain";

      try {
        const aiResult = await invokeLLM({
          messages: [{
            role: "user",
            content: `You are a trading journal analyst. Extract structured information from this voice note transcript.

Transcript: "${transcript}"

Ticker: ${input.ticker.toUpperCase()}
Strategy: ${input.strategy ?? "unknown"}

Respond ONLY with a JSON object:
{
  "rationale": "1-2 sentences: WHY they made this trade (catalyst, setup, thesis)",
  "risks": "1-2 sentences: risks they mentioned or implied",
  "sentiment": "confident" | "uncertain" | "hedged"
}`,
          }],
          responseFormat: { type: "json_object" },
          maxTokens: 300,
        });
        const content = typeof aiResult.choices[0]?.message?.content === "string"
          ? aiResult.choices[0].message.content : "{}";
        const parsed = JSON.parse(content) as { rationale?: string; risks?: string; sentiment?: string };
        aiRationale = parsed.rationale ?? "";
        aiRisksIdentified = parsed.risks ?? "";
        if (["confident", "uncertain", "hedged"].includes(parsed.sentiment ?? "")) {
          aiSentiment = parsed.sentiment as "confident" | "uncertain" | "hedged";
        }
      } catch { /* non-fatal — save transcript even if AI extraction fails */ }

      // Save to DB
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const [result] = await db.insert(tradeVoiceJournal).values({
        userId: ctx.user.id,
        tradeLogId: input.tradeLogId ?? null,
        playbookPositionId: input.playbookPositionId ?? null,
        ticker: input.ticker.toUpperCase(),
        strategy: input.strategy ?? null,
        audioTranscript: transcript,
        aiRationale,
        aiRisksIdentified,
        aiSentiment,
        screenshotUrl: null,
        manualNote: null,
        entryPrice: input.entryPrice ? String(input.entryPrice) : null,
        recordedAt: now,
        createdAt: now,
      });

      return {
        id: (result as any).insertId,
        transcript,
        aiRationale,
        aiRisksIdentified,
        aiSentiment,
        audioUrl,
      };
    }),

  saveVoiceJournal: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(10),
      strategy: z.string().optional(),
      tradeLogId: z.number().optional(),
      playbookPositionId: z.number().optional(),
      audioTranscript: z.string().optional(),
      aiRationale: z.string().optional(),
      aiRisksIdentified: z.string().optional(),
      aiSentiment: z.enum(["confident", "uncertain", "hedged"]).optional(),
      screenshotUrl: z.string().optional(),
      manualNote: z.string().max(1024).optional(),
      entryPrice: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const [result] = await db.insert(tradeVoiceJournal).values({
        userId: ctx.user.id,
        tradeLogId: input.tradeLogId ?? null,
        playbookPositionId: input.playbookPositionId ?? null,
        ticker: input.ticker.toUpperCase(),
        strategy: input.strategy ?? null,
        audioTranscript: input.audioTranscript ?? null,
        aiRationale: input.aiRationale ?? null,
        aiRisksIdentified: input.aiRisksIdentified ?? null,
        aiSentiment: input.aiSentiment ?? null,
        screenshotUrl: input.screenshotUrl ?? null,
        manualNote: input.manualNote ?? null,
        entryPrice: input.entryPrice ? String(input.entryPrice) : null,
        recordedAt: now,
        createdAt: now,
      });
      return { id: (result as any).insertId, ok: true };
    }),

  getVoiceJournals: protectedProcedure
    .input(z.object({
      ticker: z.string().optional(),
      playbookPositionId: z.number().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(tradeVoiceJournal.userId, ctx.user.id)];
      if (input?.ticker) conditions.push(eq(tradeVoiceJournal.ticker, input.ticker.toUpperCase()));
      if (input?.playbookPositionId) conditions.push(eq(tradeVoiceJournal.playbookPositionId, input.playbookPositionId));
      return db
        .select()
        .from(tradeVoiceJournal)
        .where(and(...conditions))
        .orderBy(desc(tradeVoiceJournal.recordedAt))
        .limit(input?.limit ?? 20);
    }),
});
