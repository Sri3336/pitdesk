/**
 * Schwab Trader API Client
 * Handles OAuth2 flow, token storage/refresh, and account data fetching.
 *
 * Key facts about Schwab OAuth:
 * - Access token: expires in 30 minutes
 * - Refresh token: expires in 7 days (requires manual re-auth in browser)
 * - Account numbers must be used as their hashed values in API calls
 * - Base URL: https://api.schwabapi.com
 */

import { getDb } from "./db";
import { schwabTokens } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";

const SCHWAB_BASE_URL = "https://api.schwabapi.com";
const SCHWAB_TOKEN_URL = `${SCHWAB_BASE_URL}/v1/oauth/token`;
const SCHWAB_AUTH_URL = `${SCHWAB_BASE_URL}/v1/oauth/authorize`;
const SCHWAB_TRADER_URL = `${SCHWAB_BASE_URL}/trader/v1`;

// ─── OAuth URL Builder ────────────────────────────────────────────────────────

export function buildSchwabAuthUrl(callbackUrl: string): string {
  const params = new URLSearchParams({
    client_id: ENV.schwabAppKey,
    redirect_uri: callbackUrl,
    response_type: "code",
  });
  return `${SCHWAB_AUTH_URL}?${params.toString()}`;
}

// ─── Token Exchange (authorization_code → tokens) ────────────────────────────

export async function exchangeCodeForTokens(
  code: string,
  callbackUrl: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until access token expires
  token_type: string;
}> {
  const credentials = Buffer.from(
    `${ENV.schwabAppKey}:${ENV.schwabAppSecret}`
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ─── Token Refresh (refresh_token → new access token) ────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const credentials = Buffer.from(
    `${ENV.schwabAppKey}:${ENV.schwabAppSecret}`
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ─── DB Token Helpers ─────────────────────────────────────────────────────────

export async function saveSchwabTokens(
  userId: number,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number
): Promise<void> {
  const now = Date.now();
  const accessTokenExpiresAt = now + expiresInSeconds * 1000;
  // Schwab refresh tokens expire after 7 days
  const refreshTokenExpiresAt = now + 7 * 24 * 60 * 60 * 1000;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: schwabTokens.id })
    .from(schwabTokens)
    .where(eq(schwabTokens.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schwabTokens)
      .set({
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        updatedAt: now,
      })
      .where(eq(schwabTokens.userId, userId));
  } else {
    await db.insert(schwabTokens).values({
      userId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getSchwabTokens(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(schwabTokens)
    .where(eq(schwabTokens.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSchwabAccountNumbers(
  userId: number,
  accountNumbers: Array<{ accountNumber: string; hashValue: string }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(schwabTokens)
    .set({ accountNumbers, updatedAt: Date.now() })
    .where(eq(schwabTokens.userId, userId));
}

export async function updateSchwabSyncStatus(
  userId: number,
  status: "ok" | "error" | "token_expired"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(schwabTokens)
    .set({ lastSyncAt: Date.now(), lastSyncStatus: status, updatedAt: Date.now() })
    .where(eq(schwabTokens.userId, userId));
}

// ─── Get Valid Access Token (auto-refresh if needed) ─────────────────────────

export async function getValidAccessToken(userId: number): Promise<string> {
  const tokens = await getSchwabTokens(userId);
  if (!tokens) throw new Error("Schwab not connected — please authorize first");

  const now = Date.now();

  // Check refresh token expiry
  if (now >= tokens.refreshTokenExpiresAt) {
    await updateSchwabSyncStatus(userId, "token_expired");
    throw new Error(
      "Schwab refresh token expired — please re-authorize at /api/schwab/connect"
    );
  }

  // If access token is still valid (with 2-min buffer), use it
  if (now < tokens.accessTokenExpiresAt - 2 * 60 * 1000) {
    return tokens.accessToken;
  }

  // Refresh the access token
  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    await saveSchwabTokens(
      userId,
      refreshed.access_token,
      refreshed.refresh_token ?? tokens.refreshToken,
      refreshed.expires_in
    );
    return refreshed.access_token;
  } catch (err) {
    await updateSchwabSyncStatus(userId, "error");
    throw err;
  }
}

// ─── Schwab API Calls ─────────────────────────────────────────────────────────

async function schwabGet(accessToken: string, path: string) {
  const res = await fetch(`${SCHWAB_TRADER_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab API error ${res.status} at ${path}: ${text}`);
  }
  return res.json();
}

// Get all account numbers + their hash values
export async function fetchAccountNumbers(
  accessToken: string
): Promise<Array<{ accountNumber: string; hashValue: string }>> {
  return schwabGet(accessToken, "/accounts/accountNumbers");
}

// Get all accounts with positions and balances
export async function fetchAllAccounts(
  accessToken: string,
  fields: "positions" | "orders" | "" = "positions"
): Promise<any[]> {
  const query = fields ? `?fields=${fields}` : "";
  return schwabGet(accessToken, `/accounts${query}`);
}

// Get a single account by hash
export async function fetchAccount(
  accessToken: string,
  accountHash: string,
  fields: "positions" | "orders" | "" = "positions"
): Promise<any> {
  const query = fields ? `?fields=${fields}` : "";
  return schwabGet(accessToken, `/accounts/${accountHash}${query}`);
}

// ─── Data Normalizers ─────────────────────────────────────────────────────────

export interface SchwabAccountSummary {
  accountNumber: string;
  hashValue: string;
  accountType: string;
  totalValue: number;
  cashBalance: number;
  buyingPower: number;
  dayPnl: number;
  totalPnl: number;
  positions: SchwabPosition[];
}

export interface SchwabPosition {
  symbol: string;
  description: string;
  assetType: string;
  quantity: number;
  marketValue: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayPnl: number;
}

export function normalizeAccount(raw: any): SchwabAccountSummary {
  const acct = raw.securitiesAccount ?? raw;
  const balances = acct.currentBalances ?? acct.initialBalances ?? {};
  const positions: SchwabPosition[] = (acct.positions ?? []).map((p: any) => {
    const instrument = p.instrument ?? {};
    const mktVal = p.marketValue ?? 0;
    const avgPrice = p.averagePrice ?? 0;
    const qty = p.longQuantity ?? p.shortQuantity ?? p.quantity ?? 0;
    const currentPrice = p.currentDayProfitLossPercentage != null
      ? avgPrice * (1 + p.currentDayProfitLossPercentage / 100)
      : (qty > 0 ? mktVal / qty : 0);
    return {
      symbol: instrument.symbol ?? instrument.cusip ?? "UNKNOWN",
      description: instrument.description ?? "",
      assetType: instrument.assetType ?? "EQUITY",
      quantity: qty,
      marketValue: mktVal,
      averagePrice: avgPrice,
      currentPrice,
      unrealizedPnl: p.longOpenProfitLoss ?? p.currentDayProfitLoss ?? 0,
      unrealizedPnlPct: p.currentDayProfitLossPercentage ?? 0,
      dayPnl: p.currentDayProfitLoss ?? 0,
    };
  });

  return {
    accountNumber: acct.accountNumber ?? "",
    hashValue: acct.hashValue ?? "",
    accountType: acct.type ?? "MARGIN",
    totalValue: balances.liquidationValue ?? balances.accountValue ?? 0,
    cashBalance: balances.cashBalance ?? balances.availableFunds ?? 0,
    buyingPower: balances.buyingPower ?? balances.availableFundsNonMarginableTrade ?? 0,
    dayPnl: balances.dayTradingBuyingPower ?? 0,
    totalPnl: 0, // not directly available from Schwab balance endpoint
    positions,
  };
}
