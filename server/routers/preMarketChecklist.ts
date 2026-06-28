/**
 * Pre-Market Checklist Router
 *
 * Procedures:
 *   preMarket.todayChecklist — get or auto-create today's 6-item checklist
 *   preMarket.completeItem   — mark an item completed
 *   preMarket.uncompleteItem — unmark an item
 *   preMarket.resetDay       — reset all items for today
 *   preMarket.history        — last 30 days completion rate
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { preMarketChecklistItems } from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Default checklist items ──────────────────────────────────────────────────

const DEFAULT_ITEMS = [
  { key: "vix_check",       label: "Check VIX — note level (skip ORB if >25, reduce size if >20)" },
  { key: "spy_bias",        label: "SPY/QQQ pre-market bias — above or below yesterday's close?" },
  { key: "gappers",         label: "Scan top gappers (≥1.5%) — identify catalyst, float, volume" },
  { key: "account_gate",    label: "Account P&L gate — daily loss limit not hit, no revenge mindset" },
  { key: "setups_confirmed",label: "Confirm swing watchlist setups still valid (no overnight news)" },
  { key: "risk_sizing",     label: "Set max risk per trade and max trades for today's session" },
  { key: "mindset",         label: "Mindset check — calm, rested, no FOMO, ready to follow rules" },
  { key: "time_block",      label: "Block 9:30–11:30 AM calendar — no meetings, no distractions" },
];

function todayET(): string {
  // Return YYYY-MM-DD in US/Eastern
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const preMarketChecklistRouter = router({

  todayChecklist: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { date: todayET(), items: [], completedCount: 0, totalCount: DEFAULT_ITEMS.length };

      const date = todayET();

      // Check if today's items exist
      const existing = await db
        .select()
        .from(preMarketChecklistItems)
        .where(and(
          eq(preMarketChecklistItems.userId, ctx.user.id),
          eq(preMarketChecklistItems.date, date),
        ));

      if (existing.length === 0) {
        // Auto-create today's items
        await db.insert(preMarketChecklistItems).values(
          DEFAULT_ITEMS.map(item => ({
            userId: ctx.user.id,
            date,
            itemKey: item.key,
            label: item.label,
            completed: false,
          }))
        );
        return {
          date,
          items: DEFAULT_ITEMS.map((item, i) => ({
            id: 0, // will be fetched below
            itemKey: item.key,
            label: item.label,
            completed: false,
            completedAt: null,
          })),
          completedCount: 0,
          totalCount: DEFAULT_ITEMS.length,
        };
      }

      // Re-fetch with IDs
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
        })),
        completedCount: items.filter(i => i.completed).length,
        totalCount: items.length,
      };
    }),

  completeItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(preMarketChecklistItems)
        .set({ completed: true, completedAt: new Date() })
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
});
