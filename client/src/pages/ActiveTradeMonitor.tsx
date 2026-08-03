import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Clock,
} from "lucide-react";

type ExitRec = "HOLD" | "REVIEW" | "EXIT";
type Verdict = "ALIGNED" | "PARTIAL" | "CONFLICTED";
type Phase = "TRENDING" | "CONSOLIDATING" | "COILING";

const EXIT_CONFIG: Record<ExitRec, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  HOLD: {
    label: "HOLD",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
    icon: <ShieldCheck className="w-4 h-4 text-green-400" />,
  },
  REVIEW: {
    label: "REVIEW",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    icon: <Eye className="w-4 h-4 text-yellow-400" />,
  },
  EXIT: {
    label: "EXIT NOW",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
  },
};

const VERDICT_CONFIG: Record<Verdict, { color: string; dot: string }> = {
  ALIGNED: { color: "text-green-400", dot: "bg-green-400" },
  PARTIAL: { color: "text-yellow-400", dot: "bg-yellow-400" },
  CONFLICTED: { color: "text-red-400", dot: "bg-red-400" },
};

const PHASE_CONFIG: Record<Phase, { color: string; label: string }> = {
  TRENDING: { color: "text-indigo-400", label: "TRENDING" },
  CONSOLIDATING: { color: "text-slate-400", label: "CONSOLIDATING" },
  COILING: { color: "text-orange-400", label: "COILING ⚡" },
};

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-4 rounded-sm transition-all ${
            i < score
              ? score >= 6
                ? "bg-green-400"
                : score >= 4
                ? "bg-yellow-400"
                : "bg-red-400"
              : "bg-white/10"
          }`}
        />
      ))}
      <span className="ml-1.5 text-xs text-white/60">{score}/8</span>
    </div>
  );
}

function ScoreDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-white/40 flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>;
  if (delta > 0) return <span className="text-xs text-green-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +{delta} vs entry</span>;
  return <span className="text-xs text-red-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> {delta} vs entry</span>;
}

function TradeCard({ trade }: { trade: NonNullable<ReturnType<typeof useMonitor>["data"]>[number] }) {
  if (!trade) return null;
  const exitCfg = EXIT_CONFIG[trade.exitRecommendation];
  const verdictCfg = VERDICT_CONFIG[trade.currentVerdict as Verdict] ?? VERDICT_CONFIG.CONFLICTED;
  const phaseCfg = PHASE_CONFIG[trade.currentPhase as Phase] ?? PHASE_CONFIG.CONSOLIDATING;
  const executedDate = trade.executedAt ? new Date(trade.executedAt).toLocaleDateString() : "—";

  return (
    <Card className={`border ${exitCfg.bg} bg-[#0f1117] transition-all hover:shadow-lg`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">{trade.ticker}</span>
              <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                {trade.strategy}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-white/40">
              <Clock className="w-3 h-3" />
              Entered {executedDate}
              {trade.maxLoss && (
                <span className="ml-2 text-red-400/60">Max loss: ${Number(trade.maxLoss).toFixed(0)}</span>
              )}
            </div>
          </div>
          {/* Exit recommendation badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-sm ${exitCfg.bg} ${exitCfg.color}`}>
            {exitCfg.icon}
            {exitCfg.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Confluence Score</span>
            <ScoreDeltaBadge delta={trade.scoreDelta} />
          </div>
          <ScoreBar score={trade.currentScore} />
        </div>

        {/* Verdict + Phase row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${verdictCfg.dot}`} />
            <span className={`text-xs font-semibold ${verdictCfg.color}`}>{trade.currentVerdict}</span>
          </div>
          <div className="text-white/20">·</div>
          <span className={`text-xs font-semibold ${phaseCfg.color}`}>{phaseCfg.label}</span>
          {trade.backtestTier && (
            <>
              <div className="text-white/20">·</div>
              <span className="text-xs text-white/50">Tier {trade.backtestTier}</span>
            </>
          )}
        </div>

        {/* Exit reason */}
        <div className={`rounded-lg p-3 border text-sm ${exitCfg.bg}`}>
          <p className={`font-medium ${exitCfg.color}`}>{trade.exitReason}</p>
        </div>

        {/* Suggested current strategy */}
        {trade.suggestedStrategy && trade.suggestedStrategy !== "N/A" && (
          <div className="text-xs text-white/40">
            Current signal suggests: <span className="text-white/70 font-medium">{trade.suggestedStrategy}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function useMonitor() {
  return trpc.confluence.activeMonitor.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
    staleTime: 4 * 60 * 1000,
  });
}

export default function ActiveTradeMonitor() {
  const { data, isLoading, error, refetch, isFetching } = useMonitor();
  const [, navigate] = useLocation();

  const exitCount = data?.filter(t => t?.exitRecommendation === "EXIT").length ?? 0;
  const reviewCount = data?.filter(t => t?.exitRecommendation === "REVIEW").length ?? 0;
  const holdCount = data?.filter(t => t?.exitRecommendation === "HOLD").length ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-400" />
            Active Trade Monitor
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Live confluence health check on all open positions. Alerts when edge degrades.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-white/20 text-white/70 hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary bar */}
      {!isLoading && data && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{exitCount}</div>
            <div className="text-xs text-red-400/70 mt-0.5">EXIT NOW</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{reviewCount}</div>
            <div className="text-xs text-yellow-400/70 mt-0.5">REVIEW</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{holdCount}</div>
            <div className="text-xs text-green-400/70 mt-0.5">HOLD</div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="bg-[#0f1117] border-white/10">
              <CardHeader><Skeleton className="h-6 w-32 bg-white/10" /></CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-3/4 bg-white/10" />
              </CardContent>
            </Card>
          ))}
          <p className="text-center text-white/40 text-sm">Running confluence scan on open positions…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400 font-medium">Failed to load monitor data</p>
            <p className="text-white/40 text-sm mt-1">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state — no open trades */}
      {!isLoading && !error && data && data.length === 0 && (
        <Card className="bg-[#0f1117] border-white/10">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Open Trades</h3>
            <p className="text-white/50 text-sm max-w-sm mx-auto">
              You have no open positions to monitor. Use the Daily Scan to find your next setup.
            </p>
            <Button
              className="mt-4 bg-green-500 hover:bg-green-600 text-black font-semibold"
              onClick={() => navigate("/daily-scan")}
            >
              Go to Daily Scan
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Trade cards — EXIT first, then REVIEW, then HOLD */}
      {!isLoading && data && data.length > 0 && (
        <div className="space-y-4">
          {/* EXIT trades first */}
          {exitCount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-red-400 uppercase tracking-wider">Immediate Action Required</span>
              </div>
              <div className="space-y-3">
                {data.filter(t => t?.exitRecommendation === "EXIT").map(trade => (
                  <TradeCard key={trade!.tradeId} trade={trade!} />
                ))}
              </div>
            </div>
          )}
          {/* REVIEW trades */}
          {reviewCount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Monitor Closely</span>
              </div>
              <div className="space-y-3">
                {data.filter(t => t?.exitRecommendation === "REVIEW").map(trade => (
                  <TradeCard key={trade!.tradeId} trade={trade!} />
                ))}
              </div>
            </div>
          )}
          {/* HOLD trades */}
          {holdCount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-green-400 uppercase tracking-wider">Holding Strong</span>
              </div>
              <div className="space-y-3">
                {data.filter(t => t?.exitRecommendation === "HOLD").map(trade => (
                  <TradeCard key={trade!.tradeId} trade={trade!} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && data && data.length > 0 && (
        <p className="text-center text-white/30 text-xs">
          Confluence re-scanned in real time. Auto-refreshes every 5 minutes. Exit alerts sent to your phone.
        </p>
      )}
    </div>
  );
}
