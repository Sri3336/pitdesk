/**
 * Retail Trader Sentiment Analyzer
 *
 * Fetches recent Reddit posts mentioning a ticker from:
 *   - r/wallstreetbets, r/options, r/stocks, r/investing, r/thetagang
 *
 * Uses the LLM to classify sentiment and extract themes from each post,
 * then aggregates into an overall sentiment score with strategy implications.
 */

import { invokeLLM } from "./_core/llm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SentimentLabel = "Bullish" | "Bearish" | "Neutral";

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  body: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdAt: string;   // ISO date string
  url: string;
  author: string;
  sentiment?: SentimentLabel;
  sentimentScore?: number;  // -1 to +1
  keyThemes?: string[];
}

export interface SentimentResult {
  ticker: string;
  overallScore: number;        // 0-100 (50 = neutral, >50 bullish, <50 bearish)
  overallLabel: SentimentLabel;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
  totalMentions: number;
  trendingKeywords: string[];
  strategyImplication: string;
  contrarySignal: boolean;     // true if extreme sentiment (contrarian warning)
  posts: RedditPost[];
  fetchedAt: string;
  error?: string;
}

// ── Reddit fetcher ────────────────────────────────────────────────────────────

const SUBREDDITS = ["wallstreetbets", "options", "stocks", "investing", "thetagang"];
const USER_AGENT = "OptionsStrategyAnalyzer/1.0 (educational tool)";

async function fetchRedditPosts(ticker: string, subreddit: string, limit = 8): Promise<RedditPost[]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(ticker)}&sort=new&limit=${limit}&t=week&restrict_sr=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data: any = await res.json();
    const children = data?.data?.children ?? [];

    return children
      .filter((c: any) => c?.data?.title)
      .map((c: any) => {
        const p = c.data;
        const body = (p.selftext ?? "").slice(0, 500).replace(/\n+/g, " ").trim();
        return {
          id: p.id ?? "",
          subreddit,
          title: p.title ?? "",
          body,
          score: p.score ?? 0,
          upvoteRatio: p.upvote_ratio ?? 0.5,
          numComments: p.num_comments ?? 0,
          createdAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : new Date().toISOString(),
          url: p.url ? `https://reddit.com${p.permalink ?? ""}` : "",
          author: p.author ?? "unknown",
        } as RedditPost;
      });
  } catch {
    return [];
  }
}

// ── LLM sentiment classifier ──────────────────────────────────────────────────

interface PostSentiment {
  id: string;
  sentiment: SentimentLabel;
  score: number;       // -1 to +1
  themes: string[];
}

