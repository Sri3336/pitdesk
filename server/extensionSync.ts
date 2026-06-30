// PitDesk Chrome Extension — Dedicated REST sync endpoint
// Bypasses tRPC to avoid batch format issues from browser extensions
// POST /api/extension/sync
// OPTIONS /api/extension/sync  (preflight)

import type { Request, Response } from "express";
import { jwtVerify } from "jose";
import { getDb } from "./db";
import { accountSnapshots } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret"
);
const OWNER_USER_ID = 210001;

async function verifySession(req: Request): Promise<number | null> {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.sub ? parseInt(payload.sub, 10) : null;
  } catch {
    return null;
  }
}

export async function extensionSyncHandler(req: Request, res: Response) {
  // CORS — allow requests from Chrome extension (chrome-extension://) and pitdesk domains
  const origin = req.headers.origin || "";
  if (
    origin.startsWith("chrome-extension://") ||
    origin.includes("trading.akulaz.ai") ||
    origin.includes("pitdesk.ai") ||
    origin === ""
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PitDesk-Extension");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // Verify session cookie
    const userId = await verifySession(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated. Please log into PitDesk at trading.akulaz.ai first.",
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

    // Save account snapshot if we have summary data
    if (payload.accountSummary?.totalValue) {
      const s = payload.accountSummary;

      // Delete existing snapshot for today + this account
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
        marketValue: String(0),
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
