import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";

// ─── Curated verified traders ───────────────────────────────────────────────
const VERIFIED_TRADERS = [
  {
    username: "OptionsHawk",
    displayName: "Joe Kunkle / OptionsHawk",
    specialty: "Institutional options flow",
    minFollowers: 100_000,
    verified: true,
  },
  {
    username: "unusual_whales",
    displayName: "Unusual Whales",
    specialty: "Dark pool + options flow aggregator",
    minFollowers: 4_000_000,
    verified: true,
  },
  {
    username: "TastyTrade",
    displayName: "tastytrade",
    specialty: "Options premium selling — regulated broker",
    minFollowers: 50_000,
    verified: true,
  },
];

// ─── Watchlist tickers for relevance scoring ────────────────────────────────
const WATCHLIST_TICKERS = [
  "SNDK", "WDC", "ASML", "NBIS", "DRAM", "GLD", "QQQ", "SPY",
  "NVDA", "TSLA", "META", "AMZN", "PLTR", "SMCI", "LITE", "SOFI",
  "HOOD", "IONQ", "RKLB", "UNH", "ORCL", "GOOGL", "NFLX", "SOXL",
  "FAS", "APP", "MU", "AAPL", "AMD", "MSFT",
];

// ─── Trade keyword patterns ──────────────────────────────────────────────────
const TRADE_KEYWORDS = [
  /\b(bought|sold|entered|filled|opened|closed|rolled)\b/i,
  /\b(call|put|straddle|strangle|spread|iron condor|covered call|naked put)\b/i,
  /\$\d+[CP]\b/i,        // e.g. $150C, $200P
  /\b\d+\/\d+\/\d+\b/,  // date like 7/10/26
  /\bexp(iry|ires|iration)?\b/i,
  /\bcredit|debit|premium\b/i,
];

function isTradePost(text: string): boolean {
  const hits = TRADE_KEYWORDS.filter((re) => re.test(text)).length;
  return hits >= 2;
}

function relevanceScore(text: string, tickers: string[]): number {
  let score = 0;
  const upper = text.toUpperCase();
  for (const ticker of tickers) {
    if (upper.includes(`$${ticker}`) || upper.includes(` ${ticker} `) || upper.includes(` ${ticker}\n`)) {
      score += 10;
    }
  }
  // Trade specificity bonus
  if (/\b(bought|sold|entered|filled)\b/i.test(text)) score += 5;
  if (/\b(call|put)\b/i.test(text)) score += 3;
  if (/\$\d+[CP]\b/i.test(text)) score += 5;
  if (/\bcredit|debit|premium\b/i.test(text)) score += 3;
  return score;
}

function credibilityBadge(followers: number, accountAgeYears: number, isVerified: boolean): "HIGH" | "MEDIUM" | "LOW" {
  if (followers >= 100_000 && accountAgeYears >= 3) return "HIGH";
  if (followers >= 10_000 && accountAgeYears >= 2) return "MEDIUM";
  return "LOW";
}

function accountAgeYears(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);
}

// ─── Fetch user ID by username ───────────────────────────────────────────────
async function getUserId(username: string): Promise<{ id: string; followers: number; createdAt: string; verified: boolean } | null> {
  try {
    const resp = await callDataApi("X/get_user_profile_by_username", {
      pathParams: { username },
      query: {
        "user.fields": "id,name,username,public_metrics,created_at,verified",
      },
    });
    const user = (resp as any)?.data;
    if (!user) return null;
    return {
      id: user.id,
      followers: user.public_metrics?.followers_count ?? 0,
      createdAt: user.created_at ?? "2020-01-01",
      verified: user.verified ?? false,
    };
  } catch {
    return null;
  }
}

// ─── Fetch recent posts for a user ──────────────────────────────────────────
async function getUserPosts(userId: string): Promise<any[]> {
  try {
    const resp = await callDataApi("X/get_user_posts", {
      pathParams: { id: userId },
      query: {
        max_results: "15",
        "tweet.fields": "id,text,created_at,public_metrics",
        exclude: "retweets",
      },
    });
    return (resp as any)?.data ?? [];
  } catch {
    return [];
  }
}

