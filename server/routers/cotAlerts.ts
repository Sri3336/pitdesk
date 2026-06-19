// ─── COT Alerts Router ─────────────────────────────────────────────────────────
// Threshold-based alerts: notify when COT Index crosses user-defined level
// Mirrors the IVR Alerts pattern

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cotAlerts } from "../../drizzle/schema";
import { COT_INSTRUMENTS } from "../../shared/cotTypes";
import { notifyOwner } from "../_core/notification";

export const cotAlertsRouter = router({
  // List all alerts for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(cotAlerts)
      .where(eq(cotAlerts.userId, ctx.user.id))
      .orderBy(desc(cotAlerts.createdAt));
  }),

  // Create a new COT alert
  create: protectedProcedure
    .input(
      z.object({
        instrumentId: z.string().min(1),
        condition: z.enum(["above", "below"]),
        threshold: z.number().int().min(0).max(100),
        notes: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const instrument = COT_INSTRUMENTS.find((i) => i.id === input.instrumentId);
      if (!instrument) throw new Error(`Unknown instrument: ${input.instrumentId}`);

      const [result] = await db.insert(cotAlerts).values({
        userId: ctx.user.id,
        instrumentId: input.instrumentId,
        instrumentName: instrument.name,
        condition: input.condition,
        threshold: input.threshold,
        notes: input.notes ?? null,
        status: "active",
      });

      return { id: (result as any).insertId };
    }),

  // Delete an alert
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .delete(cotAlerts)
        .where(and(eq(cotAlerts.id, input.id), eq(cotAlerts.userId, ctx.user.id)));
      return { success: true };
    }),

  // Toggle pause/active
  togglePause: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [alert] = await db
        .select()
        .from(cotAlerts)
        .where(and(eq(cotAlerts.id, input.id), eq(cotAlerts.userId, ctx.user.id)));

      if (!alert) throw new Error("Alert not found");

      const newStatus = alert.status === "paused" ? "active" : "paused";
      await db
        .update(cotAlerts)
        .set({ status: newStatus })
        .where(eq(cotAlerts.id, input.id));

      return { status: newStatus };
    }),

  // Check all active alerts against current COT data (called by scheduler or manually)
  checkAll: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const activeAlerts = await db
      .select()
      .from(cotAlerts)
      .where(and(eq(cotAlerts.userId, ctx.user.id), eq(cotAlerts.status, "active")));

    if (activeAlerts.length === 0) return { triggered: 0, checked: 0 };

    // Fetch COT data for unique instruments
    const uniqueIds = Array.from(new Set(activeAlerts.map((a: typeof activeAlerts[0]) => a.instrumentId)));
    const cotDataMap: Record<string, number> = {};

    for (const id of uniqueIds) {
      try {
        const instrument = COT_INSTRUMENTS.find((i) => i.id === id);
        if (!instrument) continue;

        const url = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?$limit=60&$order=report_date_as_yyyy_mm_dd+DESC&$where=cftc_contract_market_code='${instrument.cftcCode}'`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;

        const raw = (await res.json()) as Array<Record<string, string>>;
        if (!raw?.length) continue;

        const nets = raw.map((r) =>
          parseInt(r.comm_positions_long_all ?? "0", 10) -
          parseInt(r.comm_positions_short_all ?? "0", 10)
        );
        const current = nets[0];
        const min = Math.min(...nets);
        const max = Math.max(...nets);
        cotDataMap[id] = max === min ? 50 : Math.round(((current - min) / (max - min)) * 100);
      } catch {
        // skip on error
      }
    }

    let triggered = 0;
    for (const alert of activeAlerts as Array<typeof activeAlerts[0]>) {
      const cotIndex = cotDataMap[alert.instrumentId];
      if (cotIndex === undefined) continue;

      const shouldTrigger =
        (alert.condition === "above" && cotIndex >= alert.threshold) ||
        (alert.condition === "below" && cotIndex <= alert.threshold);

      await db
        .update(cotAlerts)
        .set({ lastCotIndex: cotIndex })
        .where(eq(cotAlerts.id, alert.id));

      if (shouldTrigger) {
        triggered++;
        await db
          .update(cotAlerts)
          .set({ status: "triggered", lastTriggeredAt: new Date() })
          .where(eq(cotAlerts.id, alert.id));

        await notifyOwner({
          title: `COT Alert: ${alert.instrumentName}`,
          content: `COT Index for ${alert.instrumentName} is ${cotIndex} — ${
            alert.condition === "above" ? "above" : "below"
          } your threshold of ${alert.threshold}. ${
            alert.condition === "above"
              ? "Commercials are heavily net long — potential BULLISH setup."
              : "Commercials are heavily net short — potential BEARISH setup."
          }`,
        });
      }
    }

    return { triggered, checked: activeAlerts.length };
  }),
});
