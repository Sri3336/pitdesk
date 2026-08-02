/**
 * TradeSetupCard.tsx
 * Comprehensive signal confirmation card.
 * Full mode: GO/CAUTION/NO-GO verdict + 7-signal checklist + CTA Flow + execution summary + ATR sizing
 * Compact mode: verdict badge + key signals row + strategy row
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, Activity, BarChart2, Zap, Target,
  Lightbulb, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronRight, Info, Play,
} from "lucide-react";

interface TradeSetupCardProps {
  ticker: string;
  compact?: boolean;
}

type SignalStatus = "green" | "yellow" | "red" | "gray";

const STATUS_DOT: Record<SignalStatus, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  gray: "bg-gray-300",
};

const STATUS_ROW: Record<SignalStatus, string> = {
  green: "text-green-700",
  yellow: "text-yellow-700",
  red: "text-red-600",
  gray: "text-gray-500",
};

export function TradeSetupCard({ ticker, compact = false }: TradeSetupCardProps) {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const { data, isLoading, error, refetch, isFetching } = trpc.tradeSetup.getSetup.useQuery(
    { ticker },
    { staleTime: 5 * 60 * 1000, retry: 1 }
  );

  function handleRefresh() {
    refetch().then(() => setLastRefreshed(new Date()));
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="border border-gray-200 bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <Card className="border border-gray-200 bg-white">
        <CardContent className="p-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">Setup data unavailable for {ticker}</p>
          <button onClick={handleRefresh} disabled={isFetching}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const {
    currentPrice, dayChange, dayChangePct,
    trend, trendStructure, ma20, ma50, priceVsMa20, priceVsMa50,
    relVol, volLabel, rsi, rsiLabel,
    atr, atrPct, suggestedStrangleDistance, suggestedSpreadDistance,
    ivr, ivrLabel, vwap, vwapSignal,
    ctaSignal, ctaLabel, ctaDetail, ctaRecentCross, ctaDistanceFromMa50Pct,
    verdict, verdictScore, verdictMaxScore, verdictSignals,
    executionSummary, conflictWarning,
    suggestedStrategy, strategyRationale, strategyConfidence,
    dataAsOf,
  } = data;

  // ── Derived colors ───────────────────────────────────────────────────────────
  const TrendIcon = trend === "UPTREND" ? TrendingUp : trend === "DOWNTREND" ? TrendingDown : Minus;
  const trendColor = trend === "UPTREND" ? "bg-green-100 text-green-700 border-green-200"
    : trend === "DOWNTREND" ? "bg-red-100 text-red-700 border-red-200"
    : "bg-yellow-100 text-yellow-700 border-yellow-200";

  const verdictBg = verdict === "GO" ? "bg-green-50 border-green-200"
    : verdict === "CAUTION" ? "bg-yellow-50 border-yellow-200"
    : "bg-red-50 border-red-200";
  const verdictText = verdict === "GO" ? "text-green-700"
    : verdict === "CAUTION" ? "text-yellow-700"
    : "text-red-700";
  const VerdictIcon = verdict === "GO" ? CheckCircle2 : verdict === "CAUTION" ? AlertTriangle : XCircle;

  const ctaBg = ctaSignal === "TAILWIND" ? "bg-green-50 border-green-200 text-green-800"
    : ctaSignal === "HEADWIND" ? "bg-red-50 border-red-200 text-red-800"
    : ctaSignal === "APPROACHING_FLIP" ? "bg-yellow-50 border-yellow-200 text-yellow-800"
    : "bg-gray-50 border-gray-200 text-gray-600";

  const ctaBadgeColor = ctaSignal === "TAILWIND" ? "bg-green-100 text-green-700 border-green-200"
    : ctaSignal === "HEADWIND" ? "bg-red-100 text-red-700 border-red-200"
    : ctaSignal === "APPROACHING_FLIP" ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

  const ivrColor = ivrLabel === "RICH" ? "bg-orange-100 text-orange-700 border-orange-200"
    : ivrLabel === "CHEAP" ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

  const vwapColor = vwapSignal === "ABOVE" ? "bg-green-100 text-green-700 border-green-200"
    : vwapSignal === "BELOW" ? "bg-red-100 text-red-700 border-red-200"
    : "bg-gray-100 text-gray-500 border-gray-200";

  const priceChangeColor = dayChange >= 0 ? "text-green-600" : "text-red-600";

  const ConfidenceIcon = strategyConfidence === "HIGH" ? CheckCircle2
    : strategyConfidence === "MEDIUM" ? AlertTriangle : Clock;
  const confidenceColor = strategyConfidence === "HIGH" ? "bg-green-50 border-green-200 text-green-800"
    : strategyConfidence === "MEDIUM" ? "bg-yellow-50 border-yellow-200 text-yellow-800"
    : "bg-gray-50 border-gray-200 text-gray-600";

  const displayTime = lastRefreshed ?? new Date(dataAsOf);
  const formattedTime = displayTime.toLocaleString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric",
  });

  const TutorialButton = (
    <a
      href="https://youtu.be/SLp6xOHDiEA"
      target="_blank"
      rel="noopener noreferrer"
      title="Watch step-by-step tutorial (4:36)"
      className={cn(
        "flex items-center gap-1 text-xs font-medium transition-all duration-150 rounded-md px-1.5 py-0.5",
        "text-green-600 hover:text-green-700 hover:bg-green-50 active:scale-95"
      )}
    >
      <Play className="w-3 h-3" />
      Tutorial
    </a>
  );

  const RefreshButton = (
    <button onClick={handleRefresh} disabled={isFetching} title="Refresh intraday VWAP & volume"
      className={cn(
        "flex items-center gap-1 text-xs font-medium transition-all duration-150 rounded-md px-1.5 py-0.5",
        "text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-95",
        "disabled:opacity-40 disabled:cursor-not-allowed"
      )}>
      <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
      {isFetching ? "Refreshing…" : "Refresh"}
    </button>
  );

  // ── COMPACT MODE ─────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={cn(
        "rounded-lg border border-gray-200 bg-white p-3 space-y-2 transition-opacity duration-200",
        isFetching && "opacity-70"
      )}>
        {/* Row 1: Price + Verdict + CTA + Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">${currentPrice.toFixed(2)}</span>
          <span className={cn("text-xs font-medium", priceChangeColor)}>
            {dayChange >= 0 ? "+" : ""}{dayChange.toFixed(2)} ({dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(1)}%)
          </span>
          {/* Verdict badge */}
          <Badge variant="outline" className={cn(
            "text-xs px-2 py-0.5 font-bold flex items-center gap-1",
            verdict === "GO" ? "bg-green-100 text-green-700 border-green-300"
              : verdict === "CAUTION" ? "bg-yellow-100 text-yellow-700 border-yellow-300"
              : "bg-red-100 text-red-700 border-red-300"
          )}>
            <VerdictIcon className="w-3 h-3" />
            {verdict}
          </Badge>
          {/* CTA badge */}
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5", ctaBadgeColor)}>
            {ctaSignal === "TAILWIND" ? "CTA ↑" : ctaSignal === "HEADWIND" ? "CTA ↓" : ctaSignal === "APPROACHING_FLIP" ? "CTA ⚡" : "CTA —"}
            {ctaRecentCross && " Fresh"}
          </Badge>
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5", trendColor)}>
            <TrendIcon className="w-3 h-3 mr-0.5" />
            {trend === "UPTREND" ? "Up" : trend === "DOWNTREND" ? "Down" : "Range"}
          </Badge>
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5", ivrColor)}>
            IVR {ivr}%
          </Badge>
          {vwapSignal !== "N/A" && (
            <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5", vwapColor)}>
              VWAP {vwapSignal}
            </Badge>
          )}
          <div className="ml-auto">{RefreshButton}</div>
        </div>
        {/* Row 2: Score + MAs + Volume + RSI + timestamp */}
        <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
          <span className={cn("font-medium", verdictText)}>Score {verdictScore}/{verdictMaxScore}</span>
          <span className={priceVsMa20 === "ABOVE" ? "text-green-600" : "text-red-500"}>{priceVsMa20} MA20</span>
          <span className={priceVsMa50 === "ABOVE" ? "text-green-600" : "text-red-500"}>{priceVsMa50} MA50</span>
          <span className={volLabel === "STRONG" ? "text-green-600 font-medium" : volLabel === "WEAK" ? "text-red-500" : "text-gray-500"}>
            Vol {relVol}x
          </span>
          {rsiLabel !== "NEUTRAL" && rsiLabel !== "N/A" && rsi !== null && (
            <span className={rsiLabel === "OVERSOLD" ? "text-blue-600 font-medium" : "text-orange-600 font-medium"}>
              RSI {rsi}
            </span>
          )}
          <span className="text-gray-400 ml-auto">{formattedTime} ET</span>
        </div>
        {/* Row 3: Execution summary */}
        <div className={cn("rounded px-2.5 py-1.5 border text-xs leading-relaxed", verdictBg, verdictText)}>
          <span className="font-semibold">{verdict}: </span>{executionSummary}
        </div>
      </div>
    );
  }

  // ── FULL CARD MODE ────────────────────────────────────────────────────────────
  return (
    <Card className={cn("border border-gray-200 bg-white shadow-sm transition-opacity duration-200", isFetching && "opacity-70")}>
      <CardContent className="p-5 space-y-4">

        {/* ── Header: ticker + price + trend + refresh ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-gray-900">{ticker}</span>
              <span className="text-xl font-semibold text-gray-700">${currentPrice.toFixed(2)}</span>
              <span className={cn("text-sm font-medium", priceChangeColor)}>
                {dayChange >= 0 ? "+" : ""}{dayChange.toFixed(2)} ({dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(1)}%)
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{trendStructure}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {TutorialButton}
            {RefreshButton}
            <Badge variant="outline" className={cn("text-sm px-2 py-1 flex items-center gap-1.5", trendColor)}>
              <TrendIcon className="w-4 h-4" />
              {trend}
            </Badge>
          </div>
        </div>

        {/* ── VERDICT PANEL ── */}
        <div className={cn("rounded-xl border-2 p-4", verdictBg)}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <VerdictIcon className={cn("w-5 h-5", verdictText)} />
              <span className={cn("text-lg font-black tracking-wide", verdictText)}>{verdict}</span>
              <span className="text-xs text-gray-500 font-medium">Signal Score: {verdictScore} / {verdictMaxScore}</span>
            </div>
            {/* Score bar */}
            <div className="flex items-center gap-1">
              {Array.from({ length: verdictMaxScore }).map((_, i) => (
                <div key={i} className={cn(
                  "w-2 h-4 rounded-sm",
                  i < verdictScore
                    ? verdict === "GO" ? "bg-green-500" : verdict === "CAUTION" ? "bg-yellow-400" : "bg-red-400"
                    : "bg-gray-200"
                )} />
              ))}
            </div>
          </div>
          {/* Execution summary */}
          <p className={cn("text-sm leading-relaxed font-medium", verdictText)}>{executionSummary}</p>
          {/* Conflict warning */}
          {conflictWarning && (
            <div className="mt-2 flex items-start gap-1.5 bg-white/60 rounded-lg px-2.5 py-2 border border-orange-200">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700 leading-relaxed">{conflictWarning}</p>
            </div>
          )}
        </div>

        {/* ── CTA FLOW SIGNAL ── */}
        <div className={cn("rounded-lg border p-3", ctaBg)}>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">{ctaLabel}</span>
            {ctaRecentCross && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 border-current opacity-80">Fresh Cross</Badge>
            )}
            <span className="text-xs opacity-70 ml-auto">
              {ctaDistanceFromMa50Pct > 0 ? "+" : ""}{ctaDistanceFromMa50Pct}% vs MA50 (${ma50.toFixed(2)})
            </span>
          </div>
          <p className="text-xs leading-relaxed opacity-80">{ctaDetail}</p>
        </div>

        {/* ── SIGNAL CHECKLIST ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Signal Checklist</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {(verdictSignals ?? []).map((sig: { label: string; value: string; status: SignalStatus }) => (
              <div key={sig.label} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 border border-gray-100">
                <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[sig.status])} />
                <span className="text-xs text-gray-500 w-20 shrink-0">{sig.label}</span>
                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                <span className={cn("text-xs font-medium truncate", STATUS_ROW[sig.status])}>{sig.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ATR / Strike sizing ── */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-xs font-medium text-gray-600">ATR-Based Strike Sizing</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-500">ATR(14)</p>
              <p className="font-semibold text-gray-800">${atr.toFixed(2)} <span className="text-gray-500 font-normal">({atrPct}%)</span></p>
            </div>
            <div>
              <p className="text-gray-500">Strangle width</p>
              <p className="font-semibold text-gray-800">±${suggestedStrangleDistance}</p>
            </div>
            <div>
              <p className="text-gray-500">Spread width</p>
              <p className="font-semibold text-gray-800">${suggestedSpreadDistance}</p>
            </div>
          </div>
        </div>

        {/* ── Strategy suggestion ── */}
        <div className={cn("rounded-lg border p-3.5", confidenceColor)}>
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <Lightbulb className="w-4 h-4" />
              <ConfidenceIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{suggestedStrategy}</p>
              <p className="text-xs mt-1 opacity-80 leading-relaxed">{strategyRationale}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs font-medium opacity-70">Confidence:</span>
            <Badge variant="outline" className={cn("text-xs px-1.5 py-0",
              strategyConfidence === "HIGH" ? "border-green-300 text-green-700"
                : strategyConfidence === "MEDIUM" ? "border-yellow-300 text-yellow-700"
                : "border-gray-300 text-gray-500"
            )}>
              {strategyConfidence}
            </Badge>
            {/* IVR + VWAP inline */}
            <span className={cn("ml-auto text-xs font-medium", ivrColor.split(" ")[1])}>
              IVR {ivr}% ({ivrLabel})
            </span>
            {vwapSignal !== "N/A" && vwap !== null && (
              <span className={cn("text-xs font-medium", vwapColor.split(" ")[1])}>
                VWAP {vwapSignal} (${vwap.toFixed(2)})
              </span>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {lastRefreshed ? "Refreshed" : "Data as of"} {formattedTime} ET
          </p>
          <div className="flex items-center gap-2">
            {isFetching && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Updating…
              </span>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Info className="w-3 h-3" />
              <span>Score: {verdictScore}/{verdictMaxScore}</span>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
