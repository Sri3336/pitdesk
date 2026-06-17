import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  FibEmaAlert,
  InsertFibEmaAlert,
  InsertManualTrade,
  InsertUser,
  ManualTrade,
  fibEmaAlertHistory,
  fibEmaAlerts,
  manualTrades,
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

// ─── Users ───────────────────────────────────────────────────────────────────

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
