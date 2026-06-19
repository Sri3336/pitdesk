/**
 * E*TRADE API connector
 *
 * E*TRADE uses OAuth 1.0a (not OAuth 2.0).
 * Flow:
 *   1. Server calls E*TRADE to get a request token
 *   2. Frontend redirects user to E*TRADE authorization URL
 *   3. User authorizes and E*TRADE redirects back with oauth_verifier
 *   4. Server exchanges request token + verifier for access token
 *   5. Access tokens are long-lived (no expiry, but revocable)
 *
 * Docs: https://developer.etrade.com/getting-started
 */

import crypto from "crypto";
import { getDb } from "../db";
import { brokerConnections } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

// ── Env helpers ───────────────────────────────────────────────────────────────

function getEtradeConsumerKey() {
  const k = process.env.ETRADE_CONSUMER_KEY;
  if (!k) throw new Error("ETRADE_CONSUMER_KEY is not configured");
  return k;
}

function getEtradeConsumerSecret() {
  const s = process.env.ETRADE_CONSUMER_SECRET;
  if (!s) throw new Error("ETRADE_CONSUMER_SECRET is not configured");
  return s;
}

// Use sandbox URLs for testing, production for live
function isProduction() {
  return process.env.ETRADE_ENV === "production";
}

const ETRADE_BASE = () =>
  isProduction()
    ? "https://api.etrade.com"
    : "https://apisb.etrade.com";

// ── OAuth 1.0a signature helper ───────────────────────────────────────────────

interface OAuth1Params {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  tokenKey?: string;
  tokenSecret?: string;
  extraParams?: Record<string, string>;
}

function buildOAuth1Header(opts: OAuth1Params): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
    ...(opts.tokenKey ? { oauth_token: opts.tokenKey } : {}),
    ...(opts.extraParams ?? {}),
  };

  // Build signature base string
  const allParams = { ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&");

  const sigBase = [
    opts.method.toUpperCase(),
    encodeURIComponent(opts.url),
    encodeURIComponent(sortedParams),
  ].join("&");

  const sigKey = `${encodeURIComponent(opts.consumerSecret)}&${encodeURIComponent(opts.tokenSecret ?? "")}`;
  const signature = crypto.createHmac("sha1", sigKey).update(sigBase).digest("base64");

  oauthParams.oauth_signature = signature;

  const headerValue = "OAuth " +
    Object.keys(oauthParams)
      .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(", ");

  return headerValue;
}

// ── Step 1: Get request token ─────────────────────────────────────────────────

export async function getEtradeRequestToken(callbackUrl: string): Promise<{ oauthToken: string; oauthTokenSecret: string }> {
  const url = `${ETRADE_BASE()}/oauth/request_token`;

  const authHeader = buildOAuth1Header({
    method: "GET",
    url,
    consumerKey: getEtradeConsumerKey(),
    consumerSecret: getEtradeConsumerSecret(),
    extraParams: { oauth_callback: callbackUrl },
  });

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E*TRADE request token failed: ${res.status} ${text}`);
  }

  const text = await res.text();
  const params = new URLSearchParams(text);
  return {
    oauthToken: params.get("oauth_token") ?? "",
    oauthTokenSecret: params.get("oauth_token_secret") ?? "",
  };
}

// ── Step 2: Build authorization URL ──────────────────────────────────────────

export function buildEtradeAuthUrl(oauthToken: string): string {
  return `https://us.etrade.com/e/t/etws/authorize?key=${getEtradeConsumerKey()}&token=${oauthToken}`;
}

// ── Step 3: Exchange verifier for access token ────────────────────────────────

