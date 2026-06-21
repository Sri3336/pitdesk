import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AnalysisRun,
  AgentRun,
  BrokerConnection,
  CatalystBreakoutWatchEntry,
  CotAlert,
  CriteriaWeight,
  FibEmaAlert,
  InsertAgentRun,
  InsertAnalysisRun,
  InsertBrokerConnection,
  InsertCatalystBreakoutWatch,
  InsertCotAlert,
  InsertFibEmaAlert,
  InsertIvrAlert,
  InsertManualTrade,
  InsertPcrAlertSetting,
  InsertPcrOiSnapshot,
  InsertPcrScheduledResult,
  InsertScanOutcome,
  InsertTradeProposal,
  InsertUser,
  InsertVcpAlert,
  InsertWatchlist,
  IvrAlert,
  ManualTrade,
  PasswordResetToken,
  PcrAlertSetting,
  PcrOiSnapshot,
  PcrScheduledResult,
  ScanOutcome,
  TradeProposal,
  VcpAlert,
  Watchlist,
  agentRuns,
  analysisRuns,
  brokerConnections,
  catalystBreakoutWatch,
  cotAlerts,
  criteriaWeights,
  fibEmaAlertHistory,
  fibEmaAlerts,
  ivrAlerts,
  manualTrades,
  passwordResetTokens,
  pcrAlertSettings,
  pcrOiSnapshots,
  pcrScheduledResults,
  scanOutcomes,
  tradeProposals,
  users,
  vcpAlerts,
  watchlist,
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
    .set({ exitPrice: String(exitPrice), realizedPnl: String(pnl), status: "closed" })
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

export async function updateEntryTime(
  id: number,
  userId: number,
  entryTime: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(manualTrades)
    .set({ entryTime })
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

// ─── Watchlist ────────────────────────────────────────────────────────────────
export async function getWatchlist(userId: number): Promise<Watchlist[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(desc(watchlist.createdAt));
}

export async function addToWatchlist(userId: number, ticker: string, notes?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(watchlist).values({ userId, ticker, notes }).onDuplicateKeyUpdate({ set: { notes } });
}

export async function removeFromWatchlist(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(watchlist).where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)));
}

export async function updateWatchlistNotes(id: number, userId: number, notes: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(watchlist).set({ notes }).where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)));
}

// ─── IVR Alerts ───────────────────────────────────────────────────────────────
export async function getIvrAlerts(userId: number): Promise<IvrAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ivrAlerts).where(eq(ivrAlerts.userId, userId)).orderBy(desc(ivrAlerts.createdAt));
}

export async function getAllIvrAlerts(): Promise<IvrAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ivrAlerts).where(eq(ivrAlerts.status, "active"));
}

export async function createIvrAlert(data: Omit<InsertIvrAlert, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(ivrAlerts).values(data);
}

export async function deleteIvrAlert(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(ivrAlerts).where(and(eq(ivrAlerts.id, id), eq(ivrAlerts.userId, userId)));
}

export async function updateIvrAlertStatus(id: number, status: "active" | "triggered" | "paused", lastTriggeredAt?: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(ivrAlerts).set({ status, ...(lastTriggeredAt ? { lastTriggeredAt } : {}) }).where(eq(ivrAlerts.id, id));
}

export async function updateIvrAlertLastChecked(id: number, lastIvr: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(ivrAlerts).set({ lastCheckedAt: new Date(), lastIvr: String(lastIvr) }).where(eq(ivrAlerts.id, id));
}

// ─── VCP Alerts ───────────────────────────────────────────────────────────────
export async function getVcpAlerts(userId: number): Promise<VcpAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vcpAlerts).where(eq(vcpAlerts.userId, userId)).orderBy(desc(vcpAlerts.createdAt));
}

export async function getAllVcpAlerts(): Promise<VcpAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vcpAlerts).where(eq(vcpAlerts.status, "active"));
}

