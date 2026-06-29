/**
 * Pre-Market Checklist Router
 *
 * Procedures:
 *   preMarket.todayChecklist — get or auto-create today's 8-item checklist
 *   preMarket.completeItem   — mark an item completed (with optional mindset score)
 *   preMarket.uncompleteItem — unmark an item
 *   preMarket.resetDay       — reset all items for today
 *   preMarket.history        — last 30 days completion rate
 *   preMarket.intel          — live intelligence data for all 8 checklist items
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  drawdownSettings,
  liquidityZones,
  positions,
  preMarketChecklistItems,
  swingWatchlist,
  uploadedTrades,
} from "../../drizzle/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getTradierQuote } from "../tradierClient";
import { ENV } from "../_core/env";

// ─── Default checklist items ──────────────────────────────────────────────────

const DEFAULT_ITEMS = [
  { key: "vix_check",        label: "VIX Level — check and confirm trading size" },
  { key: "spy_bias",         label: "SPY/QQQ Bias — pre-market direction confirmed" },
  { key: "gappers",          label: "Top Gappers — catalyst, float, volume reviewed" },
  { key: "account_gate",     label: "Account P&L Gate — daily loss limit not hit" },
  { key: "setups_confirmed", label: "Swing Watchlist — setups still valid" },
  { key: "risk_sizing",      label: "Risk Sizing — max risk per trade calculated" },
  { key: "liquidity_zones",  label: "Liquidity Zones — active zones near price reviewed" },
  { key: "mindset",          label: "Mindset Check — calm, rested, no FOMO" },
];

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function weekStartET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // Monday
  et.setDate(et.getDate() + diff);
  return et.toLocaleDateString("en-CA");
}

// ─── Tradier multi-quote helper ───────────────────────────────────────────────

async function getTradierMultiQuote(symbols: string[]): Promise<Record<string, { last: number; prevclose: number; change_percentage: number }>> {
  const apiKey = ENV.tradierApiKey;
  if (!apiKey || !symbols.length) return {};
  try {
    const url = `https://api.tradier.com/v1/markets/quotes?symbols=${symbols.join(",")}&greeks=false`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!resp.ok) return {};
    const data = await resp.json() as { quotes?: { quote?: unknown } };
    const raw = data?.quotes?.quote;
    if (!raw) return {};
    const arr = Array.isArray(raw) ? raw : [raw];
    const result: Record<string, { last: number; prevclose: number; change_percentage: number }> = {};
    for (const q of arr as Array<{ symbol: string; last: number; prevclose: number; change_percentage: number }>) {
      if (q?.symbol) result[q.symbol] = { last: q.last ?? 0, prevclose: q.prevclose ?? 0, change_percentage: q.change_percentage ?? 0 };
    }
    return result;
  } catch {
    return {};
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const preMarketChecklistRouter = router({

  todayChecklist: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { date: todayET(), items: [], completedCount: 0, totalCount: DEFAULT_ITEMS.length };

      const date = todayET();

      const existing = await db
        .select()
        .from(preMarketChecklistItems)
        .where(and(
          eq(preMarketChecklistItems.userId, ctx.user.id),
          eq(preMarketChecklistItems.date, date),
        ));

      if (existing.length === 0) {
        await db.insert(preMarketChecklistItems).values(
          DEFAULT_ITEMS.map(item => ({
            userId: ctx.user.id,
            date,
            itemKey: item.key,
            label: item.label,
            completed: false,
          }))
        );
      }

      const items = await db
        .select()
        .from(preMarketChecklistItems)
        .where(and(
          eq(preMarketChecklistItems.userId, ctx.user.id),
          eq(preMarketChecklistItems.date, date),
        ))
        .orderBy(preMarketChecklistItems.id);

      return {
        date,
        items: items.map(i => ({
          id: i.id,
          itemKey: i.itemKey,
          label: i.label,
          completed: i.completed,
          completedAt: i.completedAt,
          mindsetScore: (i as { mindsetScore?: number }).mindsetScore ?? null,
        })),
        completedCount: items.filter(i => i.completed).length,
        totalCount: items.length,
      };
    }),

  completeItem: protectedProcedure
    .input(z.object({ id: z.number(), mindsetScore: z.number().min(1).max(5).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(preMarketChecklistItems)
        .set({
          completed: true,
          completedAt: new Date(),
          ...(input.mindsetScore !== undefined ? { mindsetScore: input.mindsetScore } : {}),
        } as { completed: boolean; completedAt: Date; mindsetScore?: number })
        .where(and(
          eq(preMarketChecklistItems.id, input.id),
          eq(preMarketChecklistItems.userId, ctx.user.id),
        ));
      return { success: true };
    }),

  uncompleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(preMarketChecklistItems)
        .set({ completed: false, completedAt: null })
        .where(and(
          eq(preMarketChecklistItems.id, input.id),
          eq(preMarketChecklistItems.userId, ctx.user.id),
        ));
      return { success: true };
    }),

  resetDay: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const date = todayET();
      await db
        .update(preMarketChecklistItems)
        .set({ completed: false, completedAt: null })
        .where(and(
          eq(preMarketChecklistItems.userId, ctx.user.id),
          eq(preMarketChecklistItems.date, date),
        ));
      return { success: true };
    }),

  history: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          date: preMarketChecklistItems.date,
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${preMarketChecklistItems.completed} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(preMarketChecklistItems)
        .where(eq(preMarketChecklistItems.userId, ctx.user.id))
        .groupBy(preMarketChecklistItems.date)
        .orderBy(desc(preMarketChecklistItems.date))
        .limit(input?.days ?? 30);

      return rows.map(r => ({
        date: r.date,
        total: Number(r.total),
        completed: Number(r.completed),
        pct: Number(r.total) > 0 ? Math.round((Number(r.completed) / Number(r.total)) * 100) : 0,
      }));
    }),

  /**
   * Live intelligence data for all 8 checklist items.
   * Fetches VIX, SPY/QQQ, gappers from Tradier; P&L, swings, risk, zones from DB.
   */
  intel: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      const today = todayET();
      const weekStart = weekStartET();

      // ── 1. VIX + SPY/QQQ from Tradier ────────────────────────────────────────
      let vix = { price: 0, label: "unknown" as "calm" | "elevated" | "danger" | "unknown", changePercent: 0 };
      let spy = { price: 0, changePercent: 0, preMarketBias: "neutral" as "bullish" | "bearish" | "neutral" };
      let qqq = { price: 0, changePercent: 0, preMarketBias: "neutral" as "bullish" | "bearish" | "neutral" };
      let gappers: Array<{ ticker: string; changePercent: number; direction: "up" | "down"; price: number }> = [];

      try {
        const quotes = await getTradierMultiQuote(["VIX", "SPY", "QQQ"]);

        const vixQ = quotes["VIX"];
        if (vixQ) {
          const p = vixQ.last;
          vix = {
            price: p,
            changePercent: vixQ.change_percentage,
            label: p < 15 ? "calm" : p < 25 ? "elevated" : "danger",
          };
        }

        const spyQ = quotes["SPY"];
        if (spyQ) {
          spy = {
            price: spyQ.last,
            changePercent: spyQ.change_percentage,
            preMarketBias: spyQ.change_percentage > 0.1 ? "bullish" : spyQ.change_percentage < -0.1 ? "bearish" : "neutral",
          };
        }

        const qqqQ = quotes["QQQ"];
        if (qqqQ) {
          qqq = {
            price: qqqQ.last,
            changePercent: qqqQ.change_percentage,
            preMarketBias: qqqQ.change_percentage > 0.1 ? "bullish" : qqqQ.change_percentage < -0.1 ? "bearish" : "neutral",
          };
        }
      } catch {
        // Tradier unavailable — graceful degradation
      }

      // ── 2. Top Gappers — scan common high-volume tickers ─────────────────────
      try {
        const GAPPER_UNIVERSE = [
          "AAPL","MSFT","NVDA","TSLA","META","AMZN","GOOGL","AMD","PLTR","SMCI",
          "MSTR","COIN","SOFI","RIVN","LCID","SOXL","TQQQ","SPXL","UVXY","VXX",
          "SPY","QQQ","IWM","GLD","SLV","USO","TLT","HYG","XLF","XLE",
        ];
        const gapperQuotes = await getTradierMultiQuote(GAPPER_UNIVERSE);
        const gapList = Object.entries(gapperQuotes)
          .filter(([sym]) => !["SPY","QQQ","IWM","VIX"].includes(sym))
          .map(([sym, q]) => ({
            ticker: sym,
            changePercent: q.change_percentage,
            direction: (q.change_percentage >= 0 ? "up" : "down") as "up" | "down",
            price: q.last,
          }))
          .filter(g => Math.abs(g.changePercent) >= 1.0)
          .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

        const topUp = gapList.filter(g => g.direction === "up").slice(0, 5);
        const topDown = gapList.filter(g => g.direction === "down").slice(0, 5);
        gappers = [...topUp, ...topDown];
      } catch {
        // Graceful degradation
      }

      // ── 3. Account P&L Gate ───────────────────────────────────────────────────
      let accountPnl = { todayPnl: 0, weekPnl: 0, totalTrades: 0, todayTrades: 0 };
      if (db) {
        try {
          const todayRows = await db
            .select({ pnl: uploadedTrades.pnl })
            .from(uploadedTrades)
            .where(and(
              eq(uploadedTrades.userId, ctx.user.id),
              eq(uploadedTrades.tradeDate, today),
            ));

          const weekRows = await db
            .select({ pnl: uploadedTrades.pnl })
            .from(uploadedTrades)
            .where(and(
              eq(uploadedTrades.userId, ctx.user.id),
              gte(uploadedTrades.tradeDate, weekStart),
            ));

          accountPnl = {
            todayPnl: todayRows.reduce((s, r) => s + Number(r.pnl ?? 0), 0),
            weekPnl: weekRows.reduce((s, r) => s + Number(r.pnl ?? 0), 0),
            totalTrades: weekRows.length,
            todayTrades: todayRows.length,
          };
        } catch {
          // DB query error — graceful degradation
        }
      }

      // ── 4. Risk Sizing ────────────────────────────────────────────────────────
      let riskSizing = { capital: 350000, riskPct: 0.66, riskPerTrade: 2310, maxTrades: 3, totalExposure: 6930 };
      if (db) {
        try {
          const settings = await db
            .select()
            .from(drawdownSettings)
            .where(eq(drawdownSettings.userId, ctx.user.id))
            .limit(1);

          if (settings.length > 0) {
            const s = settings[0];
            const capital = Number(s.totalCapital);
            const riskPct = Number(s.riskPerTradePct);
            const riskPerTrade = Math.round(capital * riskPct / 100);
            const maxTrades = 3;
            riskSizing = { capital, riskPct, riskPerTrade, maxTrades, totalExposure: riskPerTrade * maxTrades };
          }
        } catch {
          // Graceful degradation
        }
      }

      // ── 5. Active Swing Watchlist Setups ──────────────────────────────────────
      let activeSwings: Array<{ id: number; ticker: string; setupType: string; entryPrice: number; stopPrice: number; dayCount: number; direction: string }> = [];
      if (db) {
        try {
          const swings = await db
            .select()
            .from(swingWatchlist)
            .where(and(
              eq(swingWatchlist.userId, ctx.user.id),
              eq(swingWatchlist.status, "ACTIVE"),
            ))
            .orderBy(desc(swingWatchlist.createdAt))
            .limit(5);

          activeSwings = swings.map(s => ({
            id: s.id,
            ticker: s.ticker,
            setupType: s.setupType,
            entryPrice: Number(s.entryPrice),
            stopPrice: Number(s.stopPrice),
            dayCount: s.dayCount,
            direction: s.direction,
          }));
        } catch {
          // Graceful degradation
        }
      }

      // ── 6. Liquidity Zones Near Price ─────────────────────────────────────────
      let nearZones: Array<{ ticker: string; zoneType: string; priceLevel: number; distancePct: number }> = [];
      if (db) {
        try {
          // Get all active zones
          const zones = await db
            .select()
            .from(liquidityZones)
            .where(and(
              eq(liquidityZones.userId, ctx.user.id),
              eq(liquidityZones.isActive, 1),
            ))
            .limit(100);

          if (zones.length > 0) {
            // Get unique tickers from zones
            const zoneTickers = Array.from(new Set(zones.map(z => z.ticker)));
            const zoneQuotes = await getTradierMultiQuote(zoneTickers.slice(0, 20));

            for (const zone of zones) {
              const q = zoneQuotes[zone.ticker];
              if (!q) continue;
              const currentPrice = q.last;
              if (!currentPrice) continue;
              const zonePrice = Number(zone.priceLevel);
              const distancePct = Math.abs((currentPrice - zonePrice) / currentPrice) * 100;
              if (distancePct <= 1.5) {
                nearZones.push({
                  ticker: zone.ticker,
                  zoneType: zone.zoneType,
                  priceLevel: zonePrice,
                  distancePct: Math.round(distancePct * 100) / 100,
                });
              }
            }
            nearZones.sort((a, b) => a.distancePct - b.distancePct);
          }
        } catch {
          // Graceful degradation
        }
      }

      // ── 7. Portfolio Unrealized P&L (from positions) ──────────────────────────
      let portfolioSummary = { totalMarketValue: 0, totalUnrealizedPnl: 0, positionCount: 0 };
      if (db) {
        try {
          const posRows = await db
            .select({
              marketValue: positions.marketValue,
              unrealizedPnl: positions.unrealizedPnl,
            })
            .from(positions)
            .where(eq(positions.userId, ctx.user.id));

          portfolioSummary = {
            totalMarketValue: posRows.reduce((s, r) => s + Number(r.marketValue ?? 0), 0),
            totalUnrealizedPnl: posRows.reduce((s, r) => s + Number(r.unrealizedPnl ?? 0), 0),
            positionCount: posRows.length,
          };
        } catch {
          // Graceful degradation
        }
      }

      return {
        vix,
        spy,
        qqq,
        gappers,
        accountPnl,
        riskSizing,
        activeSwings,
        nearZones,
        portfolioSummary,
        fetchedAt: new Date().toISOString(),
      };
    }),
});