async function classifyPostsSentiment(ticker: string, posts: RedditPost[]): Promise<PostSentiment[]> {
  if (posts.length === 0) return [];

  const postSummaries = posts.map((p, i) =>
    `[${i}] r/${p.subreddit} | Score:${p.score} | "${p.title}" ${p.body ? `— ${p.body.slice(0, 200)}` : ""}`
  ).join("\n");

  const prompt = `You are a financial sentiment analyst. Analyze these Reddit posts about ${ticker} and classify each one.

Posts:
${postSummaries}

For each post (by index 0 to ${posts.length - 1}), return a JSON array with objects containing:
- "id": the index number (integer)
- "sentiment": "Bullish", "Bearish", or "Neutral"
- "score": float from -1.0 (very bearish) to +1.0 (very bullish), 0 = neutral
- "themes": array of 1-3 short keyword themes (e.g. ["earnings beat", "IV crush", "puts"])

Consider: post title, body content, upvote score, and subreddit context (WSB tends toward speculation, thetagang toward premium selling).
Return ONLY the JSON array, no other text.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a financial sentiment classifier. Return only valid JSON arrays." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sentiment_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    sentiment: { type: "string", enum: ["Bullish", "Bearish", "Neutral"] },
                    score: { type: "number" },
                    themes: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "sentiment", "score", "themes"],
                  additionalProperties: false,
                },
              },
            },
            required: ["results"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const results: any[] = parsed?.results ?? (Array.isArray(parsed) ? parsed : []);

    return results.map((r: any) => ({
      id: String(posts[r.id]?.id ?? r.id),
      sentiment: r.sentiment as SentimentLabel,
      score: Math.max(-1, Math.min(1, r.score ?? 0)),
      themes: (r.themes ?? []).slice(0, 3),
    }));
  } catch {
    // Fallback: simple keyword-based scoring
    return posts.map(p => {
      const text = `${p.title} ${p.body}`.toLowerCase();
      const bullWords = ["bull", "buy", "calls", "moon", "long", "bullish", "breakout", "upside", "beat", "strong"];
      const bearWords = ["bear", "sell", "puts", "short", "bearish", "crash", "dump", "miss", "weak", "drop"];
      const bullScore = bullWords.filter(w => text.includes(w)).length;
      const bearScore = bearWords.filter(w => text.includes(w)).length;
      const net = bullScore - bearScore;
      return {
        id: p.id,
        sentiment: net > 0 ? "Bullish" : net < 0 ? "Bearish" : "Neutral" as SentimentLabel,
        score: Math.max(-1, Math.min(1, net * 0.2)),
        themes: [],
      };
    });
  }
}

// ── Keyword extractor ─────────────────────────────────────────────────────────

function extractTrendingKeywords(posts: RedditPost[]): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "it", "in", "on", "at", "to", "for", "of", "and", "or",
    "but", "not", "with", "this", "that", "are", "was", "be", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might", "can",
    "i", "my", "me", "we", "our", "you", "your", "they", "their", "he", "she",
    "what", "how", "why", "when", "where", "which", "who", "just", "like", "get",
    "got", "going", "think", "know", "see", "want", "need", "make", "made",
  ]);

  const freq: Record<string, number> = {};
  for (const p of posts) {
    const words = `${p.title} ${p.body}`.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));
    for (const w of words) {
      freq[w] = (freq[w] ?? 0) + 1;
    }
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

// ── Strategy implication ──────────────────────────────────────────────────────

function deriveStrategyImplication(
  label: SentimentLabel,
  score: number,
  contrarySignal: boolean
): string {
  if (contrarySignal && label === "Bullish") {
    return "⚠ Extreme retail bullishness detected — historically a contrarian warning signal. Consider Bear Call Spreads or reducing long delta exposure. Retail FOMO often precedes reversals.";
  }
  if (contrarySignal && label === "Bearish") {
    return "⚠ Extreme retail bearishness detected — historically a contrarian buy signal. Bull Put Spreads may benefit if the crowd is over-positioned short. Monitor for short-squeeze setups.";
  }
  if (label === "Bullish") {
    return "Retail sentiment is bullish, aligning with Bull Put Spreads and Cash-Secured Puts. Avoid Bear Call Spreads unless technicals diverge.";
  }
  if (label === "Bearish") {
    return "Retail sentiment is bearish. Bear Call Spreads may be favored. Be cautious with naked puts or Bull Put Spreads.";
  }
  return "Retail sentiment is neutral or mixed. Iron Condors and Short Strangles may be appropriate if IV is elevated. No strong directional bias from social media.";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchSentiment(ticker: string): Promise<SentimentResult> {
  const fetchedAt = new Date().toISOString();

  // Fetch posts from all subreddits in parallel (max 6 per subreddit)
  const allPostArrays = await Promise.all(
    SUBREDDITS.map(sub => fetchRedditPosts(ticker, sub, 6))
  );

  let allPosts: RedditPost[] = allPostArrays.flat();

  // Deduplicate by title similarity and sort by score desc
  const seen = new Set<string>();
  allPosts = allPosts.filter(p => {
    const key = p.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  allPosts.sort((a, b) => b.score - a.score);

  // Limit to top 20 posts for LLM analysis
  const postsToAnalyze = allPosts.slice(0, 20);

  if (postsToAnalyze.length === 0) {
    return {
      ticker,
      overallScore: 50,
      overallLabel: "Neutral",
      bullCount: 0,
      bearCount: 0,
      neutralCount: 0,
      totalMentions: 0,
      trendingKeywords: [],
      strategyImplication: "No recent Reddit posts found for this ticker. Sentiment data unavailable.",
      contrarySignal: false,
      posts: [],
      fetchedAt,
      error: "No posts found",
    };
  }

  // Classify sentiment via LLM
  const sentiments = await classifyPostsSentiment(ticker, postsToAnalyze);

  // Merge sentiment back into posts
  const sentimentMap = new Map(sentiments.map(s => [s.id, s]));
  const annotatedPosts: RedditPost[] = postsToAnalyze.map(p => {
    const s = sentimentMap.get(p.id);
    return {
      ...p,
      sentiment: s?.sentiment ?? "Neutral",
      sentimentScore: s?.score ?? 0,
      keyThemes: s?.themes ?? [],
    };
  });

  // Aggregate
  const bullCount = annotatedPosts.filter(p => p.sentiment === "Bullish").length;
  const bearCount = annotatedPosts.filter(p => p.sentiment === "Bearish").length;
  const neutralCount = annotatedPosts.filter(p => p.sentiment === "Neutral").length;
  const total = annotatedPosts.length;

  // Weighted average score (weight by Reddit upvote score, floor at 1)
  let weightedSum = 0;
  let weightTotal = 0;
  for (const p of annotatedPosts) {
    const w = Math.max(1, p.score);
    weightedSum += (p.sentimentScore ?? 0) * w;
    weightTotal += w;
  }
  const avgScore = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // Convert -1..+1 to 0..100
  const overallScore = Math.round(((avgScore + 1) / 2) * 100);
  const overallLabel: SentimentLabel =
    overallScore >= 62 ? "Bullish" :
    overallScore <= 38 ? "Bearish" : "Neutral";

  // Contrarian signal: extreme sentiment (>75 or <25)
  const contrarySignal = overallScore >= 75 || overallScore <= 25;

  // Trending keywords
  const trendingKeywords = extractTrendingKeywords(annotatedPosts);

  const strategyImplication = deriveStrategyImplication(overallLabel, avgScore, contrarySignal);

  return {
    ticker,
    overallScore,
    overallLabel,
    bullCount,
    bearCount,
    neutralCount,
    totalMentions: total,
    trendingKeywords,
    strategyImplication,
    contrarySignal,
    posts: annotatedPosts.slice(0, 10), // return top 10 for display
    fetchedAt,
  };
}
