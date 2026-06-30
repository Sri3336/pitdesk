/**
 * Schwab OAuth2 Routes
 *
 * GET  /api/schwab/status   — returns connection status (no auth required for UI polling)
 * GET  /api/schwab/connect  — redirects to Schwab login (owner-only)
 * GET  /api/schwab/callback — handles OAuth redirect, stores tokens
 * POST /api/schwab/disconnect — removes stored tokens
 */

import { Router, Request, Response } from "express";
import {
  buildSchwabAuthUrl,
  exchangeCodeForTokens,
  saveSchwabTokens,
  getSchwabTokens,
  fetchAccountNumbers,
  updateSchwabAccountNumbers,
} from "./schwab";
import { jwtVerify } from "jose";
import { getUserById } from "./db";
import { COOKIE_NAME } from "../shared/const";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-dev-secret");

async function getUserFromRequest(req: Request) {
  try {
    const token = (req as any).cookies?.[COOKIE_NAME];
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub ? parseInt(payload.sub, 10) : null;
    if (!userId) return null;
    return (await getUserById(userId)) ?? null;
  } catch {
    return null;
  }
}

const OWNER_USER_ID = 1; // Sri's DB user ID
const CALLBACK_URL = "https://trading.akulaz.ai/api/schwab/callback";

export const schwabRouter = Router();

// ─── GET /api/schwab/status ───────────────────────────────────────────────────

schwabRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const tokens = await getSchwabTokens(OWNER_USER_ID);
    if (!tokens) {
      return res.json({ connected: false, reason: "not_connected" });
    }

    const now = Date.now();

    if (now >= tokens.refreshTokenExpiresAt) {
      return res.json({
        connected: false,
        reason: "refresh_token_expired",
        expiredAt: new Date(tokens.refreshTokenExpiresAt).toISOString(),
      });
    }

    const daysUntilExpiry = Math.ceil(
      (tokens.refreshTokenExpiresAt - now) / (1000 * 60 * 60 * 24)
    );

    return res.json({
      connected: true,
      accessTokenValid: now < tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: new Date(tokens.refreshTokenExpiresAt).toISOString(),
      daysUntilExpiry,
      accountNumbers: tokens.accountNumbers ?? [],
      lastSyncAt: tokens.lastSyncAt
        ? new Date(tokens.lastSyncAt).toISOString()
        : null,
      lastSyncStatus: tokens.lastSyncStatus ?? null,
    });
  } catch (err: any) {
    return res.status(500).json({ connected: false, reason: "error", message: err.message });
  }
});

// ─── GET /api/schwab/connect ──────────────────────────────────────────────────

schwabRouter.get("/connect", async (req: Request, res: Response) => {
  // Only Sri can connect
  const user = await getUserFromRequest(req);
  if (!user || user.id !== OWNER_USER_ID) {
    return res.status(403).send("Forbidden — only the account owner can connect Schwab");
  }

  const authUrl = buildSchwabAuthUrl(CALLBACK_URL);
  return res.redirect(authUrl);
});

// ─── GET /api/schwab/callback ─────────────────────────────────────────────────

schwabRouter.get("/callback", async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query as Record<string, string>;

  if (error) {
    console.error("[Schwab OAuth] Error from Schwab:", error, error_description);
    return res.redirect(
      `/sri-playbook?schwab_error=${encodeURIComponent(error_description ?? error)}`
    );
  }

  if (!code) {
    return res.redirect("/sri-playbook?schwab_error=no_code");
  }

  try {
    // Exchange authorization code for tokens
    const tokenData = await exchangeCodeForTokens(code, CALLBACK_URL);

    // Save tokens to DB
    await saveSchwabTokens(
      OWNER_USER_ID,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.expires_in
    );

    // Fetch and store account numbers (needed for subsequent API calls)
    try {
      const accountNumbers = await fetchAccountNumbers(tokenData.access_token);
      await updateSchwabAccountNumbers(OWNER_USER_ID, accountNumbers);
      console.log(
        `[Schwab OAuth] Connected — ${accountNumbers.length} account(s) linked`
      );
    } catch (acctErr) {
      console.warn("[Schwab OAuth] Could not fetch account numbers:", acctErr);
    }

    return res.redirect("/sri-playbook?schwab_connected=1");
  } catch (err: any) {
    console.error("[Schwab OAuth] Token exchange failed:", err.message);
    return res.redirect(
      `/sri-playbook?schwab_error=${encodeURIComponent(err.message)}`
    );
  }
});

// ─── POST /api/schwab/disconnect ──────────────────────────────────────────────

schwabRouter.post("/disconnect", async (req: Request, res: Response) => {
  const user = await getUserFromRequest(req);
  if (!user || user.id !== OWNER_USER_ID) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { getDb } = await import("./db");
    const { schwabTokens } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      await db.delete(schwabTokens).where(eq(schwabTokens.userId, OWNER_USER_ID));
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
