/**
 * SwingTradingPicks — Action 3: "Give me a ticker for swing trading"
 * Runs Velez daily scan + VCP batch scan on a curated watchlist.
 * Surfaces top 5 ranked setups with entry/stop/target.
 */
import { ActionLayout } from "@/components/ActionLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart2,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

// Curated swing trading watchlist (22 core tickers)
const SWING_TICKERS = [
  "PLTR", "NVDA", "TSLA", "AMD", "META", "ORCL", "GOOGL", "NFLX",
  "AMZN", "AAPL", "APP", "SOXL", "IONQ", "RKLB", "UNH", "FAS",
  "HOOD", "SOFI", "INTC", "BE", "RGTI", "TEM",
];

function vcpStageLabel(stage: string) {
  const map: Record<string, string> = {
    VCP_PIVOT: "At Pivot",
    BREAKOUT: "Breakout",
    STAGE_2_UPTREND: "Uptrend",
    STAGE_1_BASE: "Building Base",
    STAGE_3_TOP: "Topping",
    STAGE_4_DECLINE: "Declining",
  };
  return map[stage] ?? stage;
}

function vcpStageColor(stage: string) {
  if (stage === "VCP_PIVOT") return "#22c55e";
  if (stage === "BREAKOUT") return "#f59e0b";
  if (stage === "STAGE_2_UPTREND") return "#6366f1";
  return "#94a3b8";
}