export async function exchangeEtradeVerifier(
  oauthToken: string,
  oauthTokenSecret: string,
  oauthVerifier: string
): Promise<{ accessToken: string; accessTokenSecret: string }> {
  const url = `${ETRADE_BASE()}/oauth/access_token`;

  const authHeader = buildOAuth1Header({
    method: "GET",
    url,
    consumerKey: getEtradeConsumerKey(),
    consumerSecret: getEtradeConsumerSecret(),
    tokenKey: oauthToken,
    tokenSecret: oauthTokenSecret,
    extraParams: { oauth_verifier: oauthVerifier },
  });

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E*TRADE access token exchange failed: ${res.status} ${text}`);
  }

  const text = await res.text();
  const params = new URLSearchParams(text);
  return {
    accessToken: params.get("oauth_token") ?? "",
    accessTokenSecret: params.get("oauth_token_secret") ?? "",
  };
}

// ── Token storage ─────────────────────────────────────────────────────────────

export async function saveEtradeConnection(
  userId: number,
  accessToken: string,
  accessTokenSecret: string,
  accountId?: string,
  accountLabel?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Store access token + secret together (secret needed for every signed request)
  const combined = JSON.stringify({ token: accessToken, secret: accessTokenSecret });

  await db
    .delete(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, "etrade")));

  await db.insert(brokerConnections).values({
    userId,
    broker: "etrade",
    accessToken: combined,
    refreshToken: null,
    tokenExpiry: null, // E*TRADE access tokens don't expire
    accountId: accountId ?? null,
    accountLabel: accountLabel ?? null,
    isActive: true,
  });
}

export async function getEtradeConnection(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, "etrade"), eq(brokerConnections.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEtradeTokens(userId: number): Promise<{ token: string; secret: string } | null> {
  const conn = await getEtradeConnection(userId);
  if (!conn) return null;
  try {
    const parsed = JSON.parse(conn.accessToken) as { token: string; secret: string };
    return parsed;
  } catch {
    return null;
  }
}

export async function disconnectEtrade(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, "etrade")));
}

// ── E*TRADE API calls ─────────────────────────────────────────────────────────

async function etradeGet(path: string, token: string, secret: string) {
  const url = `${ETRADE_BASE()}${path}`;
  const authHeader = buildOAuth1Header({
    method: "GET",
    url,
    consumerKey: getEtradeConsumerKey(),
    consumerSecret: getEtradeConsumerSecret(),
    tokenKey: token,
    tokenSecret: secret,
  });

  const res = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E*TRADE GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function etradePost(path: string, token: string, secret: string, body: unknown) {
  const url = `${ETRADE_BASE()}${path}`;
  const authHeader = buildOAuth1Header({
    method: "POST",
    url,
    consumerKey: getEtradeConsumerKey(),
    consumerSecret: getEtradeConsumerSecret(),
    tokenKey: token,
    tokenSecret: secret,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E*TRADE POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getEtradeAccounts(token: string, secret: string) {
  return etradeGet("/v1/accounts/list.json", token, secret);
}

export async function getEtradeOptionChain(
  token: string,
  secret: string,
  symbol: string,
  expiryYear: number,
  expiryMonth: number,
  expiryDay: number,
  optionCategory: "STANDARD" | "ALL" = "STANDARD"
) {
  const params = new URLSearchParams({
    symbol,
    expiryYear: String(expiryYear),
    expiryMonth: String(expiryMonth),
    expiryDay: String(expiryDay),
    optionCategory,
    chainType: "CALLPUT",
    skipAdjusted: "true",
  });
  return etradeGet(`/v1/market/optionchains.json?${params.toString()}`, token, secret);
}

export interface EtradeOrderLeg {
  orderAction: "BUY_OPEN" | "SELL_OPEN" | "BUY_CLOSE" | "SELL_CLOSE";
  quantity: number;
  instrument: {
    Product: {
      securityType: "OPTN";
      symbol: string;
      callPut: "CALL" | "PUT";
      expiryYear: number;
      expiryMonth: number;
      expiryDay: number;
      strikePrice: number;
    };
  };
}

export async function placeEtradeOrder(
  token: string,
  secret: string,
  accountIdKey: string,
  legs: EtradeOrderLeg[],
  netCreditLimit: number,
  clientOrderId: string
): Promise<{ orderId: string }> {
  const body = {
    PlaceOrderRequest: {
      orderType: "SPREADS",
      clientOrderId,
      Order: [
        {
          priceType: "NET_CREDIT",
          limitPrice: netCreditLimit.toFixed(2),
          orderTerm: "GOOD_FOR_DAY",
          marketSession: "REGULAR",
          Instrument: legs.map(leg => ({
            Product: leg.instrument.Product,
            orderAction: leg.orderAction,
            quantityType: "QUANTITY",
            quantity: leg.quantity,
          })),
        },
      ],
    },
  };

  const result = await etradePost(
    `/v1/accounts/${accountIdKey}/orders/place.json`,
    token,
    secret,
    body
  );
  return { orderId: result?.PlaceOrderResponse?.OrderIds?.[0]?.orderId ?? "unknown" };
}
