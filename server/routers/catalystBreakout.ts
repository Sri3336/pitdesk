/**
 * catalystBreakout.ts — tRPC router for the Catalyst Breakout Watch (BCOS strategy).
 *
 * Strategy: Long options on confirmed breakouts/breakdowns through major S/R levels
 * driven by a news catalyst. Based on the "Everything You Knew About Trading Is Wrong"
 * video analysis.
 *
 * Scanner logic:
 *  - Fetch daily bars for each watched ticker
 *  - Compute distance from current price to key level
 *  - Compute 20-day average volume and today's volume ratio
 *  - Flag status: watching / near_break (within 2%) / broken_out / broken_down
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { catalystBreakoutWatch } from "../../drizzle/schema";
import { callDataApi } from "../_core/dataApi";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchScanData(ticker: string): Promise<{
  currentPrice: number;
  volumeRatio: number;
  weeklyChange: number;
  error?: string;
}> {
  try {
    const resp = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        region: "US",
        interval: "1d",
        range: "3mo",
        includeAdjustedClose: false,
      },
    });

    const respAny = resp as any;
    const result = respAny?.chart?.result?.[0];
    if (!result) return { currentPrice: 0, volumeRatio: 1, weeklyChange: 0, error: "No data" };

    const closes: number[] = result.indicators.quote[0].close ?? [];
    const volumes: number[] = result.indicators.quote[0].volume ?? [];
    const n = closes.length;
    if (n < 2) return { currentPrice: 0, volumeRatio: 1, weeklyChange: 0, error: "Insufficient data" };

    const currentPrice = closes[n - 1] ?? 0;

    // 20-bar average volume (excluding today)
    const volSlice = volumes.slice(Math.max(0, n - 21), n - 1).filter((v) => v != null && v > 0);
    const avgVol = volSlice.length > 0 ? volSlice.reduce((a, b) => a + b, 0) / volSlice.length : 1;
    const todayVol = volumes[n - 1] ?? 0;
    const volumeRatio = avgVol > 0 ? todayVol / avgVol : 1;

    // 5-day price change
    const priorClose = closes[Math.max(0, n - 6)] ?? currentPrice;
    const weeklyChange = priorClose > 0 ? ((currentPrice - priorClose) / priorClose) * 100 : 0;

    return { currentPrice, volumeRatio, weeklyChange };
  } catch (e) {
    return { currentPrice: 0, volumeRatio: 1, weeklyChange: 0, error: String(e) };
  }
}

function computeStatus(
  currentPrice: number,
  keyLevel: number,
  direction: "resistance" | "support",
  distancePct: number
): "watching" | "near_break" | "broken_out" | "broken_down" {
  if (direction === "resistance") {
    if (currentPrice > keyLevel * 1.005) return "broken_out";   // closed >0.5% above resistance
    if (distancePct <= 2.0) return "near_break";                 // within 2% below resistance
    return "watching";
  } else {
    if (currentPrice < keyLevel * 0.995) return "broken_down";  // closed >0.5% below support
    if (distancePct <= 2.0) return "near_break";                 // within 2% above support
    return "watching";
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const catalystBreakoutRouter = router({
  // ── List all watched tickers ──────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(catalystBreakoutWatch)
      .where(eq(catalystBreakoutWatch.userId, ctx.user.id))
      .orderBy(desc(catalystBreakoutWatch.createdAt));
  }),

  // ── Add a ticker to the watch list ───────────────────────────────────────
  add: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(20).toUpperCase(),
        keyLevel: z.number().positive(),
        direction: z.enum(["resistance", "support"]),
        levelLabel: z.string().max(100).optional(),
        daysTested: z.number().int().min(0).default(0),
        touches: z.number().int().min(0).default(0),
        nextEarningsDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        catalystNotes: z.string().max(256).optional(),
        notes: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(catalystBreakoutWatch).values({
        userId: ctx.user.id,
        ticker: input.ticker,
        keyLevel: String(input.keyLevel),
        direction: input.direction,
        levelLabel: input.levelLabel,
        daysTested: input.daysTested,
        touches: input.touches,
        nextEarningsDate: input.nextEarningsDate,
        catalystNotes: input.catalystNotes,
        notes: input.notes,
        status: "watching",
      });
      return { success: true };
    }),

  // ── Update a watch entry ──────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        keyLevel: z.number().positive().optional(),
        direction: z.enum(["resistance", "support"]).optional(),
        levelLabel: z.string().max(100).optional(),
        daysTested: z.number().int().min(0).optional(),
        touches: z.number().int().min(0).optional(),
        nextEarningsDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        catalystNotes: z.string().max(256).optional(),
        notes: z.string().max(512).optional(),
        status: z
          .enum(["watching", "near_break", "broken_out", "broken_down", "invalidated"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, keyLevel, ...rest } = input;
      await db
        .update(catalystBreakoutWatch)
        .set({
          ...(keyLevel !== undefined ? { keyLevel: String(keyLevel) } : {}),
          ...rest,
        })
        .where(
          and(
            eq(catalystBreakoutWatch.id, id),
            eq(catalystBreakoutWatch.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  // ── Remove a ticker ───────────────────────────────────────────────────────
  remove: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .delete(catalystBreakoutWatch)
        .where(
          and(
            eq(catalystBreakoutWatch.id, input.id),
            eq(catalystBreakoutWatch.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  // ── Scan all watched tickers ──────────────────────────────────────────────
  scanAll: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const items = await db
      .select()
      .from(catalystBreakoutWatch)
      .where(
        and(
          eq(catalystBreakoutWatch.userId, ctx.user.id),
          // Only scan active items
        )
      );

    const results = await Promise.all(
      items.map(async (item) => {
        if (item.status === "invalidated") return item;

        const keyLevel = parseFloat(item.keyLevel ?? "0");
        const { currentPrice, volumeRatio, error } = await fetchScanData(item.ticker);

        if (error || currentPrice === 0) return item;

        const distancePct =
          keyLevel > 0 ? Math.abs((currentPrice - keyLevel) / keyLevel) * 100 : 0;

        const newStatus = computeStatus(
          currentPrice,
          keyLevel,
          item.direction,
          distancePct
        );

        await db
          .update(catalystBreakoutWatch)
          .set({
            lastPrice: String(currentPrice),
            distancePct: String(distancePct.toFixed(4)),
            volumeRatio: String(volumeRatio.toFixed(4)),
            status: newStatus,
            lastScannedAt: new Date(),
          })
          .where(eq(catalystBreakoutWatch.id, item.id));

        return {
          ...item,
          lastPrice: String(currentPrice),
          distancePct: String(distancePct.toFixed(4)),
          volumeRatio: String(volumeRatio.toFixed(4)),
          status: newStatus,
          lastScannedAt: new Date(),
        };
      })
    );

    return results;
  }),

  // ── Check alerts (called by heartbeat every 30 min during market hours) ────
  checkAlerts: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { checked: 0, alerts: [] };

    // Fetch all non-invalidated items across all users
    const items = await db
      .select()
      .from(catalystBreakoutWatch);

    const alerts: string[] = [];

    await Promise.all(
      items.map(async (item) => {
        if (item.status === "invalidated") return;

        const keyLevel = parseFloat(item.keyLevel ?? "0");
        const { currentPrice, error } = await fetchScanData(item.ticker);
        if (error || currentPrice === 0 || keyLevel === 0) return;

        const distancePct = Math.abs((currentPrice - keyLevel) / keyLevel) * 100;
        const newStatus = computeStatus(currentPrice, keyLevel, item.direction, distancePct);

        // Update status in DB
        await db
          .update(catalystBreakoutWatch)
          .set({
            lastPrice: String(currentPrice),
            distancePct: String(distancePct.toFixed(4)),
            status: newStatus,
            lastScannedAt: new Date(),
          })
          .where(eq(catalystBreakoutWatch.id, item.id));

        // Alert if within 1% (near_break) or just broke out/down
        if (distancePct <= 1.0 || newStatus === "broken_out" || newStatus === "broken_down") {
          const emoji = newStatus === "broken_out" ? "🚀" : newStatus === "broken_down" ? "📉" : "⚠️";
          const action = newStatus === "broken_out" ? "BROKE OUT above" : newStatus === "broken_down" ? "BROKE DOWN below" : "within 1% of";
          alerts.push(
            `${emoji} ${item.ticker} is ${action} key level $${keyLevel} | Current: $${currentPrice.toFixed(2)} | Distance: ${distancePct.toFixed(2)}% | ${item.catalystNotes ?? ""}`
          );
        }
      })
    );

    if (alerts.length > 0) {
      const body = [
        `BCOS Alert — ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
        "",
        ...alerts,
        "",
        "View your Catalyst Watch: https://pitdesk.ai",
      ].join("\n");

      await notifyOwner({
        title: `⚡ BCOS Alert: ${alerts.length} level${alerts.length > 1 ? "s" : ""} near break`,
        content: body,
      });
    }

    return { checked: items.length, alerts };
  }),

  // ── Scan a single ticker ──────────────────────────────────────────────────
  scanOne: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [item] = await db
        .select()
        .from(catalystBreakoutWatch)
        .where(
          and(
            eq(catalystBreakoutWatch.id, input.id),
            eq(catalystBreakoutWatch.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const keyLevel = parseFloat(item.keyLevel ?? "0");
      const { currentPrice, volumeRatio, weeklyChange, error } = await fetchScanData(item.ticker);

      if (error || currentPrice === 0) {
        return { ...item, scanError: error };
      }

      const distancePct =
        keyLevel > 0 ? Math.abs((currentPrice - keyLevel) / keyLevel) * 100 : 0;

      const newStatus = computeStatus(currentPrice, keyLevel, item.direction, distancePct);

      await db
        .update(catalystBreakoutWatch)
        .set({
          lastPrice: String(currentPrice),
          distancePct: String(distancePct.toFixed(4)),
          volumeRatio: String(volumeRatio.toFixed(4)),
          status: newStatus,
          lastScannedAt: new Date(),
        })
        .where(eq(catalystBreakoutWatch.id, item.id));

      return {
        ...item,
        lastPrice: String(currentPrice),
        distancePct: String(distancePct.toFixed(4)),
        volumeRatio: String(volumeRatio.toFixed(4)),
        weeklyChange,
        status: newStatus,
        lastScannedAt: new Date(),
      };
    }),
});
