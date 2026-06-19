import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AnalysisRun,
  CriteriaWeight,
  FibEmaAlert,
  InsertAnalysisRun,
  InsertFibEmaAlert,
  InsertManualTrade,
  InsertPcrAlertSetting,
  InsertPcrOiSnapshot,
  InsertPcrScheduledResult,
  InsertScanOutcome,
  InsertUser,
  ManualTrade,
  PasswordResetToken,
  PcrAlertSetting,
  PcrOiSnapshot,
  PcrScheduledResult,
  ScanOutcome,
  analysisRuns,
  criteriaWeights,
  fibEmaAlertHistory,
  fibEmaAlerts,
  manualTrades,
  passwordResetTokens,
  pcrAlertSettings,
  pcrOiSnapshots,
  pcrScheduledResults,
  scanOutcomes,
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

// ─── Analysis Runs ───────────────────────────────────────────────────────────

export async function saveAnalysisRun(data: Omit<InsertAnalysisRun, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(analysisRuns).values(data);
  return (result as any).insertId as number;
}

export async function getAnalysisRunsByUser(userId: number, limit = 50): Promise<AnalysisRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(analysisRuns)
    .where(eq(analysisRuns.userId, userId))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(limit);
}

export async function deleteAnalysisRun(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(analysisRuns).where(and(eq(analysisRuns.id, id), eq(analysisRuns.userId, userId)));
}

// ─── PCR OI Snapshots ────────────────────────────────────────────────────────

export async function savePcrOiSnapshot(data: Omit<InsertPcrOiSnapshot, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(pcrOiSnapshots).values(data);
}

export async function getLatestPcrOiSnapshot(ticker: string): Promise<PcrOiSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pcrOiSnapshots)
    .where(eq(pcrOiSnapshots.ticker, ticker))
    .orderBy(desc(pcrOiSnapshots.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllLatestPcrSnapshots(): Promise<PcrOiSnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  // Get the most recent snapshot per ticker
  return db.select().from(pcrOiSnapshots)
    .orderBy(desc(pcrOiSnapshots.createdAt))
    .limit(200);
}

// ─── PCR Scheduled Results ───────────────────────────────────────────────────

export async function savePcrScheduledResult(data: InsertPcrScheduledResult): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(pcrScheduledResults).values(data);
}

export async function getLatestPcrResults(limit = 120): Promise<PcrScheduledResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pcrScheduledResults)
    .orderBy(desc(pcrScheduledResults.createdAt))
    .limit(limit);
}

// ─── PCR Alert Settings ──────────────────────────────────────────────────────

export async function getPcrAlertSettings(userId: number): Promise<PcrAlertSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pcrAlertSettings).where(eq(pcrAlertSettings.userId, userId));
}

export async function upsertPcrAlertSetting(data: InsertPcrAlertSetting): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(pcrAlertSettings).values(data);
}

export async function deletePcrAlertSetting(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pcrAlertSettings).where(and(eq(pcrAlertSettings.id, id), eq(pcrAlertSettings.userId, userId)));
}

// ─── Scan Outcomes (self-learning) ───────────────────────────────────────────

export async function insertScanOutcome(data: InsertScanOutcome): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scanOutcomes).values(data);
}

export async function getScanOutcomes(limit = 500): Promise<ScanOutcome[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scanOutcomes).orderBy(desc(scanOutcomes.createdAt)).limit(limit);
}

export async function resolveScanOutcome(id: number, exitPrice: number, outcome: "win" | "loss" | "neutral", pnlPct: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scanOutcomes).set({
    exitPrice: String(exitPrice),
    outcome,
    pnlPct: String(pnlPct),
    evaluatedAt: new Date(),
  }).where(eq(scanOutcomes.id, id));
}

// ─── Criteria Weights ────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
  "Daily Trend": 1.5,
  "EMA Stack 15m": 1.5,
  "VWAP": 1.0,
  "RVOL": 1.5,
  "RSI": 1.0,
  "Price Structure": 1.0,
  "Entry Quality": 1.0,
  "Candle Confirm": 1.5,
  "ATR Expansion": 1.0,
};

export async function getCriteriaWeights(userId: number): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return DEFAULT_WEIGHTS;
  const rows = await db.select().from(criteriaWeights).where(eq(criteriaWeights.userId, userId));
  if (rows.length === 0) return DEFAULT_WEIGHTS;
  const result: Record<string, number> = { ...DEFAULT_WEIGHTS };
  for (const row of rows) {
    result[row.criterionName] = parseFloat(row.weight);
  }
  return result;
}

export async function updateCriteriaWeight(userId: number, criterionName: string, weight: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Upsert: delete existing then insert
  await db.delete(criteriaWeights).where(
    and(eq(criteriaWeights.userId, userId), eq(criteriaWeights.criterionName, criterionName))
  );
  await db.insert(criteriaWeights).values({ userId, criterionName, weight: String(weight) });
}

export async function resetCriteriaWeights(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(criteriaWeights).where(eq(criteriaWeights.userId, userId));
}
