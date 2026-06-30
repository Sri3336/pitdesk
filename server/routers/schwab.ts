/**
 * Schwab tRPC Router
 * Provides procedures for checking connection status and fetching live account data.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getSchwabTokens,
  getValidAccessToken,
  fetchAllAccounts,
  fetchAccountNumbers,
  updateSchwabAccountNumbers,
  updateSchwabSyncStatus,
  normalizeAccount,
  type SchwabAccountSummary,
} from "../schwab";
import { getDb } from "../db";
import { schwabTokens } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const OWNER_USER_ID = 1;

// Helper: ensure only Sri can call Schwab procedures
function assertOwner(userId: number) {
  if (userId !== OWNER_USER_ID) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Schwab data is only accessible to the account owner",
    });
  }
}

export const schwabRouter = router({
  // ─── Connection Status ────────────────────────────────────────────────────

  getStatus: protectedProcedure.query(async ({ ctx }) => {
    assertOwner(ctx.user.id);

    const tokens = await getSchwabTokens(OWNER_USER_ID);
    if (!tokens) {
      return {
        connected: false,
        reason: "not_connected" as const,
        connectUrl: "/api/schwab/connect",
      };
    }

    const now = Date.now();

    if (now >= tokens.refreshTokenExpiresAt) {
      return {
        connected: false,
        reason: "refresh_token_expired" as const,
        expiredAt: new Date(tokens.refreshTokenExpiresAt).toISOString(),
        connectUrl: "/api/schwab/connect",
      };
    }

    const daysUntilExpiry = Math.ceil(
      (tokens.refreshTokenExpiresAt - now) / (1000 * 60 * 60 * 24)
    );

    return {
      connected: true,
      reason: null,
      accessTokenValid: now < tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: new Date(tokens.refreshTokenExpiresAt).toISOString(),
      daysUntilExpiry,
      accountNumbers: (tokens.accountNumbers as Array<{ accountNumber: string; hashValue: string }>) ?? [],
      lastSyncAt: tokens.lastSyncAt ? new Date(tokens.lastSyncAt).toISOString() : null,
      lastSyncStatus: tokens.lastSyncStatus ?? null,
      connectUrl: "/api/schwab/connect",
    };
  }),

  // ─── Get All Accounts with Balances + Positions ───────────────────────────

  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    assertOwner(ctx.user.id);

    try {
      const accessToken = await getValidAccessToken(OWNER_USER_ID);
      const rawAccounts = await fetchAllAccounts(accessToken, "positions");

      // Refresh account numbers in DB if needed
      try {
        const accountNums = await fetchAccountNumbers(accessToken);
        await updateSchwabAccountNumbers(OWNER_USER_ID, accountNums);
      } catch {
        // Non-fatal — account numbers may already be stored
      }

      const accounts: SchwabAccountSummary[] = rawAccounts.map(normalizeAccount);
      await updateSchwabSyncStatus(OWNER_USER_ID, "ok");

      const totalValue = accounts.reduce((sum, a) => sum + a.totalValue, 0);
      const totalDayPnl = accounts.reduce((sum, a) => sum + a.dayPnl, 0);

      return {
        accounts,
        summary: {
          totalValue,
          totalDayPnl,
          accountCount: accounts.length,
          syncedAt: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      const isExpired =
        err.message?.includes("expired") || err.message?.includes("401");
      if (isExpired) {
        await updateSchwabSyncStatus(OWNER_USER_ID, "token_expired");
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Schwab token expired — please re-authorize at /api/schwab/connect",
        });
      }
      await updateSchwabSyncStatus(OWNER_USER_ID, "error");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Schwab API error: ${err.message}`,
      });
    }
  }),

  // ─── Get Positions Only (lighter call) ───────────────────────────────────

  getPositions: protectedProcedure.query(async ({ ctx }) => {
    assertOwner(ctx.user.id);

    try {
      const accessToken = await getValidAccessToken(OWNER_USER_ID);
      const rawAccounts = await fetchAllAccounts(accessToken, "positions");
      const accounts: SchwabAccountSummary[] = rawAccounts.map(normalizeAccount);

      // Flatten all positions across accounts
      const allPositions = accounts.flatMap((a) =>
        a.positions.map((p) => ({
          ...p,
          accountNumber: a.accountNumber,
          accountType: a.accountType,
        }))
      );

      return {
        positions: allPositions,
        syncedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Schwab positions error: ${err.message}`,
      });
    }
  }),

  // ─── Disconnect ───────────────────────────────────────────────────────────

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    assertOwner(ctx.user.id);

    const db = await getDb();
    if (db) {
      await db
        .delete(schwabTokens)
        .where(eq(schwabTokens.userId, OWNER_USER_ID));
    }

    return { success: true };
  }),

  // ─── Refresh Account Numbers ──────────────────────────────────────────────

  refreshAccountNumbers: protectedProcedure.mutation(async ({ ctx }) => {
    assertOwner(ctx.user.id);

    try {
      const accessToken = await getValidAccessToken(OWNER_USER_ID);
      const accountNumbers = await fetchAccountNumbers(accessToken);
      await updateSchwabAccountNumbers(OWNER_USER_ID, accountNumbers);
      return { success: true, accountNumbers };
    } catch (err: any) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to refresh account numbers: ${err.message}`,
      });
    }
  }),
});
