/**
 * Pit Advisor Router — AI Trading Research Assistant
 *
 * Procedures:
 *   pitAdvisor.chat              — multi-turn chat with PitDesk Trading Buddy persona
 *   pitAdvisor.analyzeMyTrades   — AI analysis of user's uploaded CSV trades
 *   pitAdvisor.quickResearch     — single-shot research on a ticker or strategy question
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import type { Message } from "../_core/llm";
import { callDataApi } from "../_core/dataApi";
import { getDb } from "../db";
import { uploadedTrades, tradeUploadBatches } from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── System Prompt ─────────────────────────────────────────────────────────────

const PIT_ADVISOR_SYSTEM = `You are Pit Advisor — the AI trading research assistant built into PitDesk, a personal trading intelligence platform used by Sridhar Akula (a serious retail trader).

## Your Persona
- You are a confident, experienced trading mentor and research partner
- You analyze trades across 5 dimensions: Technical, Fundamental, Geopolitical, Sentiment, and Quantitative/Math
- You are proactive — you challenge bad setups, point out risks the trader might be ignoring
- You speak plainly and directly — no fluff, no generic disclaimers
- You give specific, actionable insights — not vague platitudes

## PitDesk Context
The platform includes:
- **PCR Dashboard**: Put/Call ratio signals for 60 tickers (EXTREME_GREED < 0.5, GREED 0.5–0.7, NEUTRAL 0.7–0.9, FEAR 0.9–1.2, EXTREME_FEAR > 1.2)
- **Velez Scanner**: Fibonacci retracement + EMA confluence signals (38.2%, 50%, 61.8% levels with EMA-9/20/50/200)
- **Opening Range Scalper (ORS)**: First 30-min range breakout strategy, entry window 10am–3pm ET
- **Previous Range Pullback (PRP)**: ICT/SMC-based BOS + pullback to 30/50/70% retracement zones
- **VCP Strategy**: Volatility Contraction Pattern (Minervini method)
- **Catalyst Breakout Watch (BCOS)**: Major S/R levels + news catalyst breakout strategy
- **IVR Alerts**: Implied Volatility Rank alerts for options premium selling
- **COT Dashboard**: Commitment of Traders data for institutional positioning
- **Trade Log**: Personal trade journal with post-trade notes and lessons

## Brokerage Accounts
- E*TRADE -4723 (primary), E*TRADE -2738, Schwab

## Analysis Framework
When analyzing any ticker or trade, structure your response across these 5 dimensions:
1. **Technical**: Price structure, key levels, trend, momentum indicators, chart patterns
2. **Fundamental**: Earnings, revenue growth, sector health, competitive position
3. **Geopolitical**: Macro environment, sector-specific policy risks, global events
4. **Sentiment**: Options flow (PCR), institutional positioning (COT), retail sentiment
5. **Quantitative/Math**: R:R ratio, position sizing, Kelly criterion, probability of profit

## Key Rules
- Always state the R:R ratio when discussing a trade setup
- If R:R < 2:1, flag it as a concern
- For options trades, always mention IV rank (high IV = sell premium, low IV = buy premium)
- Challenge any setup where the stop is unclear or the position size is too large
- Reference PitDesk scanner signals when relevant (e.g., "PCR for NVDA is currently EXTREME_GREED — bullish")

## Response Format
- Use markdown with headers for multi-part analysis
- Keep responses focused and actionable — avoid walls of text
- Use bullet points for lists of factors
- Bold the most important insight in each section
- End complex analyses with a "Bottom Line" summary`;

// ─── Market Data Helpers ───────────────────────────────────────────────────────

async function getQuote(ticker: string): Promise<string> {
  try {
    const res: any = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: ticker.toUpperCase(), region: "US", interval: "1d", range: "5d" },
    });
    const result = res?.chart?.result?.[0];
    if (!result) return `No data available for ${ticker}`;
    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose;
    const change = prevClose ? ((price - prevClose) / prevClose * 100).toFixed(2) : "N/A";
    const hi52 = meta.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A";
    const lo52 = meta.fiftyTwoWeekLow?.toFixed(2) ?? "N/A";
    return `${ticker}: $${price?.toFixed(2)} (${change}% today) | 52W Range: $${lo52}–$${hi52} | Vol: ${(meta.regularMarketVolume / 1e6).toFixed(1)}M`;
  } catch {
    return `Could not fetch quote for ${ticker}`;
  }
}

async function getUserTradeSummary(userId: number): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "No trade data available";

    const trades = await db
      .select()
      .from(uploadedTrades)
      .where(eq(uploadedTrades.userId, userId))
      .orderBy(desc(uploadedTrades.tradeDate))
      .limit(50);

    if (trades.length === 0) return "No uploaded trades found. Upload a CSV from the Trade Upload page first.";

    const withPnl = trades.filter(t => t.pnl !== null);
    const wins = withPnl.filter(t => t.isWin === true);
    const totalPnl = withPnl.reduce((s, t) => s + parseFloat(t.pnl as string), 0);
    const winRate = withPnl.length > 0 ? (wins.length / withPnl.length * 100).toFixed(1) : "N/A";

    // Ticker breakdown
    const byTicker: Record<string, { count: number; pnl: number; wins: number }> = {};
    for (const t of withPnl) {
      if (!byTicker[t.ticker]) byTicker[t.ticker] = { count: 0, pnl: 0, wins: 0 };
      byTicker[t.ticker].count++;
      byTicker[t.ticker].pnl += parseFloat(t.pnl as string);
      if (t.isWin) byTicker[t.ticker].wins++;
    }
    const topTickers = Object.entries(byTicker)
      .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
      .slice(0, 5)
      .map(([ticker, d]) => `${ticker}: ${d.count} trades, ${(d.wins / d.count * 100).toFixed(0)}% WR, $${d.pnl.toFixed(0)} P&L`)
      .join("; ");

    // Strategy breakdown
    const byStrategy: Record<string, { count: number; pnl: number; wins: number }> = {};
    for (const t of withPnl) {
      const strat = t.strategy || "Unknown";
      if (!byStrategy[strat]) byStrategy[strat] = { count: 0, pnl: 0, wins: 0 };
      byStrategy[strat].count++;
      byStrategy[strat].pnl += parseFloat(t.pnl as string);
      if (t.isWin) byStrategy[strat].wins++;
    }
    const topStrategies = Object.entries(byStrategy)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([s, d]) => `${s}: ${d.count} trades, ${(d.wins / d.count * 100).toFixed(0)}% WR`)
      .join("; ");

    return `UPLOADED TRADE SUMMARY (last 50 trades):
- Total: ${trades.length} trades | With P&L data: ${withPnl.length}
- Win Rate: ${winRate}% (${wins.length}W / ${withPnl.length - wins.length}L)
- Total P&L: $${totalPnl.toFixed(2)} | Avg: $${(totalPnl / withPnl.length).toFixed(2)}
- Best: $${Math.max(...withPnl.map(t => parseFloat(t.pnl as string))).toFixed(2)} | Worst: $${Math.min(...withPnl.map(t => parseFloat(t.pnl as string))).toFixed(2)}
- Top Tickers: ${topTickers || "N/A"}
- Top Strategies: ${topStrategies || "N/A"}
- Recent: ${trades.slice(0, 3).map(t => `${t.ticker} ${t.side} ${t.tradeDate}`).join(", ")}`;
  } catch {
    return "Error fetching trade summary";
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const pitAdvisorRouter = router({
  // Multi-turn chat
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      includeTradeContext: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      let systemContent = PIT_ADVISOR_SYSTEM;

      // Optionally inject user's trade summary
      if (input.includeTradeContext) {
        const tradeSummary = await getUserTradeSummary(ctx.user.id);
        systemContent += `\n\n## Current User Trade Data\n${tradeSummary}`;
      }

      const messages: Message[] = [
        { role: "system", content: systemContent },
        ...input.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const result = await invokeLLM({
        messages,
        maxTokens: 2000,
      });

      const content = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : "";
      return { content, usage: result.usage };
    }),

  // Analyze user's uploaded trades with AI
  analyzeMyTrades: protectedProcedure
    .input(z.object({
      focus: z.enum(["overall", "winners", "losers", "strategies", "tickers", "timing"]).default("overall"),
    }))
    .mutation(async ({ ctx, input }) => {
      const tradeSummary = await getUserTradeSummary(ctx.user.id);

      if (tradeSummary.startsWith("No uploaded trades")) {
        return { content: tradeSummary };
      }

      const focusPrompts: Record<string, string> = {
        overall: "Give me a comprehensive analysis of my trading performance. What are my strengths and weaknesses? What patterns do you see?",
        winners: "Analyze my winning trades. What strategies and setups are working best for me? How can I do more of what's working?",
        losers: "Analyze my losing trades. What are the common mistakes? What should I stop doing immediately?",
        strategies: "Which trading strategies are working best for me based on my trade history? Which should I abandon?",
        tickers: "Which tickers am I trading best and worst? Should I focus on fewer tickers?",
        timing: "Are there patterns in my trade timing? Am I better at certain market conditions?",
      };

      const messages: Message[] = [
        { role: "system", content: PIT_ADVISOR_SYSTEM + `\n\n## User's Trade Data\n${tradeSummary}` },
        { role: "user", content: focusPrompts[input.focus] },
      ];

      const result = await invokeLLM({ messages, maxTokens: 2000 });
      const content = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : "";
      return { content };
    }),

  // Quick research on a ticker
  quickResearch: protectedProcedure
    .input(z.object({
      ticker: z.string().max(10),
      question: z.string().max(500).default("Give me a full 5-dimension analysis for a potential options trade"),
    }))
    .mutation(async ({ input }) => {
      const quote = await getQuote(input.ticker.toUpperCase());

      const messages: Message[] = [
        { role: "system", content: PIT_ADVISOR_SYSTEM },
        {
          role: "user",
          content: `Ticker: ${input.ticker.toUpperCase()}\nCurrent Data: ${quote}\n\nQuestion: ${input.question}`,
        },
      ];

      const result = await invokeLLM({ messages, maxTokens: 2000 });
      const content = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : "";
      return { content, ticker: input.ticker.toUpperCase(), quote };
    }),
});
