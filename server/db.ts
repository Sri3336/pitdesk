import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  FibEmaAlert,
  InsertFibEmaAlert,
  InsertManualTrade,
  InsertUser,
  ManualTrade,
  PasswordResetToken,
  fibEmaAlertHistory,
  fibEmaAlerts,
  manualTrades,
  passwordResetTokens,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users (legacy Manus OAuth) ──────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Users (custom email/password auth) ──────────────────────────────────────

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values({
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash: data.passwordHash,
    loginMethod: "email",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email.toLowerCase()))
    .limit(1);
  return result[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return result[0] ?? null;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// ─── Users (Google OAuth) ─────────────────────────────────────────────────────

export async function getUserByGoogleId(googleId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.googleId, googleId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertGoogleUser(data: {
  googleId: string;
  name: string;
  email: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user exists by googleId
  const existing = await getUserByGoogleId(data.googleId);
  if (existing) {
    await db
      .update(users)
      .set({ lastSignedIn: new Date(), name: data.name })
      .where(eq(users.id, existing.id));
    return existing;
  }

  // Check if user exists by email (link accounts)
  const byEmail = await getUserByEmail(data.email);
  if (byEmail) {
    await db
      .update(users)
      .set({ googleId: data.googleId, lastSignedIn: new Date() })
      .where(eq(users.id, byEmail.id));
    return byEmail;
  }

  // Create new user
  await db.insert(users).values({
    googleId: data.googleId,
    name: data.name,
    email: data.email.toLowerCase(),
    loginMethod: "google",
    role: "user",
    lastSignedIn: new Date(),
  });
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email.toLowerCase()))
    .limit(1);
  return result[0] ?? null;
}

// ─── Password reset helpers ───────────────────────────────────────────────────

export async function createPasswordResetToken(userId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
}

export async function getValidPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, now),
        isNull(passwordResetTokens.usedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markPasswordResetTokenUsed(token: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.token, token));
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      loginMethod: users.loginMethod,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(users.createdAt);
}

export async function updateUserRole(userId: number, role: "admin" | "user") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function deleteUserById(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, userId));
}

export async function updateUserProfile(userId: number, data: { name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if (data.name !== undefined) updateSet.name = data.name;
  if (Object.keys(updateSet).length === 0) return;
  await db.update(users).set(updateSet).where(eq(users.id, userId));
}

// ─── Manual Trades ────────────────────────────────────────────────────────────

export async function insertManualTrade(trade: InsertManualTrade): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(manualTrades).values(trade);
}

export async function getManualTradesByUser(userId: number): Promise<ManualTrade[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(manualTrades).where(eq(manualTrades.userId, userId)).orderBy(desc(manualTrades.createdAt));
}

export async function closeTrade(
  id: number,
  userId: number,
  exitPrice: number,
  pnl: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(manualTrades)
    .set({ exitPrice: String(exitPrice), pnl: String(pnl), status: "closed", closedAt: new Date() })
    .where(and(eq(manualTrades.id, id), eq(manualTrades.userId, userId)));
}

export async function updateTradeNotes(
  id: number,
  userId: number,
  postTradeNotes: string,
  lessonsLearned: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(manualTrades)
    .set({ postTradeNotes, lessonsLearned })
    .where(and(eq(manualTrades.id, id), eq(manualTrades.userId, userId)));
}

// ─── Fib+EMA Alerts ──────────────────────────────────────────────────────────

export async function getFibEmaAlertsByUser(userId: number): Promise<FibEmaAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fibEmaAlerts).where(eq(fibEmaAlerts.userId, userId)).orderBy(fibEmaAlerts.ticker);
}

export async function upsertFibEmaAlert(alert: InsertFibEmaAlert): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(fibEmaAlerts).values(alert).onDuplicateKeyUpdate({
    set: {
      enabled: alert.enabled,
      proximityPct: alert.proximityPct,
      fibLevels: alert.fibLevels,
      emaPeriods: alert.emaPeriods,
      emailEnabled: alert.emailEnabled,
      pushEnabled: alert.pushEnabled,
    },
  });
}

export async function deleteFibEmaAlert(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(fibEmaAlerts).where(and(eq(fibEmaAlerts.id, id), eq(fibEmaAlerts.userId, userId)));
}

export async function getFibEmaAlertHistory(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fibEmaAlertHistory).orderBy(desc(fibEmaAlertHistory.scannedAt)).limit(limit);
}

export async function insertFibEmaAlertHistory(entry: {
  ticker: string;
  currentPrice: number;
  swingHigh: number;
  swingLow: number;
  fibLevel: number;
  fibPrice: number;
  emaPeriod: number;
  emaPrice: number;
  proximityPct: number;
  notifiedEmail: boolean;
  notifiedPush: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(fibEmaAlertHistory).values({
    ...entry,
    currentPrice: String(entry.currentPrice),
    swingHigh: String(entry.swingHigh),
    swingLow: String(entry.swingLow),
    fibPrice: String(entry.fibPrice),
    emaPrice: String(entry.emaPrice),
  });
}
