import {
  bigint,
  boolean,
  decimal,
  float,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Manual trade log
export const manualTrades = mysqlTable("manual_trades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 16 }).notNull(),
  strategy: varchar("strategy", { length: 64 }),
  direction: mysqlEnum("direction", ["long", "short"]).default("long").notNull(),
  entryPrice: decimal("entryPrice", { precision: 12, scale: 4 }),
  exitPrice: decimal("exitPrice", { precision: 12, scale: 4 }),
  swingLow: decimal("swingLow", { precision: 12, scale: 4 }),
  swingHigh: decimal("swingHigh", { precision: 12, scale: 4 }),
  quantity: int("quantity"),
  target1: decimal("target1", { precision: 12, scale: 4 }),
  target2: decimal("target2", { precision: 12, scale: 4 }),
  stopLoss: decimal("stopLoss", { precision: 12, scale: 4 }),
  pnl: decimal("pnl", { precision: 12, scale: 4 }),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  postTradeNotes: text("postTradeNotes"),
  lessonsLearned: text("lessonsLearned"),
  enteredAt: timestamp("enteredAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ManualTrade = typeof manualTrades.$inferSelect;
export type InsertManualTrade = typeof manualTrades.$inferInsert;

// Fib + EMA confluence alert configurations
export const fibEmaAlerts = mysqlTable("fib_ema_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 16 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  proximityPct: float("proximityPct").default(1.0).notNull(), // % threshold for confluence
  fibLevels: json("fibLevels").$type<number[]>().default([38.2, 61.8]), // which fib levels to watch
  emaPeriods: json("emaPeriods").$type<number[]>().default([9, 20, 50, 200]),
  emailEnabled: boolean("emailEnabled").default(true).notNull(),
  pushEnabled: boolean("pushEnabled").default(true).notNull(),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FibEmaAlert = typeof fibEmaAlerts.$inferSelect;
export type InsertFibEmaAlert = typeof fibEmaAlerts.$inferInsert;

// Fib + EMA confluence scan results / alert history
export const fibEmaAlertHistory = mysqlTable("fib_ema_alert_history", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 16 }).notNull(),
  currentPrice: decimal("currentPrice", { precision: 12, scale: 4 }),
  swingHigh: decimal("swingHigh", { precision: 12, scale: 4 }),
  swingLow: decimal("swingLow", { precision: 12, scale: 4 }),
  fibLevel: float("fibLevel"), // e.g. 38.2
  fibPrice: decimal("fibPrice", { precision: 12, scale: 4 }),
  emaPeriod: int("emaPeriod"), // e.g. 50
  emaPrice: decimal("emaPrice", { precision: 12, scale: 4 }),
  proximityPct: float("proximityPct"),
  notifiedEmail: boolean("notifiedEmail").default(false),
  notifiedPush: boolean("notifiedPush").default(false),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
});

export type FibEmaAlertHistory = typeof fibEmaAlertHistory.$inferSelect;
