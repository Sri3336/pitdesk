/**
 * TradeSetupCard.tsx
 * Compact "first-look" card for any ticker.
 * Shows: trend, price vs MA, volume, RSI extremes, ATR strike sizing, IVR, VWAP, strategy suggestion.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  BarChart2,
  Zap,
  Target,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface TradeSetupCardProps {
  ticker: string;
  compact?: boolean; // compact mode for inline use in lists
}

export function TradeSetupCard({ ticker, compact = false }: TradeSetupCardProps) {
  const { data, isLoading, error } = trpc.tradeSetup.getSetup.useQuery(
    { ticker },
    { staleTime: 5 * 60 * 1000, retry: 1 }
  );

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

  if (error || !data) {
    return (
      <Card className="border border-gray-200 bg-white">
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">Setup data unavailable for {ticker}</p>
        </CardContent>
      </Card>
    );
  }

  const {
    currentPrice,
    dayChange,
    dayChangePct,
    trend,
    trendStructure,
    ma20,
    ma50,
    priceVsMa20,
    priceVsMa50,
    relVol,
    volLabel,
    rsi,
    rsiLabel,
    atr,
    atrPct,
    suggestedStrangleDistance,
    suggestedSpreadDistance,
    ivr,
    ivrLabel,
    vwap,
    vwapSignal,
    suggestedStrategy,
    strategyRationale,
    strategyConfidence,
    dataAsOf,
  } = data;

  // ── Trend badge ─────────────────────────────────────────────────────────────
  const TrendIcon = trend === "UPTREND" ? TrendingUp : trend === "DOWNTREND" ? TrendingDown : Minus;
  const trendColor =
    trend === "UPTREND"
      ? "bg-green-100 text-green-700 border-green-200"
      : trend === "DOWNTREND"
      ? "bg-red-100 text-red-700 border-red-200"
      : "bg-yellow-100 text-yellow-700 border-yellow-200";

  // ── IVR badge ───────────────────────────────────────────────────────────────
  const ivrColor =
    ivrLabel === "RICH"
      ? "bg-orange-100 text-orange-700 border-orange-200"
      : ivrLabel === "CHEAP"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-gray-100 text-gray-600 border-gray-200";

  // ── Confidence badge ─────────────────────────────────────────────────────────
  const ConfidenceIcon =
    strategyConfidence === "HIGH"
      ? CheckCircle2
      : strategyConfidence === "MEDIUM"
      ? AlertTriangle
      : Clock;
  const confidenceColor =
    strategyConfidence === "HIGH"
      ? "bg-green-50 border-green-200 text-green-800"
      : strategyConfidence === "MEDIUM"
      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
      : "bg-gray-50 border-gray-200 text-gray-600";

  // ── Price change color ───────────────────────────────────────────────────────
  const priceChangeColor = dayChange >= 0 ? "text-green-600" : "text-red-600";

  // ── VWAP badge ───────────────────────────────────────────────────────────────
  const vwapColor =
    vwapSignal === "ABOVE"
      ? "bg-green-100 text-green-700 border-green-200"
      : vwapSignal === "BELOW"
      ? "bg-red-100 text-red-700 border-red-200"
      : "bg-gray-100 text-gray-500 border-gray-200";

  if (compact) {
    // ── Compact inline mode (for GoalScan list items) ─────────────────────────
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
        {/* Row 1: Price + Trend + IVR */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">${currentPrice.toFixed(2)}</span>
          <span className={cn("text-xs font-medium", priceChangeColor)}>
            {dayChange >= 0 ? "+" : ""}{dayChange.toFixed(2)} ({dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(1)}%)
          </span>
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5 flex items-center gap-1", trendColor)}>
            <TrendIcon className="w-3 h-3" />
            {trend}
          </Badge>
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5", ivrColor)}>
            IVR {ivr}% {ivrLabel}
          </Badge>
          {vwapSignal !== "N/A" && (
            <Badge variant="outline" className={cn("text-xs px-1.5 py-0.5", vwapColor)}>
              VWAP {vwapSignal}
            </Badge>
          )}
        </div>
        {/* Row 2: MA + Volume + RSI */}
        <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
          <span className={priceVsMa20 === "ABOVE" ? "text-green-600" : "text-red-500"}>
            {priceVsMa20} MA20 (${ma20.toFixed(2)})
          </span>
          <span className={priceVsMa50 === "ABOVE" ? "text-green-600" : "text-red-500"}>
            {priceVsMa50} MA50 (${ma50.toFixed(2)})
          </span>
          <span className={volLabel === "STRONG" ? "text-green-600 font-medium" : volLabel === "WEAK" ? "text-red-500" : "text-gray-500"}>
            Vol {relVol}x ({volLabel})
          </span>
          {rsiLabel !== "NEUTRAL" && rsiLabel !== "N/A" && rsi !== null && (
            <span className={rsiLabel === "OVERSOLD" ? "text-blue-600 font-medium" : "text-orange-600 font-medium"}>
              RSI {rsi} ({rsiLabel})
            </span>
          )}
        </div>
        {/* Row 3: Strategy suggestion */}
        <div className={cn("rounded px-2 py-1.5 border text-xs", confidenceColor)}>
          <span className="font-semibold">{suggestedStrategy}</span>
        </div>
      </div>
    );
  }

  // ── Full card mode (for Ticker Analysis page) ─────────────────────────────
  return (
    <Card className="border border-gray-200 bg-white shadow-sm">
      <CardContent className="p-5 space-y-4">
        {/* Header: ticker + price + trend */}
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
          <Badge variant="outline" className={cn("text-sm px-2 py-1 flex items-center gap-1.5 shrink-0", trendColor)}>
            <TrendIcon className="w-4 h-4" />
            {trend}
          </Badge>
        </div>

        {/* Signal grid: MA / Volume / RSI / IVR / VWAP / ATR */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* MA20 */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
            <p className="text-xs text-gray-500 mb-0.5">vs MA20</p>
            <p className={cn("text-sm font-semibold", priceVsMa20 === "ABOVE" ? "text-green-600" : "text-red-500")}>
              {priceVsMa20} <span className="text-gray-500 font-normal text-xs">(${ma20.toFixed(2)})</span>
            </p>
          </div>

          {/* MA50 */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
            <p className="text-xs text-gray-500 mb-0.5">vs MA50</p>
            <p className={cn("text-sm font-semibold", priceVsMa50 === "ABOVE" ? "text-green-600" : "text-red-500")}>
              {priceVsMa50} <span className="text-gray-500 font-normal text-xs">(${ma50.toFixed(2)})</span>
            </p>
          </div>

          {/* Volume */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <BarChart2 className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-500">Rel Volume</p>
            </div>
            <p className={cn("text-sm font-semibold",
              volLabel === "STRONG" ? "text-green-600" :
              volLabel === "WEAK" ? "text-red-500" : "text-gray-700"
            )}>
              {relVol}x <span className="text-xs font-normal">({volLabel})</span>
            </p>
          </div>

          {/* RSI — only show if extreme */}
          {rsiLabel !== "NEUTRAL" && rsiLabel !== "N/A" && rsi !== null ? (
            <div className={cn("rounded-lg border p-2.5",
              rsiLabel === "OVERSOLD" ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100"
            )}>
              <div className="flex items-center gap-1 mb-0.5">
                <Activity className="w-3 h-3 text-gray-400" />
                <p className="text-xs text-gray-500">RSI(14)</p>
              </div>
              <p className={cn("text-sm font-semibold",
                rsiLabel === "OVERSOLD" ? "text-blue-700" : "text-orange-700"
              )}>
                {rsi} <span className="text-xs font-normal">({rsiLabel})</span>
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
              <div className="flex items-center gap-1 mb-0.5">
                <Activity className="w-3 h-3 text-gray-400" />
                <p className="text-xs text-gray-500">RSI(14)</p>
              </div>
              <p className="text-sm font-semibold text-gray-500">
                {rsi ?? "—"} <span className="text-xs font-normal">(neutral)</span>
              </p>
            </div>
          )}

          {/* IVR */}
          <div className={cn("rounded-lg border p-2.5",
            ivrLabel === "RICH" ? "bg-orange-50 border-orange-100" :
            ivrLabel === "CHEAP" ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-gray-100"
          )}>
            <div className="flex items-center gap-1 mb-0.5">
              <Zap className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-500">IV Rank</p>
            </div>
            <p className={cn("text-sm font-semibold",
              ivrLabel === "RICH" ? "text-orange-700" :
              ivrLabel === "CHEAP" ? "text-blue-700" : "text-gray-700"
            )}>
              {ivr}% <span className="text-xs font-normal">({ivrLabel})</span>
            </p>
          </div>

          {/* VWAP */}
          <div className={cn("rounded-lg border p-2.5",
            vwapSignal === "ABOVE" ? "bg-green-50 border-green-100" :
            vwapSignal === "BELOW" ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
          )}>
            <div className="flex items-center gap-1 mb-0.5">
              <Target className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-500">VWAP</p>
            </div>
            <p className={cn("text-sm font-semibold",
              vwapSignal === "ABOVE" ? "text-green-700" :
              vwapSignal === "BELOW" ? "text-red-600" : "text-gray-500"
            )}>
              {vwapSignal === "N/A" ? "—" : vwapSignal}
              {vwap !== null && vwapSignal !== "N/A" && (
                <span className="text-xs font-normal text-gray-500 ml-1">(${vwap.toFixed(2)})</span>
              )}
            </p>
          </div>
        </div>

        {/* ATR / Strike sizing */}
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

        {/* Strategy suggestion */}
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
            <Badge
              variant="outline"
              className={cn("text-xs px-1.5 py-0",
                strategyConfidence === "HIGH" ? "border-green-300 text-green-700" :
                strategyConfidence === "MEDIUM" ? "border-yellow-300 text-yellow-700" :
                "border-gray-300 text-gray-500"
              )}
            >
              {strategyConfidence}
            </Badge>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400">
          Data as of {new Date(dataAsOf).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })} ET
        </p>
      </CardContent>
    </Card>
  );
}