export async function createVcpAlert(data: Omit<InsertVcpAlert, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(vcpAlerts).values(data);
}

export async function deleteVcpAlert(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(vcpAlerts).where(and(eq(vcpAlerts.id, id), eq(vcpAlerts.userId, userId)));
}

export async function updateVcpAlertStatus(id: number, status: "active" | "triggered" | "paused", lastTriggeredAt?: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(vcpAlerts).set({ status, ...(lastTriggeredAt ? { lastTriggeredAt } : {}) }).where(eq(vcpAlerts.id, id));
}

export async function updateVcpAlertLastChecked(id: number, lastDistancePct: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(vcpAlerts).set({ lastCheckedAt: new Date(), lastDistancePct: String(lastDistancePct) }).where(eq(vcpAlerts.id, id));
}

// ─── Broker Connections ───────────────────────────────────────────────────────
export async function getBrokerConnections(userId: number): Promise<BrokerConnection[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(brokerConnections).where(eq(brokerConnections.userId, userId));
}

export async function upsertBrokerConnection(data: Omit<InsertBrokerConnection, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(brokerConnections).values(data).onDuplicateKeyUpdate({ set: { ...data } });
}

export async function deleteBrokerConnection(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(brokerConnections).where(and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId)));
}

// ─── Agent Runs ───────────────────────────────────────────────────────────────
export async function createAgentRun(data: Omit<InsertAgentRun, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(agentRuns).values(data);
  return (result as any).insertId ?? 0;
}

export async function updateAgentRun(id: number, data: Partial<AgentRun>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(agentRuns).set(data).where(eq(agentRuns.id, id));
}

export async function getAgentRuns(userId: number, limit = 20): Promise<AgentRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentRuns).where(eq(agentRuns.userId, userId)).orderBy(desc(agentRuns.createdAt)).limit(limit);
}

// ─── Trade Proposals ──────────────────────────────────────────────────────────
export async function saveTradeProposal(data: Omit<InsertTradeProposal, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(tradeProposals).values(data);
  return (result as any).insertId ?? 0;
}

export async function getTradeProposals(userId: number, status?: string): Promise<TradeProposal[]> {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(tradeProposals).where(eq(tradeProposals.userId, userId)).orderBy(desc(tradeProposals.createdAt)).limit(100);
  return q;
}

export async function updateTradeProposalStatus(id: number, userId: number, status: "pending" | "approved" | "rejected" | "executed" | "failed", rejectionReason?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tradeProposals).set({ status, ...(rejectionReason ? { rejectionReason } : {}) }).where(and(eq(tradeProposals.id, id), eq(tradeProposals.userId, userId)));
}

// ─── Catalyst Breakout Watch ──────────────────────────────────────────────────
export async function getCatalystBreakoutWatch(userId: number): Promise<CatalystBreakoutWatchEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(catalystBreakoutWatch).where(eq(catalystBreakoutWatch.userId, userId)).orderBy(desc(catalystBreakoutWatch.createdAt));
}

export async function addCatalystBreakoutWatch(data: Omit<InsertCatalystBreakoutWatch, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(catalystBreakoutWatch).values(data);
}

export async function updateCatalystBreakoutWatch(id: number, userId: number, data: Partial<CatalystBreakoutWatchEntry>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(catalystBreakoutWatch).set(data).where(and(eq(catalystBreakoutWatch.id, id), eq(catalystBreakoutWatch.userId, userId)));
}

export async function deleteCatalystBreakoutWatch(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(catalystBreakoutWatch).where(and(eq(catalystBreakoutWatch.id, id), eq(catalystBreakoutWatch.userId, userId)));
}

export async function getAllCatalystBreakoutWatch(): Promise<CatalystBreakoutWatchEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(catalystBreakoutWatch).where(eq(catalystBreakoutWatch.status, "watching"));
}

