/**
 * LosingStreakAnalyzer — panel for the My Trades tab
 * Shows: max streak, current streak, avg streak, distribution histogram,
 *        probability of 7+ losses, risk-per-trade comparison vs Rajan formula
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  Flame,
  Loader2,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-foreground", icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <Card className="shadow-none border-border">
      <CardContent className="pt-3 pb-3 px-3">
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
        <div className={`text-lg font-bold ${color}`}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Streak Histogram ─────────────────────────────────────────────────────────

function StreakHistogram({ dist, color }: { dist: Record<number, number>; color: string }) {
  const entries = Object.entries(dist)
    .map(([len, cnt]) => ({ len: parseInt(len), cnt }))
    .sort((a, b) => a.len - b.len);

  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No streak data yet</p>;

  const maxCnt = Math.max(...entries.map(e => e.cnt));

  return (
    <div className="flex items-end gap-1.5 h-16">
      {entries.map(({ len, cnt }) => (
        <div key={len} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
          <span className="text-[9px] text-muted-foreground">{cnt}×</span>
          <div
            className="w-full rounded-t-sm transition-all"
            style={{
              height: `${Math.max(4, (cnt / maxCnt) * 48)}px`,
              background: color,
              opacity: 0.7 + (cnt / maxCnt) * 0.3,
            }}
          />
          <span className="text-[9px] text-muted-foreground">{len}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  accountId?: string;
}

export function LosingStreakAnalyzer({ accountId }: Props) {
  const query = trpc.tradeAnalytics.losingStreakAnalysis.useQuery(
    accountId ? { accountId } : undefined,
    { refetchOnWindowFocus: false }
  );

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = query.data;
  if (!d || d.totalTrades === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <BarChart2 className="h-7 w-7 text-muted-foreground/40" />
        <p className="text-sm">No trade data to analyze</p>
      </div>
    );
  }

  const currentStreakIsLoss = d.currentLossStreak > 0;
  const currentStreakLabel = currentStreakIsLoss
    ? `${d.currentLossStreak} consecutive losses`
    : `${d.currentWinStreak} consecutive wins`;

  const riskPerTrade = d.avgLoss ?? 0;
  const rajanRisk = d.rajanFormula.riskPerTradePct;
  const rajanDollar = 350000 * (rajanRisk / 100); // approx

  return (
    <div className="space-y-4">
      {/* Streak summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Max Loss Streak"
          value={String(d.maxLossStreak)}
          sub="consecutive losses"
          color="text-red-500"
          icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
        />
        <StatCard
          label="Current Streak"
          value={currentStreakIsLoss ? `-${d.currentLossStreak}` : `+${d.currentWinStreak}`}
          sub={currentStreakLabel}
          color={currentStreakIsLoss ? "text-red-500" : "text-green-600"}
          icon={currentStreakIsLoss
            ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
        />
        <StatCard
          label="Avg Loss Streak"
          value={String(d.avgLossStreak)}
          sub="trades per losing run"
          icon={<BarChart2 className="h-3.5 w-3.5 text-purple-500" />}
        />
        <StatCard
          label="Win Rate"
          value={`${d.winRate}%`}
          sub={`${d.totalTrades} total trades`}
          color={d.winRate >= 50 ? "text-green-600" : "text-amber-600"}
          icon={<TrendingUp className="h-3.5 w-3.5 text-blue-500" />}
        />
      </div>

      {/* Probability insight */}
      <Card className="shadow-none border-border bg-muted/30">
        <CardContent className="pt-3 pb-3 px-4">
          <div className="flex items-start gap-3">
            <Flame className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-0.5">Streak Probability (Rajan Math)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                With your {d.winRate}% win rate over {d.totalTrades} trades, there is a{" "}
                <span className="font-semibold text-foreground">{d.prob7ConsecLossesInSample}% probability</span>{" "}
                of experiencing 7+ consecutive losses in this sample. Your actual max streak was{" "}
                <span className="font-semibold text-foreground">{d.maxLossStreak}</span>.{" "}
                {d.maxLossStreak >= 7
                  ? "This is statistically expected — not a strategy failure."
                  : "You haven't hit a 7-streak yet, but it's coming. Size accordingly."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histograms */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="shadow-none border-border">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Loss Streak Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <StreakHistogram dist={d.lossStreakDistribution} color="#ef4444" />
            <p className="text-[9px] text-muted-foreground mt-1">x-axis: streak length, y-axis: occurrences</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-border">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Win Streak Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <StreakHistogram dist={d.winStreakDistribution} color="#22c55e" />
            <p className="text-[9px] text-muted-foreground mt-1">x-axis: streak length, y-axis: occurrences</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk per trade comparison */}
      <Card className="shadow-none border-border">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-green-500" />
            Risk Per Trade — Your Trades vs. Rajan Formula
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Your Avg Loss</p>
              <p className="text-lg font-bold text-red-500">
                {d.avgLoss != null ? `$${Math.abs(d.avgLoss).toFixed(0)}` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">per losing trade</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Rajan Target</p>
              <p className="text-lg font-bold text-green-600">
                ${rajanDollar.toFixed(0)}
              </p>
              <p className="text-[10px] text-muted-foreground">{rajanRisk}% of $350K capital</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5">
            <strong>Rajan formula:</strong> {d.rajanFormula.description}
          </div>
          {d.avgLoss != null && Math.abs(d.avgLoss) > rajanDollar * 1.5 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Your avg loss is {(Math.abs(d.avgLoss) / rajanDollar).toFixed(1)}× above Rajan's target. Consider tighter stops.
            </div>
          )}
          {d.avgLoss != null && Math.abs(d.avgLoss) <= rajanDollar && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2.5 py-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Your avg loss is within Rajan's risk-per-trade target. Good discipline.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
