import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { PCR_TICKERS } from "@shared/tickers";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  closeTrade,
  createPasswordResetToken,
  createUser,
  deleteUserById,
  deleteFibEmaAlert,
  getFibEmaAlertHistory,
  getFibEmaAlertsByUser,
  getManualTradesByUser,
  getValidPasswordResetToken,
  getUserByEmail,
  getUserById,
  insertFibEmaAlertHistory,
  insertManualTrade,
  listAllUsers,
  markPasswordResetTokenUsed,
  updateLastSignedIn,
  updateTradeNotes,
  updateUserPassword,
  updateUserProfile,
  updateUserRole,
  upsertFibEmaAlert,
} from "./db";
import { getGoogleAuthUrl } from "./_core/googleAuth";
import { sendEmail, buildFibEmaAlertEmail } from "./email";
import {
  calcFibExtensions,
  calcFibRetracements,
  calcTradeExtensionTargets,
  detectFibEmaConfluence,
  findSwingHighLow,
  calcAllEmas,
} from "./fibEngine";
import { runVelezDailyScanner, runVelezIntradayScanner } from "./velezScanner";
import { notifyOwner } from "./_core/notification";
import { callDataApi } from "./_core/dataApi";

const OWNER_EMAIL = "akulasridhar@gmail.com";

// ─── Velez Scanner Router ─────────────────────────────────────────────────────
const velezRouter = router({
  scanDaily: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
        thresholdPct: z.number().min(0.1).max(5).default(1.0),
        minPrice: z.number().min(0).max(10000).default(10),
        excludeOtc: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      // When excludeOtc is false, pass minPrice=0 to bypass price gate too
      const effectiveMinPrice = input.excludeOtc ? input.minPrice : 0;
      return runVelezDailyScanner(tickers, input.thresholdPct, effectiveMinPrice);
    }),

  scanIntraday: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
        thresholdPct: z.number().min(0.1).max(5).default(1.0),
        minPrice: z.number().min(0).max(10000).default(10),
        excludeOtc: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      const effectiveMinPrice = input.excludeOtc ? input.minPrice : 0;
      return runVelezIntradayScanner(tickers, input.thresholdPct, effectiveMinPrice);
    }),

  // Fetch Fib levels for a single ticker on demand
  getFibLevels: protectedProcedure
    .input(z.object({ ticker: z.string(), lookback: z.number().default(50) }))
    .query(async ({ input }) => {
      const result = await callDataApi("YahooFinance/get_stock_chart", {
        query: { symbol: input.ticker.toUpperCase(), region: "US", interval: "1d", range: "3mo" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = result;
      const chart = data?.chart?.result?.[0];
      if (!chart) throw new TRPCError({ code: "NOT_FOUND", message: "No data for ticker" });

      const timestamps: number[] = chart.timestamp ?? [];
      const q = chart.indicators?.quote?.[0] ?? {};
      const closes: number[] = timestamps.map((_: number, i: number) => q.close?.[i] ?? 0).filter((c: number) => c > 0);
      const highs: number[] = timestamps.map((_: number, i: number) => q.high?.[i] ?? 0).filter((h: number) => h > 0);
      const lows: number[] = timestamps.map((_: number, i: number) => q.low?.[i] ?? 0).filter((l: number) => l > 0);

      const { swingHigh, swingLow } = findSwingHighLow(highs, lows, input.lookback);
      const currentPrice = closes[closes.length - 1] ?? 0;

      return {
        ticker: input.ticker,
        currentPrice,
        swingHigh,
        swingLow,
        fibRetracements: calcFibRetracements(swingHigh, swingLow),
        fibExtensions: calcFibExtensions(swingHigh, swingLow),
        emas: calcAllEmas(closes),
        confluences: detectFibEmaConfluence(currentPrice, closes, swingHigh, swingLow),
      };
    }),
});

// ─── Manual Trades Router ─────────────────────────────────────────────────────
const tradesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getManualTradesByUser(ctx.user.id);
  }),

  add: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(16),
        strategy: z.string().optional(),
        direction: z.enum(["long", "short"]).default("long"),
        entryPrice: z.number().positive(),
        swingLow: z.number().positive().optional(),
        swingHigh: z.number().positive().optional(),
        quantity: z.number().int().positive().optional(),
        target1: z.number().positive().optional(),
        target2: z.number().positive().optional(),
        stopLoss: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await insertManualTrade({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        strategy: input.strategy,
        direction: input.direction,
        entryPrice: String(input.entryPrice),
        swingLow: input.swingLow ? String(input.swingLow) : undefined,
        swingHigh: input.swingHigh ? String(input.swingHigh) : undefined,
        quantity: input.quantity,
        target1: input.target1 ? String(input.target1) : undefined,
        target2: input.target2 ? String(input.target2) : undefined,
        stopLoss: input.stopLoss ? String(input.stopLoss) : undefined,
      });
      return { success: true };
    }),

  close: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        exitPrice: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trades = await getManualTradesByUser(ctx.user.id);
      const trade = trades.find((t) => t.id === input.id);
      if (!trade) throw new TRPCError({ code: "NOT_FOUND" });
      const entryPrice = parseFloat(String(trade.entryPrice ?? "0"));
      const qty = trade.quantity ?? 1;
      const pnl =
        trade.direction === "long"
          ? (input.exitPrice - entryPrice) * qty
          : (entryPrice - input.exitPrice) * qty;
      await closeTrade(input.id, ctx.user.id, input.exitPrice, pnl);
      return { success: true, pnl };
    }),

  updateNotes: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        postTradeNotes: z.string(),
        lessonsLearned: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateTradeNotes(input.id, ctx.user.id, input.postTradeNotes, input.lessonsLearned);
      return { success: true };
    }),

  // Auto-suggest Fib extension targets from entry + swing low
  getFibTargets: protectedProcedure
    .input(
      z.object({
        entryPrice: z.number().positive(),
        swingLow: z.number().positive(),
      })
    )
    .query(({ input }) => {
      if (input.swingLow >= input.entryPrice) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Swing low must be below entry price",
        });
      }
      return calcTradeExtensionTargets(input.entryPrice, input.swingLow);
    }),
});

