/**
 * pcrAlerts router
 * Per-user, per-ticker PCR alert settings.
 * Users can subscribe to regime-change notifications for specific tickers.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pcrAlertSettings } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

export const pcrAlertsRouter = router({
  /** List all alert settings for the current user */
  listSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(pcrAlertSettings)
      .where(eq(pcrAlertSettings.userId, ctx.user.id))
      .orderBy(pcrAlertSettings.ticker);
  }),

  /** Upsert alert settings for a specific ticker */
  upsertSettings: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(20).toUpperCase(),
        alertOnFear: z.boolean().default(true),
        alertOnGreed: z.boolean().default(true),
        alertOnExtremeFear: z.boolean().default(true),
        alertOnExtremeGreed: z.boolean().default(true),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .insert(pcrAlertSettings)
        .values({
          userId: ctx.user.id,
          ticker: input.ticker,
          alertOnFear: input.alertOnFear,
          alertOnGreed: input.alertOnGreed,
          alertOnExtremeFear: input.alertOnExtremeFear,
          alertOnExtremeGreed: input.alertOnExtremeGreed,
          enabled: input.enabled,
        })
        .onDuplicateKeyUpdate({
          set: {
            alertOnFear: input.alertOnFear,
            alertOnGreed: input.alertOnGreed,
            alertOnExtremeFear: input.alertOnExtremeFear,
            alertOnExtremeGreed: input.alertOnExtremeGreed,
            enabled: input.enabled,
          },
        });
      return { success: true };
    }),

  /** Delete alert settings for a specific ticker */
  deleteSettings: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .delete(pcrAlertSettings)
        .where(
          and(
            eq(pcrAlertSettings.userId, ctx.user.id),
            eq(pcrAlertSettings.ticker, input.ticker.toUpperCase())
          )
        );
      return { success: true };
    }),

  /** Toggle enabled/disabled for a specific ticker's alert */
  toggleEnabled: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(20), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(pcrAlertSettings)
        .set({ enabled: input.enabled })
        .where(
          and(
            eq(pcrAlertSettings.userId, ctx.user.id),
            eq(pcrAlertSettings.ticker, input.ticker.toUpperCase())
          )
        );
      return { success: true };
    }),
});
