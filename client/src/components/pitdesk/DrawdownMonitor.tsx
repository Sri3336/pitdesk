/**
 * DrawdownMonitor — compact card for the dashboard home
 * Shows: current drawdown %, daily P&L, risk per trade, warning/alert states
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Loader2, Shield, TrendingDown, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";

function fmt(n: number, prefix = "$"): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${prefix}${abs.toFixed(0)}`;
}

export function DrawdownMonitor() {
  const [, navigate] = useLocation();
  const statsQuery = trpc.tradeAnalytics.drawdownStats.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every minute
  });

  const s = statsQuery.data;

  if (statsQuery.isLoading) {
    return (
      <Card className="shadow-none border-border">
        <CardContent className="flex items-center justify-center h-28">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!s) return null;

  // Severity levels
  const usedPct = s.drawdownUsedPct;
  const isGreen = usedPct < 50;
  const isWarning = usedPct >= 50 && usedPct < 80;
  const isDanger = usedPct >= 80;

  const barColor = isDanger ? "#ef4444" : isWarning ? "#f59e0b" : "#22c55e";
  const bgClass = isDanger ? "border-red-300 bg-red-50/40" : isWarning ? "border-amber-300 bg-amber-50/30" : "border-border";

  return (
    <Card
      className={`shadow-none border cursor-pointer hover:shadow-sm transition-shadow ${bgClass}`}
      onClick={() => navigate("/pre-market")}
    >
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Drawdown Monitor
          {isDanger && <AlertTriangle className="h-3.5 w-3.5 text-red-500 ml-auto" />}
          {isWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-auto" />}
          {isGreen && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2.5">
        {/* Drawdown bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Drawdown used</span>
            <span className="text-[10px] font-semibold" style={{ color: barColor }}>
              {usedPct.toFixed(1)}% of {s.maxDrawdownPct}% max
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(usedPct, 100)}%`, background: barColor }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Total P&L</p>
            <p className={`text-sm font-bold ${s.totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
              {fmt(s.totalPnl)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Today</p>
            <p className={`text-sm font-bold ${s.todayPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
              {fmt(s.todayPnl)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Risk/Trade</p>
            <p className="text-sm font-bold text-foreground">
              {fmt(s.riskPerTradeDollar)}
            </p>
          </div>
        </div>

        {/* Alert message */}
        {isDanger && (
          <div className="flex items-center gap-1.5 text-[10px] text-red-600 font-medium bg-red-50 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Drawdown at {usedPct.toFixed(0)}% of max — consider stopping trading today
          </div>
        )}
        {isWarning && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-700 font-medium bg-amber-50 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Halfway to max drawdown — trade with extra caution
          </div>
        )}
      </CardContent>
    </Card>
  );
}