// ─── Fib + EMA Alerts Router ─────────────────────────────────────────────────
const fibAlertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getFibEmaAlertsByUser(ctx.user.id);
  }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().int().max(200).default(50) }))
    .query(async ({ input }) => {
      return getFibEmaAlertHistory(input.limit);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        ticker: z.string().min(1).max(16),
        enabled: z.boolean().default(true),
        proximityPct: z.number().min(0.1).max(5).default(1.0),
        fibLevels: z.array(z.number()).default([38.2, 61.8]),
        emaPeriods: z.array(z.number()).default([9, 20, 50, 200]),
        emailEnabled: z.boolean().default(true),
        pushEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertFibEmaAlert({
        userId: ctx.user.id,
        ticker: input.ticker.toUpperCase(),
        enabled: input.enabled,
        proximityPct: input.proximityPct,
        fibLevels: JSON.stringify(input.fibLevels) as unknown as number[],
        emaPeriods: JSON.stringify(input.emaPeriods) as unknown as number[],
        emailEnabled: input.emailEnabled,
        pushEnabled: input.pushEnabled,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFibEmaAlert(input.id, ctx.user.id);
      return { success: true };
    }),

  // Scan all 60 PCR tickers for Fib+EMA confluence
  scan: protectedProcedure
    .input(
      z.object({
        tickers: z.array(z.string()).optional(),
        proximityPct: z.number().min(0.1).max(5).default(1.0),
        fibLevels: z.array(z.number()).default([38.2, 50.0, 61.8]),
        emaPeriods: z.array(z.number()).default([9, 20, 50, 200]),
      })
    )
    .mutation(async ({ input }) => {
      const tickers = input.tickers ?? [...PCR_TICKERS];
      const results: Array<{
        ticker: string;
        currentPrice: number;
        swingHigh: number;
        swingLow: number;
        confluences: ReturnType<typeof detectFibEmaConfluence>;
        hasConfluence: boolean;
      }> = [];

      await Promise.allSettled(
        tickers.map(async (ticker) => {
          try {
            const result = await callDataApi("YahooFinance/get_stock_chart", {
              query: { symbol: ticker.toUpperCase(), region: "US", interval: "1d", range: "3mo" },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = result;
            const chart = data?.chart?.result?.[0];
            if (!chart) return;

            const timestamps: number[] = chart.timestamp ?? [];
            const q = chart.indicators?.quote?.[0] ?? {};
            const closes: number[] = timestamps.map((_: number, i: number) => q.close?.[i] ?? 0).filter((c: number) => c > 0);
            const highs: number[] = timestamps.map((_: number, i: number) => q.high?.[i] ?? 0).filter((h: number) => h > 0);
            const lows: number[] = timestamps.map((_: number, i: number) => q.low?.[i] ?? 0).filter((l: number) => l > 0);

            if (closes.length < 20) return;

            const { swingHigh, swingLow } = findSwingHighLow(highs, lows, 50);
            const currentPrice = closes[closes.length - 1] ?? 0;
            const confluences = detectFibEmaConfluence(
              currentPrice,
              closes,
              swingHigh,
              swingLow,
              input.proximityPct,
              input.fibLevels,
              input.emaPeriods
            );

            results.push({
              ticker,
              currentPrice,
              swingHigh,
              swingLow,
              confluences,
              hasConfluence: confluences.length > 0,
            });
          } catch {
            // Skip failed tickers
          }
        })
      );

      return results.sort((a, b) => (b.hasConfluence ? 1 : 0) - (a.hasConfluence ? 1 : 0));
    }),

  // Send alerts for confluent tickers
  sendAlerts: protectedProcedure
    .input(
      z.object({
        ticker: z.string(),
        currentPrice: z.number(),
        fibLevel: z.number(),
        fibPrice: z.number(),
        emaPeriod: z.number(),
        emaValue: z.number(),
        proximityPct: z.number(),
        emailEnabled: z.boolean().default(true),
        pushEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      let emailSent = false;
      let pushSent = false;

      if (input.emailEnabled) {
        const html = buildFibEmaAlertEmail(
          input.ticker,
          input.currentPrice,
          input.fibLevel,
          input.fibPrice,
          input.emaPeriod,
          input.emaValue
        );
        emailSent = await sendEmail({
          to: OWNER_EMAIL,
          subject: `🎯 PitDesk: ${input.ticker} Fib+EMA Confluence at ${input.fibLevel}% / EMA-${input.emaPeriod}`,
          html,
        });
      }

      if (input.pushEnabled) {
        try {
          await notifyOwner({
            title: `${input.ticker} Fib+EMA Confluence`,
            content: `${input.ticker} @ $${input.currentPrice.toFixed(2)} — near ${input.fibLevel}% Fib ($${input.fibPrice.toFixed(2)}) & EMA-${input.emaPeriod} ($${input.emaValue.toFixed(2)})`,
          });
          pushSent = true;
        } catch {
          pushSent = false;
        }
      }

      // Log to history
      await insertFibEmaAlertHistory({
        ticker: input.ticker,
        currentPrice: input.currentPrice,
        swingHigh: 0,
        swingLow: 0,
        fibLevel: input.fibLevel,
        fibPrice: input.fibPrice,
        emaPeriod: input.emaPeriod,
        emaPrice: input.emaValue,
        proximityPct: input.proximityPct,
        notifiedEmail: emailSent,
        notifiedPush: pushSent,
      });

      return { emailSent, pushSent };
    }),
});

// ─── PCR Router ─────────────────────────────────────────────────────────────
const pcrRouter = router({
  scan: protectedProcedure.query(async () => {
    const results: Array<{ ticker: string; pcr: number; callVolume: number; putVolume: number; signal: string }> = [];
    await Promise.allSettled(
      [...PCR_TICKERS].map(async (ticker) => {
        try {
          const result = await callDataApi("YahooFinance/get_options", {
            query: { ticker },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = result;
          const chain = data?.optionChain?.result?.[0];
          if (!chain) return;
          const options = chain.options?.[0];
          if (!options) return;
          const callVol = (options.calls ?? []).reduce((s: number, c: any) => s + (c.volume ?? 0), 0);
          const putVol = (options.puts ?? []).reduce((s: number, p: any) => s + (p.volume ?? 0), 0);
          const pcr = callVol > 0 ? putVol / callVol : 0;
          results.push({
            ticker,
            pcr,
            callVolume: callVol,
            putVolume: putVol,
            signal: pcr < 0.7 ? "bullish" : pcr > 1.0 ? "bearish" : "neutral",
          });
        } catch {
          // skip
        }
      })
    );
    return results.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }),
});

// ─── JWT helpers ─────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-dev-secret");
const SESSION_MAX_AGE = ONE_YEAR_MS;

async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
}

async function verifySessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.sub ? parseInt(payload.sub, 10) : null;
  } catch {
    return null;
  }
}

// ─── Auth Router ─────────────────────────────────────────────────────────────
const authRouter = router({
  register: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(100).trim(),
      email: z.string().email().toLowerCase(),
      password: z.string().min(8).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "An account with this email already exists." });
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await createUser({ name: input.name, email: input.email, passwordHash });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account." });
      const token = await createSessionToken(user.id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      await updateLastSignedIn(user.id);
      const token = await createSessionToken(user.id);
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true } as const;
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    const userId = await verifySessionToken(token);
    if (!userId) return null;
    const user = await getUserById(userId);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
  }),

  googleAuthUrl: publicProcedure.query(() => {
    return { url: getGoogleAuthUrl() };
  }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email().toLowerCase() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email);
      if (!user) return { success: true }; // anti-enumeration
      const { randomBytes } = await import("crypto");
      const tokenBytes = randomBytes(32).toString("hex");
      await createPasswordResetToken(user.id, tokenBytes);
      const appOrigin = process.env.NODE_ENV === "production"
        ? "https://trading.akulaz.ai"
        : "http://localhost:3000";
      const resetUrl = `${appOrigin}/reset-password?token=${tokenBytes}`;
      await notifyOwner({
        title: `Password Reset — ${user.email}`,
        content: `Reset link for ${user.name ?? user.email} (${user.email}):\n${resetUrl}\n\nExpires in 1 hour.`,
      }).catch(() => console.warn("[PasswordReset] Notification failed"));
      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), password: z.string().min(8).max(128) }))
    .mutation(async ({ input }) => {
      const record = await getValidPasswordResetToken(input.token);
      if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link is invalid or has expired." });
      const passwordHash = await bcrypt.hash(input.password, 12);
      await updateUserPassword(record.userId, passwordHash);
      await markPasswordResetTokenUsed(input.token);
      return { success: true };
    }),
});

