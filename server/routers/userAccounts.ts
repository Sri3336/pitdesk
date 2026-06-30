// server/routers/userAccounts.ts
// Per-user brokerage account tracking configuration for the Chrome extension.
// Each user registers the account numbers they want the extension to sync.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userTrackedAccounts } from "../../drizzle/schema";

const BROKERS = ["etrade", "schwab", "other"] as const;

export const userAccountsRouter = router({
  // ── List all tracked accounts for the current user ──────────────────────────
  getTrackedAccounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(userTrackedAccounts)
      .where(eq(userTrackedAccounts.userId, ctx.user.id))
      .orderBy(userTrackedAccounts.createdAt);
  }),

  // ── Add a new tracked account ────────────────────────────────────────────────
  addTrackedAccount: protectedProcedure
    .input(
      z.object({
        broker: z.enum(BROKERS),
        accountSuffix: z.string().min(1).max(16).trim(),
        accountLabel: z.string().min(1).max(100).trim().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Build a canonical accountId from broker + suffix
      const accountId = `${input.broker}_${input.accountSuffix}`;
      const accountLabel =
        input.accountLabel ||
        (input.broker === "etrade"
          ? `E*TRADE -${input.accountSuffix}`
          : input.broker === "schwab"
          ? `Schwab ...${input.accountSuffix}`
          : `Account ...${input.accountSuffix}`);

      // Check for duplicate
      const existing = await db
        .select()
        .from(userTrackedAccounts)
        .where(
          and(
            eq(userTrackedAccounts.userId, ctx.user.id),
            eq(userTrackedAccounts.accountId, accountId)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error(`Account ${accountLabel} is already being tracked.`);
      }

      const now = Date.now();
      await db.insert(userTrackedAccounts).values({
        userId: ctx.user.id,
        accountId,
        accountLabel,
        broker: input.broker,
        accountSuffix: input.accountSuffix,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      return { success: true, accountId, accountLabel };
    }),

  // ── Remove a tracked account ─────────────────────────────────────────────────
  removeTrackedAccount: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .delete(userTrackedAccounts)
        .where(
          and(
            eq(userTrackedAccounts.id, input.id),
            eq(userTrackedAccounts.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  // ── Toggle active/inactive ───────────────────────────────────────────────────
  toggleTrackedAccount: protectedProcedure
    .input(z.object({ id: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(userTrackedAccounts)
        .set({ isActive: input.isActive ? 1 : 0, updatedAt: Date.now() })
        .where(
          and(
            eq(userTrackedAccounts.id, input.id),
            eq(userTrackedAccounts.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),
});
