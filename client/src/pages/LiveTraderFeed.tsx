import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Twitter, TrendingUp, Shield, AlertCircle, ExternalLink, Users, Clock, Heart, Repeat2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Watchlist tickers for filter ────────────────────────────────────────────
const FILTER_TICKERS = [
  "ALL", "SNDK", "WDC", "ASML", "NBIS", "DRAM", "GLD", "QQQ", "SPY",
  "NVDA", "TSLA", "META", "AMZN", "PLTR", "LITE", "MU", "AAPL", "AMD",
];

// ─── Credibility badge ────────────────────────────────────────────────────────
function CredibilityBadge({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const config = {
    HIGH: { label: "Verified High", className: "bg-green-100 text-green-800 border-green-200", icon: "✓" },
    MEDIUM: { label: "Medium", className: "bg-blue-100 text-blue-800 border-blue-200", icon: "~" },
    LOW: { label: "Low", className: "bg-gray-100 text-gray-600 border-gray-200", icon: "?" },
  };
  const c = config[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.className}`}>
      <Shield className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: "VERIFIED_TRADER" | "SEARCH" }) {
  return source === "VERIFIED_TRADER" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
      <Twitter className="w-3 h-3" /> Verified Trader
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
      <TrendingUp className="w-3 h-3" /> Live Search
    </span>
  );
}

// ─── Ticker tag ───────────────────────────────────────────────────────────────
function TickerTag({ ticker }: { ticker: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-green-50 text-green-700 border border-green-200">
      ${ticker}
    </span>
  );
}

// ─── Format number ────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Highlight tickers in text ────────────────────────────────────────────────
function HighlightedText({ text, tickers }: { text: string; tickers: string[] }) {
  if (!tickers.length) return <span>{text}</span>;
  const pattern = new RegExp(`(\\$(?:${tickers.join("|")}))\\b`, "gi");
  const parts = text.split(pattern);
  return (
    <span>
      {parts.map((part, i) => {
        const upper = part.toUpperCase().replace("$", "");
        if (tickers.includes(upper)) {
          return (
            <span key={i} className="font-bold text-green-700 bg-green-50 rounded px-0.5">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ─── Trade Post Card ──────────────────────────────────────────────────────────
function TradePostCard({ post }: { post: any }) {
  const [expanded, setExpanded] = useState(false);
  const text: string = post.text ?? "";
  const isLong = text.length > 280;
  const displayText = isLong && !expanded ? text.slice(0, 280) + "…" : text;
  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }); }
    catch { return "recently"; }
  })();

  return (
    <Card className={`border ${post.isTradePost ? "border-green-200 bg-green-50/30" : "border-gray-200"} hover:shadow-sm transition-shadow`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {post.author.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-sm text-gray-900">{post.author.displayName}</span>
                <span className="text-xs text-gray-500">@{post.author.username}</span>
                {post.author.verified && (
                  <span className="text-blue-500 text-xs">✓</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {fmtNum(post.author.followers)}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">{post.author.specialty}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <CredibilityBadge level={post.credibility} />
            <SourceBadge source={post.source} />
          </div>
        </div>

        {/* Trade badge */}
        {post.isTradePost && (
          <div className="flex items-center gap-1 mb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600 text-white">
              <TrendingUp className="w-3 h-3" /> Trade Alert
            </span>
          </div>
        )}

        {/* Text */}
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-2">
          <HighlightedText text={displayText} tickers={post.tickers} />
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:underline mb-2"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        {/* Ticker tags */}
        {post.tickers.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {post.tickers.map((t: string) => <TickerTag key={t} ticker={t} />)}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmtNum(post.metrics.likes)}</span>
            <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" />{fmtNum(post.metrics.retweets)}</span>
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(post.metrics.replies)}</span>
            {post.metrics.impressions > 0 && (
              <span className="flex items-center gap-1 text-gray-400">{fmtNum(post.metrics.impressions)} views</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" /> {timeAgo}
            </span>
            <a
              href={`https://twitter.com/${post.author.username}/status/${post.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Relevance score (debug) */}
        {post.relevanceScore > 0 && (
          <div className="mt-1 text-xs text-gray-400">
            Relevance: {post.relevanceScore}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Trader Profile Card ──────────────────────────────────────────────────────
function TraderCard({ trader }: { trader: any }) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
            {trader.displayName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{trader.displayName}</div>
            <div className="text-xs text-gray-500">@{trader.username}</div>
            <div className="text-xs text-gray-600 mt-0.5">{trader.specialty}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <CredibilityBadge level="HIGH" />
            <a
              href={`https://twitter.com/${trader.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline flex items-center gap-1"
            >
              <Twitter className="w-3 h-3" /> Follow
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LiveTraderFeed() {
  const [tickerFilter, setTickerFilter] = useState("ALL");
  const [credibilityFilter, setCredibilityFilter] = useState<"ALL" | "HIGH" | "MEDIUM">("ALL");
  const [tab, setTab] = useState("feed");

  const { data, isLoading, isError, refetch, isFetching } = trpc.liveTraderFeed.getFeed.useQuery(
    {
      tickerFilter: tickerFilter === "ALL" ? undefined : tickerFilter,
      credibilityFilter,
      includeSearch: true,
    },
    { staleTime: 5 * 60 * 1000 }
  );

  const posts = data?.posts ?? [];
  const tradePosts = posts.filter((p) => p.isTradePost);
  const otherPosts = posts.filter((p) => !p.isTradePost);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Twitter className="w-6 h-6 text-blue-500" />
            Live Trader Feed
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time trade alerts from verified high-credibility options traders — filtered for your watchlist.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Credibility disclaimer */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>For informational purposes only.</strong> These are public posts from X/Twitter — not verified trade confirmations.
          Always do your own analysis before acting. Credibility ratings are based on follower count and account age, not audited P&L.
        </span>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-gray-900">{data.meta.total}</div>
            <div className="text-xs text-gray-500">Total Posts</div>
          </div>
          <div className="bg-white border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-700">{data.meta.tradePosts}</div>
            <div className="text-xs text-gray-500">Trade Alerts</div>
          </div>
          <div className="bg-white border border-purple-200 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-purple-700">{data.meta.highCredibility}</div>
            <div className="text-xs text-gray-500">High Credibility</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Ticker:</label>
          <Select value={tickerFilter} onValueChange={setTickerFilter}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_TICKERS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Credibility:</label>
          <Select value={credibilityFilter} onValueChange={(v) => setCredibilityFilter(v as any)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All</SelectItem>
              <SelectItem value="HIGH" className="text-xs">High only</SelectItem>
              <SelectItem value="MEDIUM" className="text-xs">Medium+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {data?.meta.fetchedAt && (
          <span className="text-xs text-gray-400 ml-auto">
            Updated {formatDistanceToNow(new Date(data.meta.fetchedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="feed">
            All Posts {posts.length > 0 && <span className="ml-1 text-xs">({posts.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="trades">
            Trade Alerts {tradePosts.length > 0 && <span className="ml-1 text-xs text-green-700">({tradePosts.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="traders">Verified Traders</TabsTrigger>
        </TabsList>

        {/* All Posts Tab */}
        <TabsContent value="feed" className="space-y-3 mt-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="border border-gray-200">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="space-y-1 flex-1">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {isError && (
            <div className="text-center py-12 text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p className="text-sm">Failed to load feed. Check X API connectivity.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !isError && posts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Twitter className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No posts found. Try adjusting filters or refresh.</p>
            </div>
          )}
          {posts.map((post) => (
            <TradePostCard key={post.id} post={post} />
          ))}
        </TabsContent>

        {/* Trade Alerts Tab */}
        <TabsContent value="trades" className="space-y-3 mt-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border border-gray-200">
                  <CardContent className="p-4 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {!isLoading && tradePosts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No specific trade alerts found right now.</p>
              <p className="text-xs text-gray-400 mt-1">Trade alerts are posts containing specific fills (bought/sold + strike + expiry).</p>
            </div>
          )}
          {tradePosts.map((post) => (
            <TradePostCard key={post.id} post={post} />
          ))}
        </TabsContent>

        {/* Verified Traders Tab */}
        <TabsContent value="traders" className="space-y-3 mt-4">
          <div className="text-sm text-gray-600 mb-4">
            These are the curated verified traders PitDesk monitors. Selection criteria: 50K+ followers, 3+ year account history, consistent options-specific content.
          </div>
          {(data?.traders ?? []).map((trader: any) => (
            <TraderCard key={trader.username} trader={trader} />
          ))}
          <Card className="border border-dashed border-gray-300 bg-gray-50">
            <CardContent className="p-4 text-center text-sm text-gray-500">
              <p>Want to add a trader to the monitored list?</p>
              <p className="text-xs mt-1 text-gray-400">Traders must have 50K+ followers, 2+ year account, and post specific fills with strikes/expiry.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
