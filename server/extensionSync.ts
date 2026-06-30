// PitDesk Chrome Extension — Dedicated REST sync endpoint
// Uses token-based auth (X-PitDesk-Token header) — cookies don't work cross-origin from extensions
// POST /api/extension/sync
// OPTIONS /api/extension/sync  (preflight)

import type { Request, Response } from "express";
import { getDb } from "./db";
import { accountSnapshots, extensionSyncTokens, userTrackedAccounts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";


async function verifyExtensionToken(req: Request): Promise<number | null> {
  try {
    const token = req.headers["x-pitdesk-token"] as string | undefined;
    if (!token || token.length < 32) return null;

    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(extensionSyncTokens)
      .where(eq(extensionSyncTokens.token, token))
      .limit(1);

    if (!rows.length) return null;

    // Update last used timestamp
    await db
      .update(extensionSyncTokens)
      .set({ lastUsedAt: Date.now() })
      .where(eq(extensionSyncTokens.token, token));

    return rows[0].userId;
  } catch {
    return null;
  }
}

export async function extensionSyncHandler(req: Request, res: Response) {
  // CORS — allow requests from Chrome extension origins and pitdesk domains
  const origin = req.headers.origin || "";
  if (
    origin.startsWith("chrome-extension://") ||
    origin.includes("trading.akulaz.ai") ||
    origin.includes("pitdesk.ai") ||
    origin === ""
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PitDesk-Extension, X-PitDesk-Token");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // Verify via token header (cookie-based auth doesn't work cross-origin from extensions)
    const userId = await verifyExtensionToken(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Invalid or missing sync token. Generate one in PitDesk → My Account → Extension Settings.",
      });
    }

    const payload = req.body;
    if (!payload || !payload.broker || !payload.accountId) {
      return res.status(400).json({
        success: false,
        error: "Invalid payload — missing broker or accountId.",
      });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: "Database not available." });
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // ── Resolve the accountId against this user's tracked accounts ────────────
    const trackedAccounts = await db
      .select()
      .from(userTrackedAccounts)
      .where(and(eq(userTrackedAccounts.userId, userId), eq(userTrackedAccounts.isActive, 1)));

    // Try exact match first, then suffix match
    let matched = trackedAccounts.find(a => a.accountId === payload.accountId);
    if (!matched) {
      const incomingSuffix = payload.accountId.split("_").slice(1).join("_");
      matched = trackedAccounts.find(
        a => a.accountSuffix && incomingSuffix && incomingSuffix.includes(a.accountSuffix)
      );
    }

    if (!matched) {
      return res.status(403).json({
        success: false,
        error: `Account '${payload.accountId}' is not in your tracked accounts list. Add it in PitDesk → My Account → Extension Settings.`,
      });
    }

    const canonicalAccountId = matched.accountId;
    const canonicalLabel = matched.accountLabel;

    // Save account snapshot if we have summary data
    if (payload.accountSummary?.totalValue) {
      const s = payload.accountSummary;

      // Delete existing snapshot for today + this account (upsert pattern)
      await db.delete(accountSnapshots).where(
        and(
          eq(accountSnapshots.userId, userId),
          eq(accountSnapshots.snapshotDate, today),
          eq(accountSnapshots.accountId, canonicalAccountId)
        )
      );

      await db.insert(accountSnapshots).values({
        userId,
        snapshotDate: today,
        accountId: canonicalAccountId,
        accountLabel: canonicalLabel,
        totalValue: String(s.totalValue || 0),
        cashValue: String(s.cash || 0),
        marketValue: String(s.marketValue || 0),
        dayPnl: String(s.dayPnl || 0),
        totalPnl: String(s.totalPnl || 0),
        createdAt: now,
      });
    }

    const positionCount = payload.positions?.length || 0;

    return res.json({
      success: true,
      message: `Synced ${positionCount} positions for ${canonicalLabel}`,
      snapshotDate: today,
      positionCount,
    });

  } catch (err: any) {
    console.error("[PitDesk Extension Sync] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}
