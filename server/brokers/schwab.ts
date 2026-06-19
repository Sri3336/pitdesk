/**
 * Schwab Individual Trader API connector
 *
 * OAuth2 PKCE flow:
 *   1. Frontend calls GET /api/broker/schwab/auth  → redirects to Schwab login
 *   2. Schwab redirects to GET /api/broker/schwab/callback?code=...
 *   3. Server exchanges code for tokens, stores in broker_connections
 *
 * Docs: https://developer.schwab.com/products/trader-api--individual-
 */

import crypto from "crypto";
import { getDb } from "../db";
import { brokerConnections } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

// ── Env helpers ───────────────────────────────────────────────────────────────

function getSchwabClientId() {
  const id = process.env.SCHWAB_CLIENT_ID;
  if (!id) throw new Error("SCHWAB_CLIENT_ID is not configured");
  return id;
}

function getSchwabClientSecret() {
  const s = process.env.SCHWAB_CLIENT_SECRET;
  if (!s) throw new Error("SCHWAB_CLIENT_SECRET is not configured");
  return s;
}

const SCHWAB_AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const SCHWAB_API_BASE = "https://api.schwabapi.com/trader/v1";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

export function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildSchwabAuthUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getSchwabClientId(),
    redirect_uri: redirectUri,
    scope: "readonly trading",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${SCHWAB_AUTH_URL}?${params.toString()}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
}

export async function exchangeSchwabCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<SchwabTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const credentials = Buffer.from(`${getSchwabClientId()}:${getSchwabClientSecret()}`).toString("base64");

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab token exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<SchwabTokens>;
}

export async function refreshSchwabToken(refreshToken: string): Promise<SchwabTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const credentials = Buffer.from(`${getSchwabClientId()}:${getSchwabClientSecret()}`).toString("base64");

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab token refresh failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<SchwabTokens>;
}

// ── Token storage ─────────────────────────────────────────────────────────────

export async function saveSchwabConnection(
  userId: number,
  tokens: SchwabTokens,
  accountId?: string,
  accountLabel?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const expiry = new Date(Date.now() + tokens.expires_in * 1000);

  // Upsert: delete existing then insert (MySQL doesn't support ON CONFLICT DO UPDATE cleanly with Drizzle)
  await db
    .delete(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, "schwab")));

  await db.insert(brokerConnections).values({
    userId,
    broker: "schwab",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: expiry,
    accountId: accountId ?? null,
    accountLabel: accountLabel ?? null,
    isActive: true,
  });
}

export async function getSchwabConnection(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, "schwab"), eq(brokerConnections.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getValidSchwabToken(userId: number): Promise<string | null> {
  const conn = await getSchwabConnection(userId);
  if (!conn) return null;

  // If token expires within 5 minutes, refresh it
  const fiveMinutes = 5 * 60 * 1000;
  if (conn.tokenExpiry && conn.tokenExpiry.getTime() - Date.now() < fiveMinutes) {
    if (!conn.refreshToken) return null;
    try {
      const tokens = await refreshSchwabToken(conn.refreshToken);
      await saveSchwabConnection(userId, tokens, conn.accountId ?? undefined, conn.accountLabel ?? undefined);
      return tokens.access_token;
    } catch {
      return null;
    }
  }

  return conn.accessToken;
}

export async function disconnectSchwab(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, "schwab")));
}

// ── Schwab API calls ──────────────────────────────────────────────────────────

async function schwabGet(path: string, accessToken: string) {
  const res = await fetch(`${SCHWAB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab API ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function schwabPost(path: string, accessToken: string, body: unknown) {
  const res = await fetch(`${SCHWAB_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab API POST ${path} failed: ${res.status} ${text}`);
  }
  // 201 Created returns empty body
  if (res.status === 201) return { orderId: res.headers.get("Location")?.split("/").pop() ?? null };
  return res.json();
}

export async function getSchwabAccounts(accessToken: string) {
  return schwabGet("/accounts?fields=positions", accessToken);
}

export async function getSchwabOptionChain(
  accessToken: string,
  symbol: string,
  fromDate: string, // YYYY-MM-DD
  toDate: string,
  strikeCount = 20
) {
  const params = new URLSearchParams({
    symbol,
    contractType: "ALL",
    strikeCount: String(strikeCount),
    includeUnderlyingQuote: "true",
    strategy: "SINGLE",
    fromDate,
    toDate,
  });
  return schwabGet(`/chains?${params.toString()}`, accessToken);
}

export interface SchwabOptionLeg {
  instruction: "BUY_TO_OPEN" | "SELL_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_CLOSE";
  quantity: number;
  instrument: {
    symbol: string;       // OCC symbol e.g. AAPL  250117P00150000
    assetType: "OPTION";
    putCall: "PUT" | "CALL";
  };
}

export async function placeSchwabOrder(
  accessToken: string,
  accountId: string,
  legs: SchwabOptionLeg[],
  netCreditLimit: number,  // per share (will be multiplied by 100 for per-contract)
  orderType: "NET_CREDIT" | "MARKET" = "NET_CREDIT"
): Promise<{ orderId: string | null }> {
  const order = {
    orderType,
    session: "NORMAL",
    duration: "DAY",
    orderStrategyType: "SINGLE",
    price: orderType === "NET_CREDIT" ? netCreditLimit.toFixed(2) : undefined,
    orderLegCollection: legs.map(leg => ({
      instruction: leg.instruction,
      quantity: leg.quantity,
      instrument: leg.instrument,
    })),
    complexOrderStrategyType: legs.length > 1 ? "VERTICAL" : "NONE",
  };

  return schwabPost(`/accounts/${accountId}/orders`, accessToken, order);
}
