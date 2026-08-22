import type { Express, Request, Response } from "express";
import { SignJWT } from "jose";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { upsertGoogleUser } from "../db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-dev-secret");

async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
}

// Build Google OAuth authorization URL
export function getGoogleAuthUrl(baseUrl?: string, state?: string): string {
  const callbackUrl = baseUrl
    ? `${baseUrl}/api/auth/google/callback`
    : getGoogleCallbackUrl();
  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function getGoogleCallbackUrl(): string {
  if (ENV.appUrl) {
    return `${ENV.appUrl.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  if (ENV.isProduction) {
    return "https://trading.akulaz.ai/api/auth/google/callback";
  }
  return "http://localhost:3000/api/auth/google/callback";
}

export function getBaseUrl(req: { protocol: string; headers: Record<string, string | string[] | undefined> }): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "http";
  return `${proto}://${host}`;
}

// Exchange code for tokens and get user info from Google
async function exchangeCodeForUser(code: string, baseUrl?: string): Promise<{
  googleId: string;
  email: string;
  name: string;
} | null> {
  try {
    // Exchange authorization code for tokens
    const callbackUrl = baseUrl
      ? `${baseUrl}/api/auth/google/callback`
      : getGoogleCallbackUrl();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ENV.googleClientId,
        client_secret: ENV.googleClientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[GoogleAuth] Token exchange failed:", await tokenRes.text());
      return null;
    }

    const tokenData = await tokenRes.json() as { access_token: string; id_token?: string };

    // Get user info from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error("[GoogleAuth] User info fetch failed:", await userRes.text());
      return null;
    }

    const userData = await userRes.json() as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    return {
      googleId: userData.id,
      email: userData.email,
      name: userData.name,
    };
  } catch (error) {
    console.error("[GoogleAuth] Exchange error:", error);
    return null;
  }
}

export function registerGoogleAuthRoutes(app: Express) {
  // Redirect to Google OAuth
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const base = getBaseUrl(req as unknown as Parameters<typeof getBaseUrl>[0]);
    const url = getGoogleAuthUrl(base);
    res.redirect(url);
  });

  // Google OAuth callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const { code, error } = req.query as { code?: string; error?: string };

    if (error || !code) {
      console.error("[GoogleAuth] Callback error:", error);
      return res.redirect("/signin?error=google_auth_failed");
    }

    try {
      const base = getBaseUrl(req as unknown as Parameters<typeof getBaseUrl>[0]);
      const googleUser = await exchangeCodeForUser(code, base);
      if (!googleUser) {
        return res.redirect("/signin?error=google_auth_failed");
      }

      const user = await upsertGoogleUser(googleUser);
      if (!user) {
        return res.redirect("/signin?error=account_creation_failed");
      }

      const token = await createSessionToken(user.id);
      res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });

      // Redirect to the originally requested page or home
      const returnPath = (req.query.state as string) || "/";
      res.redirect(returnPath);
    } catch (err) {
      console.error("[GoogleAuth] Callback handler error:", err);
      res.redirect("/signin?error=server_error");
    }
  });
}
