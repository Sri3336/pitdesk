import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  accountSnapshots,
  playbookPositions,
  monthlyPnl,
  extensionSyncTokens,
  accountTransfers,
  eodCapitalSnapshots,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";

const OWNER_USER_ID = 1; // Sri's actual DB user ID (akulasridhar@gmail.com)

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

// ─── Canonical account ID helper ───────────────────────────────────────────
function canonicalId(id: string): string {
  if (id.startsWith("schwab_")) return "schwab_764";
  if (id.includes("4723")) return "etrade_4723";
  if (id.includes("2738")) return "etrade_2738";
  return id;
}

export const playbookRouter = router({
  // ─── Snapshots ─────────────────────────────────────────────────────────────

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
    const seen = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const key = canonicalId(r.accountId);
      if (!seen.has(key)) {
        seen.set(key, { ...r, accountId: key });
      }
    }
    return Array.from(seen.values());
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

  // ─── Positions ─────────────────────────────────────────────────────────────

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

  // ─── Monthly P&L ───────────────────────────────────────────────────────────

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

  // ─── Chrome Extension ──────────────────────────────────────────────────────

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

  generateExtensionToken: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      if (ctx.user.id !== OWNER_USER_ID) throw new Error("Forbidden");
      await db.delete(extensionSyncTokens).where(eq(extensionSyncTokens.userId, OWNER_USER_ID));
      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(extensionSyncTokens).values({
        userId: OWNER_USER_ID,
        token,
        label: "Chrome Extension",
        createdAt: Date.now(),
      });
      return { token };
    }),

  getExtensionToken: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { hasToken: false, maskedToken: null, lastUsedAt: null };
      if (ctx.user.id !== OWNER_USER_ID) return { hasToken: false, maskedToken: null, lastUsedAt: null };
      const rows = await db
        .select()
        .from(extensionSyncTokens)
        .where(eq(extensionSyncTokens.userId, OWNER_USER_ID))
        .limit(1);
      if (!rows.length) return { hasToken: false, maskedToken: null, lastUsedAt: null };
      const t = rows[0];
      const masked = t.token.slice(0, 8) + "..." + t.token.slice(-4);
      return { hasToken: true, maskedToken: masked, lastUsedAt: t.lastUsedAt };
    }),

  // ─── EOD Capital Tracking ──────────────────────────────────────────────────

  /**
   * Capture an EOD snapshot from the latest account_snapshots data.
   * Calculates transfer-adjusted P&L vs the previous EOD snapshot.
   * Called manually from the UI (or can be automated).
   */
  captureEodSnapshot: protectedProcedure
    .input(z.object({
      snapshotDate: z.string().optional(), // defaults to today
      notes: z.string().optional(),
    }))
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = Date.now();
      const today = new Date().toISOString().split("T")[0];

      // Get latest per-account snapshots
      const snapRows = await db
        .select()
        .from(accountSnapshots)
        .where(eq(accountSnapshots.userId, OWNER_USER_ID))
        .orderBy(desc(accountSnapshots.snapshotDate), desc(accountSnapshots.createdAt));

      // Deduplicate to latest per canonical account
      const seen = new Map<string, typeof snapRows[0]>();
      for (const r of snapRows) {
        const key = canonicalId(r.accountId);
        if (!seen.has(key)) seen.set(key, r);
      }

      const schwab = seen.get("schwab_764");
      const et4723 = seen.get("etrade_4723");
      const et2738 = seen.get("etrade_2738");

      const schwabVal = schwab ? parseFloat(String(schwab.totalValue)) : 0;
      const et4723Val = et4723 ? parseFloat(String(et4723.totalValue)) : 0;
      const et2738Val = et2738 ? parseFloat(String(et2738.totalValue)) : 0;
      const totalValue = schwabVal + et4723Val + et2738Val;

      // Get previous EOD snapshot to compute P&L
      const prevRows = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            lte(eodCapitalSnapshots.snapshotDate, today),
          )
        )
        .orderBy(desc(eodCapitalSnapshots.snapshotDate))
        .limit(2);

      // Find the most recent snapshot that isn't today (to avoid double-counting)
      const prevSnap = prevRows.find(r => r.snapshotDate < today) ?? prevRows[0] ?? null;
      const prevTotal = prevSnap ? parseFloat(String(prevSnap.totalValue)) : 0;

      // Sum transfers between prevSnap.snapshotDate and today
      let netTransfers = 0;
      if (prevSnap) {
        const transferRows = await db
          .select()
          .from(accountTransfers)
          .where(
            and(
              eq(accountTransfers.userId, OWNER_USER_ID),
              gte(accountTransfers.transferDate, prevSnap.snapshotDate),
              lte(accountTransfers.transferDate, today),
            )
          );
        for (const t of transferRows) {
          netTransfers += parseFloat(String(t.amount));
        }
      }

      const adjustedPnl = prevTotal > 0 ? totalValue - prevTotal - netTransfers : null;

      // Upsert today's EOD snapshot
      const existing = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            eq(eodCapitalSnapshots.snapshotDate, today),
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db.update(eodCapitalSnapshots)
          .set({
            totalValue: String(totalValue),
            schwab764Value: schwabVal > 0 ? String(schwabVal) : null,
            etrade4723Value: et4723Val > 0 ? String(et4723Val) : null,
            etrade2738Value: et2738Val > 0 ? String(et2738Val) : null,
            netTransfersSinceLastSnapshot: String(netTransfers),
            adjustedPnl: adjustedPnl !== null ? String(adjustedPnl) : null,
            createdAt: now,
          })
          .where(
            and(
              eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
              eq(eodCapitalSnapshots.snapshotDate, today),
            )
          );
      } else {
        await db.insert(eodCapitalSnapshots).values({
          userId: OWNER_USER_ID,
          snapshotDate: today,
          totalValue: String(totalValue),
          schwab764Value: schwabVal > 0 ? String(schwabVal) : null,
          etrade4723Value: et4723Val > 0 ? String(et4723Val) : null,
          etrade2738Value: et2738Val > 0 ? String(et2738Val) : null,
          netTransfersSinceLastSnapshot: String(netTransfers),
          adjustedPnl: adjustedPnl !== null ? String(adjustedPnl) : null,
          createdAt: now,
        });
      }

      return {
        ok: true,
        snapshotDate: today,
        totalValue,
        schwabVal,
        et4723Val,
        et2738Val,
        netTransfers,
        adjustedPnl,
      };
    }),

  /** Return all EOD capital snapshots for the chart */
  getEodHistory: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(eodCapitalSnapshots.userId, OWNER_USER_ID)];
      if (input?.fromDate) conditions.push(gte(eodCapitalSnapshots.snapshotDate, input.fromDate));
      if (input?.toDate) conditions.push(lte(eodCapitalSnapshots.snapshotDate, input.toDate));

      return db
        .select()
        .from(eodCapitalSnapshots)
        .where(and(...conditions))
        .orderBy(desc(eodCapitalSnapshots.snapshotDate));
    }),

  /** Return transfer-adjusted P&L for a date range (month-to-date by default) */
  getAdjustedPnl: protectedProcedure
    .input(z.object({
      fromDate: z.string(),
      toDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get the EOD snapshot at/before fromDate as the baseline
      const baselineRows = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            lte(eodCapitalSnapshots.snapshotDate, input.fromDate),
          )
        )
        .orderBy(desc(eodCapitalSnapshots.snapshotDate))
        .limit(1);

      // Get the most recent EOD snapshot at/before toDate
      const currentRows = await db
        .select()
        .from(eodCapitalSnapshots)
        .where(
          and(
            eq(eodCapitalSnapshots.userId, OWNER_USER_ID),
            lte(eodCapitalSnapshots.snapshotDate, input.toDate),
          )
        )
        .orderBy(desc(eodCapitalSnapshots.snapshotDate))
        .limit(1);

      // Sum all transfers in the date range
      const transferRows = await db
        .select()
        .from(accountTransfers)
        .where(
          and(
            eq(accountTransfers.userId, OWNER_USER_ID),
            gte(accountTransfers.transferDate, input.fromDate),
            lte(accountTransfers.transferDate, input.toDate),
          )
        );

      const netTransfers = transferRows.reduce((sum, t) => sum + parseFloat(String(t.amount)), 0);
      const baselineValue = baselineRows[0] ? parseFloat(String(baselineRows[0].totalValue)) : 0;
      const currentValue = currentRows[0] ? parseFloat(String(currentRows[0].totalValue)) : 0;
      const rawPnl = currentValue - baselineValue;
      const adjustedPnl = rawPnl - netTransfers;

      return {
        fromDate: input.fromDate,
        toDate: input.toDate,
        baselineValue,
        currentValue,
        rawPnl,
        netTransfers,
        adjustedPnl,
        baselineDate: baselineRows[0]?.snapshotDate ?? null,
        currentDate: currentRows[0]?.snapshotDate ?? null,
      };
    }),

  // ─── Transfers CRUD ────────────────────────────────────────────────────────

  addTransfer: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      accountLabel: z.string(),
      transferDate: z.string(),
      amount: z.number(), // positive = deposit, negative = withdrawal
      transferType: z.enum(["deposit", "withdrawal", "transfer_in", "transfer_out"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(accountTransfers).values({
        userId: OWNER_USER_ID,
        accountId: input.accountId,
        accountLabel: input.accountLabel,
        transferDate: input.transferDate,
        amount: String(input.amount),
        transferType: input.transferType,
        notes: input.notes ?? null,
        createdAt: Date.now(),
      });
      return { id: (result as any).insertId };
    }),

  getTransfers: protectedProcedure
    .input(z.object({
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      accountId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(accountTransfers.userId, OWNER_USER_ID)];
      if (input?.fromDate) conditions.push(gte(accountTransfers.transferDate, input.fromDate));
      if (input?.toDate) conditions.push(lte(accountTransfers.transferDate, input.toDate));
      if (input?.accountId) conditions.push(eq(accountTransfers.accountId, input.accountId));

      return db
        .select()
        .from(accountTransfers)
        .where(and(...conditions))
        .orderBy(desc(accountTransfers.transferDate));
    }),

  deleteTransfer: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(accountTransfers)
        .where(and(eq(accountTransfers.id, input.id), eq(accountTransfers.userId, OWNER_USER_ID)));
      return { ok: true };
    }),
});