// ─── Search for live trade alerts ───────────────────────────────────────────
async function searchTradeAlerts(tickers: string[]): Promise<{ posts: any[]; users: Record<string, any> }> {
  try {
    const tickerQuery = tickers.slice(0, 8).map((t) => `$${t}`).join(" OR ");
    const resp = await callDataApi("X/search_recent_posts", {
      query: {
        query: `(${tickerQuery}) (bought OR sold OR entered OR filled OR rolled) (call OR put OR options) lang:en -is:retweet`,
        max_results: "20",
        "tweet.fields": "id,text,created_at,author_id,public_metrics",
        expansions: "author_id",
        "user.fields": "id,name,username,public_metrics,created_at,verified",
      },
    });
    const posts = (resp as any)?.data ?? [];
    const userList: any[] = (resp as any)?.includes?.users ?? [];
    const users: Record<string, any> = {};
    for (const u of userList) users[u.id] = u;
    return { posts, users };
  } catch {
    return { posts: [], users: {} };
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const liveTraderFeedRouter = router({
  getFeed: publicProcedure
    .input(
      z.object({
        tickerFilter: z.string().optional(),
        credibilityFilter: z.enum(["ALL", "HIGH", "MEDIUM"]).default("ALL"),
        includeSearch: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { tickerFilter, credibilityFilter, includeSearch } = input;
      const watchlist = tickerFilter
        ? WATCHLIST_TICKERS.filter((t) => t === tickerFilter.toUpperCase())
        : WATCHLIST_TICKERS;

      const allPosts: Array<{
        id: string;
        text: string;
        createdAt: string;
        author: {
          id: string;
          username: string;
          displayName: string;
          followers: number;
          verified: boolean;
          specialty: string;
          accountAgeYears: number;
        };
        credibility: "HIGH" | "MEDIUM" | "LOW";
        relevanceScore: number;
        isTradePost: boolean;
        metrics: {
          likes: number;
          retweets: number;
          replies: number;
          impressions: number;
        };
        tickers: string[];
        source: "VERIFIED_TRADER" | "SEARCH";
      }> = [];

      // 1. Fetch posts from verified traders
      for (const trader of VERIFIED_TRADERS) {
        const profile = await getUserId(trader.username);
        if (!profile) continue;

        const ageYears = accountAgeYears(profile.createdAt);
        const badge = credibilityBadge(profile.followers, ageYears, profile.verified);

        if (credibilityFilter !== "ALL" && badge !== credibilityFilter) continue;

        const posts = await getUserPosts(profile.id);
        for (const post of posts) {
          const text: string = post.text ?? "";
          const score = relevanceScore(text, watchlist);
          const isTrade = isTradePost(text);
          const mentionedTickers = watchlist.filter((t) =>
            text.toUpperCase().includes(`$${t}`) ||
            new RegExp(`\\b${t}\\b`).test(text.toUpperCase())
          );

          allPosts.push({
            id: post.id,
            text,
            createdAt: post.created_at ?? new Date().toISOString(),
            author: {
              id: profile.id,
              username: trader.username,
              displayName: trader.displayName,
              followers: profile.followers,
              verified: profile.verified,
              specialty: trader.specialty,
              accountAgeYears: Math.round(ageYears * 10) / 10,
            },
            credibility: badge,
            relevanceScore: score,
            isTradePost: isTrade,
            metrics: {
              likes: post.public_metrics?.like_count ?? 0,
              retweets: post.public_metrics?.retweet_count ?? 0,
              replies: post.public_metrics?.reply_count ?? 0,
              impressions: post.public_metrics?.impression_count ?? 0,
            },
            tickers: mentionedTickers,
            source: "VERIFIED_TRADER",
          });
        }
      }

      // 2. Curated search for live trade alerts
      if (includeSearch) {
        const { posts, users } = await searchTradeAlerts(watchlist.slice(0, 10));
        for (const post of posts) {
          const author = users[post.author_id] ?? {};
          const followers: number = author.public_metrics?.followers_count ?? 0;
          const created: string = author.created_at ?? "2022-01-01";
          const ageYears = accountAgeYears(created);
          const badge = credibilityBadge(followers, ageYears, author.verified ?? false);

          // Filter low-credibility from search results
          if (badge === "LOW" && credibilityFilter !== "ALL") continue;
          if (followers < 500) continue; // minimum bar for search results

          const text: string = post.text ?? "";
          const score = relevanceScore(text, watchlist);
          const isTrade = isTradePost(text);
          const mentionedTickers = watchlist.filter((t) =>
            text.toUpperCase().includes(`$${t}`) ||
            new RegExp(`\\b${t}\\b`).test(text.toUpperCase())
          );

          // Skip if already added from verified traders
          if (allPosts.find((p) => p.id === post.id)) continue;

          allPosts.push({
            id: post.id,
            text,
            createdAt: post.created_at ?? new Date().toISOString(),
            author: {
              id: author.id ?? post.author_id,
              username: author.username ?? "unknown",
              displayName: author.name ?? author.username ?? "Unknown",
              followers,
              verified: author.verified ?? false,
              specialty: "Options trader",
              accountAgeYears: Math.round(ageYears * 10) / 10,
            },
            credibility: badge,
            relevanceScore: score,
            isTradePost: isTrade,
            metrics: {
              likes: post.public_metrics?.like_count ?? 0,
              retweets: post.public_metrics?.retweet_count ?? 0,
              replies: post.public_metrics?.reply_count ?? 0,
              impressions: post.public_metrics?.impression_count ?? 0,
            },
            tickers: mentionedTickers,
            source: "SEARCH",
          });
        }
      }

      // Sort: trade posts first, then by relevance score, then by recency
      allPosts.sort((a, b) => {
        if (a.isTradePost !== b.isTradePost) return a.isTradePost ? -1 : 1;
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return {
        posts: allPosts,
        meta: {
          total: allPosts.length,
          tradePosts: allPosts.filter((p) => p.isTradePost).length,
          highCredibility: allPosts.filter((p) => p.credibility === "HIGH").length,
          fetchedAt: new Date().toISOString(),
        },
        traders: VERIFIED_TRADERS,
      };
    }),

  getVerifiedTraders: publicProcedure.query(() => {
    return VERIFIED_TRADERS;
  }),
});
