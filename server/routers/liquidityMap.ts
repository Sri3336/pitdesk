/**
 * Liquidity Map Router — AJ Liquidity Hunting Framework
 *
 * Procedures:
 *   liquidityMap.addZone      — add a retail zone for a ticker
 *   liquidityMap.editZone     — update zone details
 *   liquidityMap.deleteZone   — hard delete a zone
 *   liquidityMap.archiveZone  — toggle is_active (soft archive)
 *   liquidityMap.listByTicker — get all zones for a specific ticker
 *   liquidityMap.listAll      — get all active zones across all tickers
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { liquidityZones } from "../../drizzle/schema";

const ZONE_TYPES = [
  "resistance",
  "support",
  "supply",
  "demand",
  "trendline",
  "fibonacci",
  "vwap",
  "previous_high",
  "previous_low",
  "other",
] as const;

const ZoneInput = z.object({
  ticker: z.string().min(1).max(20).toUpperCase(),
  zoneType: z.enum(ZONE_TYPES),
  priceLevel: z.number().positive(),
  priceLevelHigh: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

export const liquidityMapRouter = router({

  addZone: protectedProcedure
    .input(ZoneInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = Date.now();
      const [result] = await db.insert(liquidityZones).values({
        userId: ctx.user.id,
        ticker: input.ticker,
        zoneType: input.zoneType,
        priceLevel: String(input.priceLevel),
        priceLevelHigh: input.priceLevelHigh ? String(input.priceLevelHigh) : null,
        notes: input.notes ?? null,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      return { id: (result as any).insertId, success: true };
    }),

  editZone: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      ...ZoneInput.shape,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(liquidityZones)
        .set({
          ticker: input.ticker,
          zoneType: input.zoneType,
          priceLevel: String(input.priceLevel),
          priceLevelHigh: input.priceLevelHigh ? String(input.priceLevelHigh) : null,
          notes: input.notes ?? null,
          updatedAt: Date.now(),
        })
        .where(and(
          eq(liquidityZones.id, input.id),
          eq(liquidityZones.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  deleteZone: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(liquidityZones)
        .where(and(
          eq(liquidityZones.id, input.id),
          eq(liquidityZones.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  archiveZone: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(liquidityZones)
        .set({ isActive: input.isActive ? 1 : 0, updatedAt: Date.now() })
        .where(and(
          eq(liquidityZones.id, input.id),
          eq(liquidityZones.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  listByTicker: protectedProcedure
    .input(z.object({
      ticker: z.string().min(1).max(20).toUpperCase(),
      includeArchived: z.boolean().optional().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [
        eq(liquidityZones.userId, ctx.user.id),
        eq(liquidityZones.ticker, input.ticker),
      ];
      if (!input.includeArchived) {
        conditions.push(eq(liquidityZones.isActive, 1));
      }

      const rows = await db.select()
        .from(liquidityZones)
        .where(and(...conditions))
        .orderBy(desc(liquidityZones.priceLevel));

      return rows.map(r => ({
        id: r.id,
        ticker: r.ticker,
        zoneType: r.zoneType,
        priceLevel: Number(r.priceLevel),
        priceLevelHigh: r.priceLevelHigh ? Number(r.priceLevelHigh) : null,
        notes: r.notes,
        isActive: r.isActive === 1,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    }),

  listAll: protectedProcedure
    .input(z.object({
      includeArchived: z.boolean().optional().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(liquidityZones.userId, ctx.user.id)];
      if (!input.includeArchived) {
        conditions.push(eq(liquidityZones.isActive, 1));
      }

      const rows = await db.select()
        .from(liquidityZones)
        .where(and(...conditions))
        .orderBy(liquidityZones.ticker, desc(liquidityZones.priceLevel));

      return rows.map(r => ({
        id: r.id,
        ticker: r.ticker,
        zoneType: r.zoneType,
        priceLevel: Number(r.priceLevel),
        priceLevelHigh: r.priceLevelHigh ? Number(r.priceLevelHigh) : null,
        notes: r.notes,
        isActive: r.isActive === 1,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    }),
});