// ─── Candlestick Chart Router ───────────────────────────────────────────────
const chartRouter = router({
  candles: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(16),
        interval: z.enum(["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"]).default("1d"),
        range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"]).default("3mo"),
      })
    )
    .query(async ({ input }) => {
      const result = await callDataApi("YahooFinance/get_stock_chart", {
        query: {
          symbol: input.ticker.toUpperCase(),
          region: "US",
          interval: input.interval,
          range: input.range,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = result;
      const chart = data?.chart?.result?.[0];
      if (!chart) throw new TRPCError({ code: "NOT_FOUND", message: `No data for ${input.ticker}` });

      const timestamps: number[] = chart.timestamp ?? [];
      const q = chart.indicators?.quote?.[0] ?? {};
      const adjClose: number[] = chart.indicators?.adjclose?.[0]?.adjclose ?? [];

      const candles = timestamps
        .map((ts: number, i: number) => ({
          time: ts as number,
          open: q.open?.[i] as number,
          high: q.high?.[i] as number,
          low: q.low?.[i] as number,
          close: q.close?.[i] as number,
          volume: q.volume?.[i] as number,
          adjClose: adjClose[i] as number,
        }))
        .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);

      const meta = chart.meta ?? {};
      return {
        ticker: input.ticker.toUpperCase(),
        currency: meta.currency ?? "USD",
        exchangeName: meta.exchangeName ?? "",
        regularMarketPrice: meta.regularMarketPrice ?? null,
        previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
        candles,
      };
    }),
});

// ─── Admin Router ───────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    return listAllUsers();
  }),
  updateRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account" });
      await deleteUserById(input.userId);
      return { success: true };
    }),
});

// ─── Profile Router ───────────────────────────────────────────────────────────
const profileRouter = router({
  update: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100).trim() }))
    .mutation(async ({ input, ctx }) => {
      await updateUserProfile(ctx.user.id, { name: input.name });
      return { success: true };
    }),
  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (!user.passwordHash) throw new TRPCError({ code: "BAD_REQUEST", message: "Account uses social login — set a password via Forgot Password" });
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await updateUserPassword(ctx.user.id, newHash);
      return { success: true };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  admin: adminRouter,
  profile: profileRouter,
  chart: chartRouter,
  velez: velezRouter,
  trades: tradesRouter,
  fibAlerts: fibAlertsRouter,
  pcr: pcrRouter,
});

export type AppRouter = typeof appRouter;
