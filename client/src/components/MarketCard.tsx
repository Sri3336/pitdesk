import { Link } from "wouter";
import { TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SignalBadge } from "@/components/SignalBadge";
import type { CotIndexResult } from "@shared/cotTypes";
import { cn } from "@/lib/utils";

interface MarketCardProps {
  result: CotIndexResult;
  className?: string;
}

function formatNet(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function CotGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 75 ? "#16a34a" : clamped <= 25 ? "#dc2626" : "#6b7280";

  return (
    <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      {/* Threshold zones */}
      <div className="absolute inset-0 flex">
        <div className="w-1/4 bg-red-100 rounded-l-full" />
        <div className="w-1/2 bg-gray-100" />
        <div className="w-1/4 bg-green-100 rounded-r-full" />
      </div>
      {/* Indicator */}
      <div
        className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full transition-all duration-500"
        style={{
          left: `${clamped}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

export function MarketCard({ result, className }: MarketCardProps) {
  const { instrument, cotIndex, signal, commercialNet, commercialNetChange, cotIndexChange, dataAge } = result;

  const changeIcon =
    cotIndexChange > 0 ? (
      <TrendingUp className="h-3 w-3 text-green-600" />
    ) : cotIndexChange < 0 ? (
      <TrendingDown className="h-3 w-3 text-red-500" />
    ) : (
      <Minus className="h-3 w-3 text-gray-400" />
    );

  const borderColor =
    signal === "BULLISH"
      ? "border-l-green-500"
      : signal === "BEARISH"
      ? "border-l-red-500"
      : "border-l-gray-300";

  return (
    <Link href={`/cot/${instrument.id}`}>
      <Card
        className={cn(
          "border-l-4 cursor-pointer hover:shadow-md transition-shadow duration-150 group",
          borderColor,
          className
        )}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-gray-900">{instrument.name}</span>
                <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs text-gray-500">{instrument.exchange} · {instrument.category}</span>
            </div>
            <SignalBadge signal={signal} cotIndex={cotIndex} size="sm" />
          </div>

          {/* Gauge */}
          <div className="my-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Bear</span>
              <span className="font-medium text-gray-700">COT Index: {cotIndex}</span>
              <span>Bull</span>
            </div>
            <CotGauge value={cotIndex} />
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <span>Comm Net:</span>
              <span className={cn("font-medium", commercialNet >= 0 ? "text-green-700" : "text-red-600")}>
                {formatNet(commercialNet)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {changeIcon}
              <span className={cn(
                "font-medium",
                cotIndexChange > 0 ? "text-green-600" : cotIndexChange < 0 ? "text-red-500" : "text-gray-400"
              )}>
                {cotIndexChange > 0 ? "+" : ""}{cotIndexChange}
              </span>
              <span className="text-gray-400">wk</span>
            </div>
          </div>

          {/* Stale data warning */}
          {dataAge > 10 && (
            <div className="mt-2 text-xs text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
              Data {dataAge}d old
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
