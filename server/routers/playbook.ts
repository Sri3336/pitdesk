import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { accountSnapshots, playbookPositions, monthlyPnl } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

const OWNER_USER_ID = 210001;

const legSchema = z.object({
  action: z.enum(["sell", "buy"]),
  strike: z.number(),
  type: z.enum(["call", "put"]),
  expiry: z.string(),
  qty: z.number(),
});

const positionInput = z.object({
  accountId: z.string(),
  accountLabel: z.string(),
  ticker: z.string(),
  strategy: z.enum(["iron_condor", "strangle", "naked_put", "naked_call", "other"]),
  legs: z.array(legSchema),
  expiry: z.string(),
  creditCollected: z.number(),
  maxRisk: z.number().optional(),
  contracts: z.number(),
  shortCallStrike: z.number().optional(),
  shortPutStrike: z.number().optional(),
  entryDate: z.string(),
  notes: z.string().optional(),
});

export const playbookRouter = router({
  // Save EOD snapshot for all accounts
  saveSnapshot: protectedProcedure
    .input(z.object({
      snapshotDate: z.string(),
      accounts: z.array(z.object({
        accountId: z.string(),
        accountLabel: z.string(),
        totalValue: z.number(),
        cashValue: z.number(),
        marketValue: z.number(),
        dayPnl: z.number(),
        totalPnl: z.number(),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      for (const acct of input.accounts) {
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.userId, OWNER_USER_ID),
            eq(accountSnapshots.snapshotDate, input.snapshotDate),
            eq(accountSnapshots.accountId, acct.accountId),
          )
        );
        await db.insert(accountSnapshots).values({
          userId: OWNER_USER_ID,
          snapshotDate: input.snapshotDate,
          accountId: acct.accountId,
          accountLabel: acct.accountLabel,
          totalValue: String(acct.totalValue),
          cashValue: String(acct.cashValue),
          marketValue: String(acct.marketValue),
          dayPnl: String(acct.dayPnl),
          totalPnl: String(acct.totalPnl),
          notes: acct.notes ?? null,
          createdAt: now,
        });
      }
      return { ok: true };
    }),

  getLatestSnapshots: protectedProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    const rows = await db
      .select()
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, OWNER_USER_ID))
      .orderBy(desc(accountSnapshots.snapshotDate), desc(accountSnapshots.createdAt));
    const seen = new Set<string>();
    const latest: typeof rows = [];
    for (const r of rows) {
      if (!seen.has(r.accountId)) {
        seen.add(r.accountId);
        latest.push(r);
      }
    }
    return latest;
  }),

  getSnapshotHistory: protectedProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, OWNER_USER_ID))
      .orderBy(desc(accountSnapshots.snapshotDate));
  }),

  addPosition: protectedProcedure
    .input(positionInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const [result] = await db.insert(playbookPositions).values({
        userId: OWNER_USER_ID,
        accountId: input.accountId,
        accountLabel: input.accountLabel,
        ticker: input.ticker,
        strategy: input.strategy,
        legs: input.legs,
        expiry: input.expiry,
        creditCollected: String(input.creditCollected),
        maxRisk: input.maxRisk ? String(input.maxRisk) : null,
        contracts: input.contracts,
        shortCallStrike: input.shortCallStrike ? String(input.shortCallStrike) : null,
        shortPutStrike: input.shortPutStrike ? String(input.shortPutStrike) : null,
        status: "open",
        entryDate: input.entryDate,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { id: (result as any).insertId };
    }),

  getOpenPositions: protectedProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(playbookPositions)
      .where(and(eq(playbookPositions.userId, OWNER_USER_ID), eq(playbookPositions.status, "open")))
      .orderBy(desc(playbookPositions.createdAt));
  }),

  getAllPositions: protectedProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(playbookPositions)
      .where(eq(playbookPositions.userId, OWNER_USER_ID))
      .orderBy(desc(playbookPositions.createdAt));
  }),

  closePosition: protectedProcedure
    .input(z.object({
      id: z.number(),
      closedPnl: z.number(),
      closeReason: z.string(),
      closeDate: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(playbookPositions)
        .set({
          status: "closed",
          closedPnl: String(input.closedPnl),
          closeReason: input.closeReason,
          closeDate: input.closeDate,
          updatedAt: Date.now(),
        })
        .where(and(eq(playbookPositions.id, input.id), eq(playbookPositions.userId, OWNER_USER_ID)));
      return { ok: true };
    }),

  deletePosition: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(playbookPositions)
        .where(and(eq(playbookPositions.id, input.id), eq(playbookPositions.userId, OWNER_USER_ID)));
      return { ok: true };
    }),

  upsertMonthlyPnl: protectedProcedure
    .input(z.object({
      month: z.string(),
      totalCapital: z.number(),
      targetPct: z.number().default(3),
      actualPnl: z.number(),
      tradesWon: z.number().default(0),
      tradesLost: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const existing = await db.select().from(monthlyPnl)
        .where(and(eq(monthlyPnl.userId, OWNER_USER_ID), eq(monthlyPnl.month, input.month)));
      if (existing.length > 0) {
        await db.update(monthlyPnl).set({
          totalCapital: String(input.totalCapital),
          targetPct: String(input.targetPct),
          targetAmount: String(input.totalCapital * input.targetPct / 100),
          actualPnl: String(input.actualPnl),
          tradesWon: input.tradesWon,
          tradesLost: input.tradesLost,
          updatedAt: now,
        }).where(and(eq(monthlyPnl.userId, OWNER_USER_ID), eq(monthlyPnl.month, input.month)));
      } else {
        await db.insert(monthlyPnl).values({
          userId: OWNER_USER_ID,
          month: input.month,
          totalCapital: String(input.totalCapital),
          targetPct: String(input.targetPct),
          targetAmount: String(input.totalCapital * input.targetPct / 100),
          actualPnl: String(input.actualPnl),
          tradesWon: input.tradesWon,
          tradesLost: input.tradesLost,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { ok: true };
    }),

  getMonthlyPnl: protectedProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new Error("Database not available");
    return db.select().from(monthlyPnl)
      .where(eq(monthlyPnl.userId, OWNER_USER_ID))
      .orderBy(desc(monthlyPnl.month));
  }),

  // Called by the Chrome extension — receives scraped brokerage data
  syncBrokerSnapshot: protectedProcedure
    .input(z.object({
      broker: z.enum(["etrade", "schwab"]),
      accountId: z.string(),
      accountLabel: z.string(),
      scrapedAt: z.string(),
      pageUrl: z.string().optional(),
      accountSummary: z.object({
        totalValue: z.number().optional(),
        cash: z.number().optional(),
        dayPnl: z.number().optional(),
        totalPnl: z.number().optional(),
      }).nullable().optional(),
      positions: z.array(z.object({
        symbol: z.string(),
        qty: z.number(),
        price: z.number(),
        costPerShare: z.number(),
        dayChange: z.number(),
        totalGain: z.number(),
        marketValue: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const today = new Date().toISOString().split("T")[0];

      // Save account snapshot if we have summary data
      if (input.accountSummary && input.accountSummary.totalValue) {
        const s = input.accountSummary;
        await db.delete(accountSnapshots).where(
          and(
            eq(accountSnapshots.userId, OWNER_USER_ID),
            eq(accountSnapshots.snapshotDate, today),
            eq(accountSnapshots.accountId, input.accountId),
          )
        );
        await db.insert(accountSnapshots).values({
          userId: OWNER_USER_ID,
          snapshotDate: today,
          accountId: input.accountId,
          accountLabel: input.accountLabel,
          totalValue: String(s.totalValue ?? 0),
          cashValue: String(s.cash ?? 0),
          marketValue: String((s.totalValue ?? 0) - (s.cash ?? 0)),
          dayPnl: String(s.dayPnl ?? 0),
          totalPnl: String(s.totalPnl ?? 0),
          notes: `Auto-synced via Chrome extension from ${input.broker} at ${input.scrapedAt}`,
          createdAt: now,
        });
      }

      return {
        ok: true,
        broker: input.broker,
        accountId: input.accountId,
        positionsReceived: input.positions.length,
        snapshotSaved: !!(input.accountSummary?.totalValue),
        syncedAt: now,
      };
    }),
});
