// PitDesk Chrome Extension — Dedicated REST sync endpoint
// Uses token-based auth (X-PitDesk-Token header) — cookies don't work cross-origin from extensions
// POST /api/extension/sync
// OPTIONS /api/extension/sync  (preflight)

import type { Request, Response } from "express";
import { getDb } from "./db";
import { accountSnapshots, extensionSyncTokens } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const OWNER_USER_ID = 1; // Sri's actual DB user ID (akulasridhar@gmail.com)

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
        error: "Invalid or missing sync token. Generate one in PitDesk → Sri's Playbook → Settings.",
      });
    }

    // Only owner can sync
    if (userId !== OWNER_USER_ID) {
      return res.status(403).json({ success: false, error: "Forbidden." });
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

    // Canonicalize account IDs — normalize all variants to standard form
    const canonicalizeAccountId = (id: string): string => {
      if (!id) return id;
      // All schwab variants → schwab_764
      if (id.startsWith('schwab_')) return 'schwab_764';
      // etrade_unknown or etrade_5611 → etrade_4723 (Joint JTWROS -5611 is actually the -4723 account login)
      if (id === 'etrade_unknown' || id === 'etrade_5611') return 'etrade_4723';
      return id;
    };
    payload.accountId = canonicalizeAccountId(payload.accountId);
    // Fix label to match canonical ID
    if (payload.accountId === 'schwab_764') payload.accountLabel = 'Schwab ...764';
    else if (payload.accountId === 'etrade_4723') payload.accountLabel = 'E*TRADE -4723';
    else if (payload.accountId === 'etrade_2738') payload.accountLabel = 'E*TRADE -2738';

    // Save account snapshot if we have summary data
    if (payload.accountSummary?.totalValue) {
      const s = payload.accountSummary;

      // Delete existing snapshot for today + this account (upsert pattern)
      await db.delete(accountSnapshots).where(
        and(
          eq(accountSnapshots.userId, OWNER_USER_ID),
          eq(accountSnapshots.snapshotDate, today),
          eq(accountSnapshots.accountId, payload.accountId)
        )
      );

      await db.insert(accountSnapshots).values({
        userId: OWNER_USER_ID,
        snapshotDate: today,
        accountId: payload.accountId,
        accountLabel: payload.accountLabel || payload.broker,
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
      message: `Synced ${positionCount} positions for ${payload.accountLabel || payload.accountId}`,
      snapshotDate: today,
      positionCount,
    });

  } catch (err: any) {
    console.error("[PitDesk Extension Sync] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}