// ─── COT Alerts ───────────────────────────────────────────────────────────────
export async function getCotAlerts(userId: number): Promise<CotAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cotAlerts).where(eq(cotAlerts.userId, userId)).orderBy(desc(cotAlerts.createdAt));
}

export async function getAllCotAlerts(): Promise<CotAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cotAlerts).where(eq(cotAlerts.status, "active"));
}

export async function createCotAlert(data: Omit<InsertCotAlert, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(cotAlerts).values(data);
}

export async function deleteCotAlert(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(cotAlerts).where(and(eq(cotAlerts.id, id), eq(cotAlerts.userId, userId)));
}

export async function updateCotAlertStatus(id: number, status: "active" | "paused" | "triggered", lastCotIndex?: number, lastTriggeredAt?: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(cotAlerts).set({ status, ...(lastCotIndex !== undefined ? { lastCotIndex } : {}), ...(lastTriggeredAt ? { lastTriggeredAt } : {}) }).where(eq(cotAlerts.id, id));
}

// ─── Admin helpers ────────────────────────────────────────────────────────────
export async function setUserRole(userId: number, role: "user" | "admin"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserActive(userId: number, isActive: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role: isActive ? "user" : "user" }).where(eq(users.id, userId));
}

export async function updateUserName(id: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ name }).where(eq(users.id, id));
}

export async function getAllAnalysisRuns(limit = 500): Promise<AnalysisRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(analysisRuns).orderBy(desc(analysisRuns.createdAt)).limit(limit);
}

export async function bulkDeleteAnalysisRuns(ids: number[], userId: number, isAdmin: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const id of ids) {
    if (isAdmin) {
      await db.delete(analysisRuns).where(eq(analysisRuns.id, id));
    } else {
      await db.delete(analysisRuns).where(and(eq(analysisRuns.id, id), eq(analysisRuns.userId, userId)));
    }
  }
}

export async function saveTrackedRecommendation(data: any): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { trackedRecommendations } = await import("../drizzle/schema");
  await db.insert(trackedRecommendations).values(data);
}

export async function getTrackedRecommendations(userId: number, limit = 200): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const { trackedRecommendations } = await import("../drizzle/schema");
  return db.select().from(trackedRecommendations).where(eq(trackedRecommendations.userId, userId)).orderBy(desc(trackedRecommendations.createdAt)).limit(limit);
}

export async function getAllTrackedRecommendations(limit = 1000): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const { trackedRecommendations } = await import("../drizzle/schema");
  return db.select().from(trackedRecommendations).orderBy(desc(trackedRecommendations.createdAt)).limit(limit);
}

export async function deleteTrackedRecommendation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { trackedRecommendations } = await import("../drizzle/schema");
  await db.delete(trackedRecommendations).where(and(eq(trackedRecommendations.id, id), eq(trackedRecommendations.userId, userId)));
}

export async function deleteTrackedRecommendations(ids: number[], userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { trackedRecommendations } = await import("../drizzle/schema");
  for (const id of ids) {
    await db.delete(trackedRecommendations).where(and(eq(trackedRecommendations.id, id), eq(trackedRecommendations.userId, userId)));
  }
}

export async function adminDeleteTrackedRecommendations(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { trackedRecommendations } = await import("../drizzle/schema");
  for (const id of ids) {
    await db.delete(trackedRecommendations).where(eq(trackedRecommendations.id, id));
  }
}

export async function resolveTrackedRecommendation(id: number, userId: number, data: any): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { trackedRecommendations } = await import("../drizzle/schema");
  await db.update(trackedRecommendations).set(data).where(and(eq(trackedRecommendations.id, id), eq(trackedRecommendations.userId, userId)));
}

export async function updateTrackedRecommendationNotes(id: number, userId: number, notes: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { trackedRecommendations } = await import("../drizzle/schema");
  await db.update(trackedRecommendations).set({ notes }).where(and(eq(trackedRecommendations.id, id), eq(trackedRecommendations.userId, userId)));
}