function scoreColor(score: number) {
  if (score >= 8) return { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", text: "#16a34a" };
  if (score >= 6) return { bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.30)", text: "#4f46e5" };
  if (score >= 4) return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#d97706" };
  return { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.25)", text: "#64748b" };
}

export default function SwingTradingPicks() {
  const [, navigate] = useLocation();
  const [hasTriggered, setHasTriggered] = useState(false);

  // VCP batch scan
  const { data: vcpData, isLoading: vcpLoading, refetch: refetchVcp } = trpc.vcp.getBatch.useQuery(
    { tickers: SWING_TICKERS },
    { enabled: hasTriggered, refetchOnWindowFocus: false }
  );

  // Velez daily scan
  const { data: velezData, isLoading: velezLoading, refetch: refetchVelez } = trpc.velez.scanDaily.useQuery(
    { tickers: SWING_TICKERS, thresholdPct: 1.0, minPrice: 5 },
    { enabled: hasTriggered, refetchOnWindowFocus: false }
  );

  // BCOS catalyst watchlist — cross-reference with swing results
  const { data: bcosData, refetch: refetchBcos } = trpc.catalystBreakout.list.useQuery(
    undefined,
    { enabled: hasTriggered, refetchOnWindowFocus: false }
  );

  const isLoading = vcpLoading || velezLoading;

  // Auto-trigger on mount
  useEffect(() => {
    if (!hasTriggered) setHasTriggered(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    refetchVcp();
    refetchVelez();
    refetchBcos();
  }

  // Build combined ranked list
  type SwingSetup = {
    ticker: string;
    score: number;
    stage: string;
    vcpScore: number;
    currentPrice: number;
    stopLoss: number;
    priceTarget: number;
    riskReward: number;
    distanceToPivot: number;
    rationale: string;
    optionsPlay: string;
    hasVelezSignal: boolean;
    velezSignal?: string;
    hasBcosSignal: boolean;
    bcosStatus?: string;
  };

  const setups: SwingSetup[] = [];

  if (vcpData) {
    for (const vcp of vcpData) {
      if (!vcp || typeof vcp !== "object") continue;
      const v = vcp as any;
      if (!v.ticker || !v.currentPrice) continue;

      // Only include tickers with meaningful VCP score
      if (v.vcpScore < 4) continue;

      // Check if Velez also flagged this ticker
      const velezMatch = (velezData as any[] | undefined)?.find(
        (ve: any) => ve?.ticker === v.ticker
      );
      const hasVelezSignal = !!velezMatch;

      // Check if BCOS watchlist has this ticker with a breakout signal
      const bcosMatch = (bcosData as any[] | undefined)?.find(
        (b: any) => b?.ticker?.toUpperCase() === v.ticker &&
          (b?.status === "BREAKOUT" || b?.status === "NEAR_BREAKOUT" || b?.status === "WATCHING")
      );
      const hasBcosSignal = !!bcosMatch;

      // Composite score: VCP score (0-10) + Velez bonus (0-1.5) + BCOS bonus (0-1.5)
      const compositeScore = Math.min(10, v.vcpScore + (hasVelezSignal ? 1.5 : 0) + (hasBcosSignal ? 1.5 : 0));

      setups.push({
        ticker: v.ticker,
        score: compositeScore,
        stage: v.stage ?? "UNKNOWN",
        vcpScore: v.vcpScore ?? 0,
        currentPrice: v.currentPrice ?? 0,
        stopLoss: v.stopLoss ?? 0,
        priceTarget: v.priceTarget ?? 0,
        riskReward: v.riskReward ?? 0,
        distanceToPivot: v.distanceToPivot ?? 0,
        rationale: v.rationale ?? "",
        optionsPlay: v.optionsPlay ?? "",
        hasVelezSignal,
        velezSignal: velezMatch?.signal,
        hasBcosSignal,
        bcosStatus: bcosMatch?.status,
      });
    }
  }

  // Sort by composite score desc
  setups.sort((a, b) => b.score - a.score);
  const top5 = setups.slice(0, 5);
  const rest = setups.slice(5);

  function openPitAdvisor(setup: SwingSetup) {
    const prompt = `I'm looking at ${setup.ticker} for a swing trade. VCP score: ${setup.vcpScore}/10, stage: ${vcpStageLabel(setup.stage)}, distance to pivot: ${setup.distanceToPivot.toFixed(1)}%. Stop loss: $${setup.stopLoss.toFixed(2)}, target: $${setup.priceTarget.toFixed(2)}, R:R ${setup.riskReward.toFixed(1)}:1. ${setup.hasVelezSignal ? "Velez scanner also flagged this ticker. " : ""}Give me a 5-dimension analysis and a specific swing trade entry plan with position sizing for a $25,000 account.`;
    navigate(`/pit-advisor?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <ActionLayout toolName="Swing Trading Picks" toolColor="#6366f1">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
              Swing Trading Picks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              VCP pattern scan + Velez daily momentum across {SWING_TICKERS.length} core tickers. Multi-day setups ranked by conviction.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Scanning..." : "Refresh"}
          </Button>
        </div>

        {/* ── Loading state ──────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin" />
              <TrendingUp className="absolute inset-0 m-auto w-6 h-6 text-indigo-500" />
            </div>
            <div className="text-center">
              <div className="font-semibold text-foreground">Running swing scan...</div>
              <div className="text-sm text-muted-foreground mt-1">
                Analyzing VCP patterns, Velez momentum signals, and multi-day setups
              </div>
            </div>
          </div>
        )}

        {/* ── No setups ─────────────────────────────────────────────── */}
        {!isLoading && hasTriggered && setups.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Target className="w-10 h-10 opacity-30" />
              <div className="font-medium">No high-conviction swing setups right now</div>
              <div className="text-sm text-center max-w-sm">
                VCP patterns and Velez momentum signals are not aligned across the watchlist. Market may be in a choppy phase — wait for clearer setups.
              </div>
              <Button variant="outline" size="sm" onClick={refresh}>
                Scan Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Top 5 Swing Setup Cards ────────────────────────────────── */}
        {!isLoading && top5.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-foreground">
                {top5.length} Top Swing Setup{top5.length > 1 ? "s" : ""}
              </span>
              <Badge className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                Multi-Day
              </Badge>
            </div>

            {top5.map((setup, i) => {
              const sc = scoreColor(setup.score);
              const rr = setup.riskReward;
              const rrColor = rr >= 3 ? "#22c55e" : rr >= 2 ? "#6366f1" : "#f59e0b";

              return (
                <div
                  key={setup.ticker}
                  className="rounded-2xl border p-5 transition-all duration-200 hover:shadow-md"
                  style={{ background: sc.bg, borderColor: sc.border }}
                >
                  <div className="flex items-start gap-4">
                    {/* Rank */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: "#6366f122", color: "#4f46e5" }}
                    >
                      #{i + 1}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-bold font-mono" style={{ color: "var(--foreground)" }}>
                          {setup.ticker}
                        </span>
                        <Badge
                          className="text-xs font-semibold"
                          style={{
                            background: `${vcpStageColor(setup.stage)}22`,
                            color: vcpStageColor(setup.stage),
                            border: `1px solid ${vcpStageColor(setup.stage)}44`,
                          }}
                        >
                          {vcpStageLabel(setup.stage)}
                        </Badge>
                        {setup.hasVelezSignal && setup.hasBcosSignal ? (
                          <Badge
                            className="text-xs font-bold flex items-center gap-1"
                            style={{ background: "rgba(234,179,8,0.15)", color: "#b45309", border: "1px solid rgba(234,179,8,0.4)" }}
                          >
                            <Star className="w-3 h-3" /> Triple Confirmation
                          </Badge>
                        ) : (
                          <>
                            {setup.hasVelezSignal && (
                              <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                + Velez
                              </Badge>
                            )}
                            {setup.hasBcosSignal && (
                              <Badge
                                className="text-xs flex items-center gap-1"
                                style={{ background: "rgba(239,68,68,0.10)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.25)" }}
                              >
                                <Zap className="w-3 h-3" /> BCOS
                              </Badge>
                            )}
                          </>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          VCP: {setup.vcpScore.toFixed(1)}/10 · Score: {setup.score.toFixed(1)}/10
                        </span>
                      </div>

                      {/* Price levels */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Current Price</div>
                          <div className="font-semibold font-mono text-sm">${setup.currentPrice.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowDown className="w-3 h-3 text-red-400" /> Stop Loss
                          </div>
                          <div className="font-semibold font-mono text-sm text-red-500">
                            ${setup.stopLoss.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-green-400" /> Target
                          </div>
                          <div className="font-semibold font-mono text-sm text-green-600">
                            ${setup.priceTarget.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">R:R Ratio</div>
                          <div className="font-semibold font-mono text-sm" style={{ color: rrColor }}>
                            {rr.toFixed(1)}:1
                          </div>
                        </div>
                      </div>

                      {/* Distance to pivot + options play */}
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                        {setup.distanceToPivot !== 0 && (
                          <span>
                            Pivot distance:{" "}
                            <span className={`font-mono ${setup.distanceToPivot <= 2 ? "text-green-600 font-semibold" : ""}`}>
                              {setup.distanceToPivot.toFixed(1)}%
                            </span>
                          </span>
                        )}
                        {setup.optionsPlay && (
                          <span>
                            Options: <span className="text-blue-600 font-medium">{setup.optionsPlay}</span>
                          </span>
                        )}
                      </div>

                      {/* Rationale */}
                      {setup.rationale && (
                        <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {setup.rationale}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white"
                        onClick={() => navigate(`/ticker-analysis?ticker=${setup.ticker}`)}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Analyze
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        style={{ borderColor: "#8b5cf644", color: "#8b5cf6" }}
                        onClick={() => openPitAdvisor(setup)}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ask Pit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Additional setups ─────────────────────────────────────── */}
        {!isLoading && rest.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              More Setups ({rest.length})
            </div>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--muted)" }}>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Ticker</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Stage</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">VCP</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">R:R</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Target</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Stop</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((setup) => (
                    <tr
                      key={setup.ticker}
                      className="border-b last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/ticker-analysis?ticker=${setup.ticker}`)}
                    >
                      <td className="px-3 py-2 font-mono font-semibold">{setup.ticker}</td>
                      <td className="px-3 py-2">
                        <span
                          className="text-xs font-medium"
                          style={{ color: vcpStageColor(setup.stage) }}
                        >
                          {vcpStageLabel(setup.stage)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{setup.vcpScore.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{setup.riskReward.toFixed(1)}:1</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-green-600">
                        ${setup.priceTarget.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-red-500 hidden sm:table-cell">
                        ${setup.stopLoss.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Full scanner CTA ───────────────────────────────────────── */}
        {!isLoading && (
          <div className="flex flex-col sm:flex-row gap-3 pb-4">
            <Button
              variant="outline"
              className="flex-1 h-11 font-semibold gap-2"
              onClick={() => navigate("/velez-scanner")}
            >
              <BarChart2 className="w-4 h-4" />
              Full Velez Scanner
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11 font-semibold gap-2"
              onClick={() => navigate("/vcp-strategy")}
            >
              <TrendingUp className="w-4 h-4" />
              VCP Strategy Dashboard
            </Button>
          </div>
        )}
      </div>
    </ActionLayout>
  );
}
