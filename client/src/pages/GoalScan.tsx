/**
 * GoalScan.tsx — Goal-Driven Ticker Recommendation
 *
 * "I have a trading goal — find me the best tickers for it."
 *
 * Flow:
 *   1. User arrives with ?goal=breakout|theta|earnings|hedge
 *   2. PitDesk scans their watchlist using the right engine
 *   3. Shows ranked ticker cards — each with why it fits the goal
 *   4. One click → Analyze that ticker
 *
 * No tool names. No manual ticker entry. Just: here's what fits your goal.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, Zap, Calendar, Shield, ArrowRight,
  RefreshCw, ChevronLeft, Target, BarChart2, AlertCircle,
} from "lucide-react";

// ─── Goal definitions ─────────────────────────────────────────────────────────

type GoalType = "breakout" | "theta" | "earnings" | "hedge";

const GOAL_META: Record<GoalType, {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  howItWorks: string;
}> = {
  breakout: {
    label: "Breakout Play",
    description: "Ride momentum on a technical break",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "#22c55e",
    bgColor: "#f0fdf4",
    howItWorks: "Scanning your watchlist for VCP patterns, Stage 2 uptrends, and tickers near pivot points.",
  },
  theta: {
    label: "Theta Income",
    description: "Sell premium, collect time decay",
    icon: <Zap className="h-5 w-5" />,
    color: "#f59e0b",
    bgColor: "#fffbeb",
    howItWorks: "Scanning for tickers with elevated IV rank and liquid options — ideal for selling premium.",
  },
  earnings: {
    label: "Earnings Trade",
    description: "Play the IV crush or directional move",
    icon: <Calendar className="h-5 w-5" />,
    color: "#8b5cf6",
    bgColor: "#faf5ff",
    howItWorks: "Scanning your watchlist for upcoming earnings in the next 2–3 weeks with strong historical moves.",
  },
  hedge: {
    label: "Hedge Position",
    description: "Protect an existing holding",
    icon: <Shield className="h-5 w-5" />,
    color: "#3b82f6",
    bgColor: "#eff6ff",
    howItWorks: "Looking at your open positions and suggesting protective structures for each.",
  },
};

// ─── Watchlist tickers ────────────────────────────────────────────────────────
const DEFAULT_TICKERS = [
  "SNDK", "NVDA", "WDC", "MU", "TSLA", "AAPL", "AMD", "PLTR",
  "META", "GOOGL", "SOFI", "INTC", "HOOD", "IONQ", "RGTI", "RKLB",
  "APP", "AMZN", "NFLX",
];

// ─── Ticker result card ───────────────────────────────────────────────────────
interface TickerResult {
  ticker: string;
  price?: number;
  score: number; // 0–100
  headline: string; // plain English why it fits
  detail: string;
  badge?: string;
  badgeColor?: string;
  urgency?: "high" | "medium" | "low";
}

// ─── GoalScan page ────────────────────────────────────────────────────────────

export default function GoalScan() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const goal = (params.get("goal") ?? "theta") as GoalType;
  const meta = GOAL_META[goal] ?? GOAL_META.theta;

  // ── Data fetching based on goal ────────────────────────────────────────────

  // Watchlist
  const { data: watchlistData } = trpc.watchlist.list.useQuery();
  const watchlistTickers = useMemo(() => {
    const wl = (watchlistData ?? []).map((w: any) => w.ticker as string);
    return wl.length > 0 ? wl : DEFAULT_TICKERS;
  }, [watchlistData]);

  // Breakout: VCP scan
  const vcpQuery = trpc.vcp.getBatch.useQuery(
    { tickers: watchlistTickers },
    { enabled: goal === "breakout", staleTime: 5 * 60 * 1000 }
  );

  // Theta: PCR scanBatch for IV signals
  const thetaQuery = trpc.pcr.scanBatch.useQuery(
    { tickers: watchlistTickers },
    { enabled: goal === "theta", staleTime: 5 * 60 * 1000 }
  );

  // Earnings: earningsCalendar.scanTickers
  const earningsMutation = trpc.earningsCalendar.scanTickers.useMutation();
  const [earningsResults, setEarningsResults] = useState<any[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);

  useEffect(() => {
    if (goal === "earnings" && watchlistTickers.length > 0 && earningsResults.length === 0) {
      setEarningsLoading(true);
      earningsMutation.mutate(
        { tickers: watchlistTickers.slice(0, 15) },
        {
          onSuccess: (data) => { setEarningsResults(data); setEarningsLoading(false); },
          onError: () => setEarningsLoading(false),
        }
      );
    }
  }, [goal, watchlistTickers]);

  // Hedge: open positions from trade log
  const positionsQuery = trpc.positions.myPositions.useQuery(
    undefined,
    { enabled: goal === "hedge" }
  );

  // ── Build ranked ticker results ────────────────────────────────────────────

  const results = useMemo((): TickerResult[] => {
    if (goal === "breakout") {
      if (!vcpQuery.data) return [];
      // Include any ticker with a VCP score >= 2 or a meaningful stage — lower bar so results show even outside market hours
      const valid = (vcpQuery.data as any[]).filter((r: any) => {
        if (!r) return false;
        // If data fetch failed entirely, skip
        if (r.error && r.vcpScore === 0 && r.currentPrice === 0) return false;
        // Accept any stage except pure decline with no score
        const stage = r.stage ?? "";
        if (stage === "STAGE_4_DECLINE" && (r.vcpScore ?? 0) < 2) return false;
        return true;
      });
      return valid
        .map((r: any) => {
          const isAtPivot = r.stage === "VCP_PIVOT";
          const isForming = r.stage === "VCP_FORMING";
          const isStage2 = r.stage === "STAGE_2_UPTREND";
          const isExtended = r.stage === "EXTENDED";
          const score = isAtPivot ? 90
            : isForming ? Math.min(82, 55 + (r.vcpScore ?? 0) * 3)
            : isStage2 ? Math.min(75, 45 + (r.vcpScore ?? 0) * 3)
            : isExtended ? 40
            : Math.min(50, 20 + (r.vcpScore ?? 0) * 4);
          const headline = isAtPivot
            ? `${r.ticker} is at the VCP pivot — breakout ready`
            : isForming
            ? `${r.ticker} is forming a VCP (${r.contractions?.length ?? 0} contractions, score ${r.vcpScore ?? 0}/10)`
            : isStage2
            ? `${r.ticker} is in a Stage 2 uptrend — watch for VCP setup`
            : isExtended
            ? `${r.ticker} is extended above pivot — wait for a pullback`
            : `${r.ticker} — ${(r.stage ?? "unknown").replace(/_/g, " ").toLowerCase()} (score ${r.vcpScore ?? 0}/10)`;
          const detail = isAtPivot
            ? `Volume is drying up at the pivot. A breakout above ${r.pivotLevel ? `$${Number(r.pivotLevel).toFixed(2)}` : "the pivot"} on above-average volume is the entry signal. VCP score: ${r.vcpScore ?? 0}/10.`
            : isForming
            ? `Stage: ${r.stage?.replace(/_/g, " ")}. Pattern is contracting — not ready to enter yet. Watch for the pivot setup. VCP score: ${r.vcpScore ?? 0}/10.`
            : isStage2
            ? `${r.ticker} is trending above its key moving averages. No VCP pattern yet — add to watchlist and wait for base to form. Score: ${r.vcpScore ?? 0}/10.`
            : `Stage: ${(r.stage ?? "unknown").replace(/_/g, " ")}. Not a current breakout candidate. VCP score: ${r.vcpScore ?? 0}/10.`;
          return {
            ticker: r.ticker,
            price: r.currentPrice,
            score,
            headline,
            detail,
            badge: isAtPivot ? "At Pivot" : isForming ? "VCP Forming" : isStage2 ? "Stage 2" : isExtended ? "Extended" : "Watching",
            badgeColor: isAtPivot ? "#22c55e" : isForming ? "#f59e0b" : isStage2 ? "#3b82f6" : "#9ca3af",
            urgency: (isAtPivot ? "high" : isForming ? "medium" : "low") as "high" | "medium" | "low",
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }

    if (goal === "theta") {
      if (!thetaQuery.data) return [];
      // Require actual options volume > 0 to avoid false signals outside market hours
      const thetaValid = (thetaQuery.data as any[]).filter((r: any) =>
        !r.error && r.signal !== "NEUTRAL" && (r.callVolume ?? 0) + (r.putVolume ?? 0) > 0
      );
      // If no live volume data (market closed), fall back to showing all tickers with a note
      const thetaAll = (thetaQuery.data as any[]).filter((r: any) => !r.error && r.lastPrice > 0);
      const thetaList = thetaValid.length > 0 ? thetaValid : thetaAll;
      return thetaList
        .map((r: any) => {
          const hasLiveData = (r.callVolume ?? 0) + (r.putVolume ?? 0) > 0;
          const isExtreme = r.signal === "EXTREME_FEAR" || r.signal === "EXTREME_GREED";
          const isBullish = r.signal === "EXTREME_FEAR" || r.signal === "FEAR";
          const score = isExtreme ? 88 : r.signal === "NEUTRAL" ? 50 : 65;
          return {
            ticker: r.ticker,
            price: r.lastPrice,
            score,
            headline: !hasLiveData
              ? `${r.ticker} — options data not available (market closed)`
              : isBullish
              ? `${r.ticker} — puts are expensive (PCR ${r.pcr.toFixed(2)}). Sell put premium.`
              : `${r.ticker} — calls are expensive (PCR ${r.pcr.toFixed(2)}). Sell call premium.`,
            detail: !hasLiveData
              ? `${r.ticker} is on your watchlist. Options volume data is only available during market hours. Check back when the market opens for live PCR signals.`
              : isBullish
              ? `Options market is fearful. Put/call ratio of ${r.pcr.toFixed(2)} means puts are trading at a premium. Short puts or bull put spreads collect elevated theta. Put vol: ${r.putVolume.toLocaleString()} vs call vol: ${r.callVolume.toLocaleString()}.`
              : `Options market is greedy. PCR of ${r.pcr.toFixed(2)} means calls are elevated. Bear call spreads or short calls capture this premium. Call vol: ${r.callVolume.toLocaleString()} vs put vol: ${r.putVolume.toLocaleString()}.`,
            badge: !hasLiveData ? "Market Closed" : isExtreme ? "Strong Signal" : r.signal === "NEUTRAL" ? "Neutral" : "Moderate",
            badgeColor: !hasLiveData ? "#9ca3af" : isExtreme ? "#22c55e" : r.signal === "NEUTRAL" ? "#6b7280" : "#f59e0b",
            urgency: (!hasLiveData ? "low" : isExtreme ? "high" : "medium") as "high" | "medium" | "low",
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }

    if (goal === "earnings") {
      return earningsResults
        .filter((r: any) => r.daysToEarnings !== null && r.daysToEarnings <= 21 && r.daysToEarnings >= 0 && !r.error)
        .map((r: any) => {
          const daysOut = r.daysToEarnings ?? 99;
          const urgency = (daysOut <= 7 ? "high" : daysOut <= 14 ? "medium" : "low") as "high" | "medium" | "low";
          const score = Math.max(20, 100 - daysOut * 4);
          return {
            ticker: r.ticker,
            price: r.lastPrice,
            score,
            headline: `${r.ticker} reports in ${daysOut} day${daysOut === 1 ? "" : "s"} — ${r.allPass ? "calendar spread looks good" : "check liquidity before trading"}`,
            detail: r.nextEarningsDate
              ? `Earnings: ${r.nextEarningsDate}. IV/RV ratio: ${r.ivRvRatio?.toFixed(2) ?? "N/A"}. ${r.allPass ? "All filters pass — IV is elevated relative to realized vol, good for calendar spread or straddle." : "Some filters failed — review IV and liquidity before entering."}`
              : `Earnings in ${daysOut} days. Use a calendar spread or straddle to capture IV crush.`,
            badge: daysOut <= 7 ? "This Week" : daysOut <= 14 ? "Next Week" : "2 Weeks Out",
            badgeColor: daysOut <= 7 ? "#ef4444" : daysOut <= 14 ? "#f59e0b" : "#8b5cf6",
            urgency,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }

    if (goal === "hedge") {
      // positions table uses qty (not quantity), no status field — all rows are current positions
      const allPositions = ((positionsQuery.data as any)?.positions as any[]) ?? [];
      // Deduplicate by ticker (keep largest position)
      const byTicker: Record<string, any> = {};
      for (const p of allPositions) {
        const t = p.ticker ?? p.symbol ?? "?";
        const q = parseFloat(p.qty ?? p.quantity ?? "0");
        if (!byTicker[t] || Math.abs(q) > Math.abs(parseFloat(byTicker[t].qty ?? "0"))) {
          byTicker[t] = p;
        }
      }
      const positions = Object.values(byTicker);
      if (positions.length === 0) return [];
      return positions
        .map((p: any) => {
          const ticker = p.ticker ?? p.symbol ?? "?";
          const qty = Math.abs(parseFloat(p.qty ?? p.quantity ?? "1"));
          const isLong = parseFloat(p.qty ?? p.quantity ?? "1") > 0;
          const price = p.currentPrice ? parseFloat(p.currentPrice) : p.avgCost ? parseFloat(p.avgCost) : 0;
          const marketValue = p.marketValue ? parseFloat(p.marketValue) : price * qty;
          const unrealizedPnl = p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : null;
          const pnlStr = unrealizedPnl !== null
            ? ` Unrealized P&L: ${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(0)}.`
            : "";
          return {
            ticker,
            price,
            score: 75,
            headline: `Hedge your ${isLong ? "long" : "short"} ${ticker} position (${qty.toFixed(0)} ${p.assetType === "option" ? "contracts" : "shares"})`,
            detail: isLong
              ? `You're long ${qty.toFixed(0)} shares of ${ticker} (market value ~$${marketValue.toFixed(0)}).${pnlStr} A protective put or put spread limits downside. A collar (sell call + buy put) is zero-cost and caps both sides.`
              : `You're short ${qty.toFixed(0)} shares of ${ticker}.${pnlStr} A long call or call spread protects against an upside move.`,
            badge: isLong ? "Long Position" : "Short Position",
            badgeColor: isLong ? "#22c55e" : "#ef4444",
            urgency: "medium" as "high" | "medium" | "low",
          };
        })
        .sort((a, b) => b.score - a.score);
    }

    return [];
  }, [goal, vcpQuery.data, thetaQuery.data, earningsResults, positionsQuery.data]);

  const isLoading =
    (goal === "breakout" && vcpQuery.isLoading) ||
    (goal === "theta" && thetaQuery.isLoading) ||
    (goal === "earnings" && earningsLoading) ||
    (goal === "hedge" && positionsQuery.isLoading);

  const urgencyOrder = { high: 0, medium: 1, low: 2 };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Goal header */}
      <div
        className="rounded-2xl p-6 border"
        style={{ background: meta.bgColor, borderColor: `${meta.color}30` }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            {meta.icon}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: meta.color }}>{meta.label}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
            <p className="text-xs mt-2 text-foreground/70 flex items-center gap-1.5">
              <Target className="h-3 w-3" style={{ color: meta.color }} />
              {meta.howItWorks}
            </p>
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Scanning your watchlist…
          </div>
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="font-medium">No matches found right now</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {goal === "breakout" && (vcpQuery.isError ? `Data fetch failed: ${vcpQuery.error?.message ?? "unknown error"}. Try again.` : "No tickers returned data. This can happen outside market hours — try again during market hours.")}
            {goal === "theta" && (thetaQuery.isError ? `Data fetch failed: ${thetaQuery.error?.message ?? "unknown error"}. Try again.` : "Options market signals are neutral across your watchlist. No elevated premium right now.")}
            {goal === "earnings" && earningsMutation.isError ? `Scan failed: ${earningsMutation.error?.message ?? "unknown error"}.` : "No tickers on your watchlist have earnings in the next 3 weeks."}
            {goal === "hedge" && "No open positions found in your portfolio upload. Upload your brokerage positions to get hedge recommendations."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate("/")}
          >
            Back to Home
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{results.length} tickers</span> match your goal — ranked by fit
            </p>
            <Badge variant="outline" className="text-xs">
              From your watchlist
            </Badge>
          </div>

          <div className="space-y-3">
            {results
              .sort((a, b) => (urgencyOrder[a.urgency ?? "low"] - urgencyOrder[b.urgency ?? "low"]) || (b.score - a.score))
              .map((r, idx) => (
                <Card
                  key={r.ticker}
                  className="hover:shadow-md transition-all cursor-pointer group border hover:border-border/80"
                  onClick={() => navigate(`/ticker-analysis?ticker=${r.ticker}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Rank + ticker */}
                      <div className="shrink-0 flex flex-col items-center gap-1 w-14">
                        <div className="text-xs text-muted-foreground font-mono">#{idx + 1}</div>
                        <div className="text-lg font-bold font-mono">{r.ticker}</div>
                        {r.price && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            ${r.price.toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm leading-snug">{r.headline}</span>
                          {r.badge && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                              style={{ color: r.badgeColor, borderColor: `${r.badgeColor}40`, background: `${r.badgeColor}10` }}
                            >
                              {r.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {r.detail}
                        </p>
                        {/* Score bar */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${r.score}%`, background: meta.color }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{r.score}% fit</span>
                        </div>
                      </div>

                      {/* Analyze CTA */}
                      <div className="shrink-0">
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs h-8 group-hover:opacity-100 opacity-70 transition-opacity"
                          style={{ background: meta.color }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/ticker-analysis?ticker=${r.ticker}`);
                          }}
                        >
                          Analyze
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>

          <div className="pt-2 flex items-center justify-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => navigate("/scan")}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              See all signals in Scan
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
