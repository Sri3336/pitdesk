/**
 * DailyScan — Scans all 60 PCR tickers and ranks them by confluence score.
 * Shows verdict, score, phase, backtest tier, and suggested strategy for each.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, CheckCircle2,
  AlertTriangle, XCircle, Zap, Clock, Filter, ChevronRight,
  BarChart3, Target, Flame
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────
type Verdict = "ALIGNED" | "PARTIAL" | "CONFLICTED";
type Phase = "TRENDING" | "CONSOLIDATING" | "COILING";

interface ScanResult {
  ticker: string;
  verdict: Verdict;
  verdictScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  suggestedStrategy: string;
  marketPhase: Phase;
  marketPhaseSuggestedStructure: string;
  backtestTier: string | null;
  backtestWinRate: number | null;
  backtestAvgPnl: number | null;
  thetaCandidate: boolean;
  thetaLabel: string | null;
  whatToDo: string;
  dataAsOf: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function verdictConfig(verdict: Verdict) {
  if (verdict === "ALIGNED") return {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    cls: "bg-green-100 text-green-700 border-green-300",
    cardBorder: "border-green-200",
    cardBg: "bg-gradient-to-br from-green-50/60 to-white",
    barCls: "bg-green-500",
  };
  if (verdict === "PARTIAL") return {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    cls: "bg-yellow-100 text-yellow-700 border-yellow-300",
    cardBorder: "border-yellow-200",
    cardBg: "bg-gradient-to-br from-yellow-50/40 to-white",
    barCls: "bg-yellow-400",
  };
  return {
    icon: <XCircle className="w-3.5 h-3.5" />,
    cls: "bg-gray-100 text-gray-500 border-gray-200",
    cardBorder: "border-gray-200",
    cardBg: "bg-white",
    barCls: "bg-gray-300",
  };
}

function phaseConfig(phase: Phase) {
  if (phase === "TRENDING") return { cls: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "↗" };
  if (phase === "COILING") return { cls: "bg-orange-100 text-orange-700 border-orange-200", icon: "⟳" };
  return { cls: "bg-slate-100 text-slate-600 border-slate-200", icon: "↔" };
}

function backtestTierConfig(tier: string | null) {
  if (tier === "A") return { cls: "bg-green-100 text-green-700 border-green-200" };
  if (tier === "B") return { cls: "bg-blue-100 text-blue-700 border-blue-200" };
  if (tier === "C") return { cls: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  if (tier === "D") return { cls: "bg-red-100 text-red-700 border-red-200" };
  return { cls: "bg-gray-100 text-gray-400 border-gray-200" };
}

function ScoreBar({ score, max = 8, barCls }: { score: number; max?: number; barCls: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={cn("h-1.5 flex-1 rounded-sm", i < score ? barCls : "bg-gray-200")} />
      ))}
    </div>
  );
}

// ── Scan Result Card ──────────────────────────────────────────────────────────
function ScanCard({ result, rank }: { result: ScanResult; rank: number }) {
  const vc = verdictConfig(result.verdict);
  const pc = phaseConfig(result.marketPhase);
  const btc = backtestTierConfig(result.backtestTier);
  const isTop5 = rank <= 5 && result.verdict === "ALIGNED";

  return (
    <Link href={`/ticker-analysis?ticker=${result.ticker}`}>
      <div className={cn(
        "rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden",
        vc.cardBorder, vc.cardBg,
        isTop5 && "ring-2 ring-green-400/50"
      )}>
        {isTop5 && (
          <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
            TOP SETUP
          </div>
        )}
        {/* Header row */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-gray-900">{result.ticker}</span>
              {result.thetaCandidate && result.thetaLabel && (
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Flame className="w-2.5 h-2.5" /> θ
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1", vc.cls)}>
                {vc.icon} {result.verdict}
              </span>
              <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded-full border", pc.cls)}>
                {pc.icon} {result.marketPhase}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-lg font-black text-gray-800">{Math.round(result.verdictScore * 10 / 8)}<span className="text-xs font-normal text-gray-400">/10</span></span>
            {result.backtestTier && (
              <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded border", btc.cls)}>
                TIER {result.backtestTier}
              </span>
            )}
          </div>
        </div>

        {/* Score bar */}
        <div className="mb-2">
          <ScoreBar score={Math.round(result.verdictScore * 10 / 8)} max={10} barCls={vc.barCls} />
        </div>

        {/* Strategy row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-600 font-medium truncate">{result.suggestedStrategy}</span>
          </div>
          {result.backtestWinRate && (
            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
              {result.backtestWinRate}% win
            </span>
          )}
        </div>

        {/* What to do — truncated */}
        {result.verdict !== "CONFLICTED" && (
          <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">{result.whatToDo}</p>
        )}

        {/* Navigate hint */}
        <div className="flex items-center justify-end mt-2">
          <span className="text-xs text-gray-400 flex items-center gap-0.5">
            Full analysis <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Summary Stats Bar ─────────────────────────────────────────────────────────
function SummaryBar({ results }: { results: ScanResult[] }) {
  const aligned = results.filter(r => r.verdict === "ALIGNED").length;
  const partial = results.filter(r => r.verdict === "PARTIAL").length;
  const conflicted = results.filter(r => r.verdict === "CONFLICTED").length;
  const coiling = results.filter(r => r.marketPhase === "COILING").length;
  const tierA = results.filter(r => r.backtestTier === "A").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: "ALIGNED", value: aligned, cls: "text-green-600", bg: "bg-green-50 border-green-200" },
        { label: "PARTIAL", value: partial, cls: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
        { label: "CONFLICTED", value: conflicted, cls: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
        { label: "COILING", value: coiling, cls: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
        { label: "TIER A", value: tierA, cls: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
      ].map(s => (
        <div key={s.label} className={cn("rounded-xl border px-4 py-3 text-center", s.bg)}>
          <div className={cn("text-2xl font-black", s.cls)}>{s.value}</div>
          <div className="text-xs text-gray-500 font-semibold mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DailyScan() {
  const [forceRefresh, setForceRefresh] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState<Verdict | "ALL">("ALL");
  const [phaseFilter, setPhaseFilter] = useState<Phase | "ALL">("ALL");
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  const { data, isLoading, isFetching, refetch } = trpc.confluence.batchScan.useQuery(
    { forceRefresh },
    { staleTime: 5 * 60 * 1000 }
  );

  const handleRefresh = () => {
    setForceRefresh(true);
    refetch().finally(() => setForceRefresh(false));
  };

  const filtered = useMemo(() => {
    if (!data?.results) return [];
    return data.results.filter(r => {
      if (verdictFilter !== "ALL" && r.verdict !== verdictFilter) return false;
      if (phaseFilter !== "ALL" && r.marketPhase !== phaseFilter) return false;
      if (tierFilter !== "ALL" && r.backtestTier !== tierFilter) return false;
      return true;
    });
  }, [data?.results, verdictFilter, phaseFilter, tierFilter]);

  const scannedAt = data?.scannedAt
    ? new Date(data.scannedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-green-500" />
            Daily Scan
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            All 60 PCR tickers ranked by confluence score — updated every 5 minutes
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scannedAt && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{data?.fromCache ? "Cached" : "Live"} · {scannedAt}</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isFetching) && "animate-spin")} />
            {isLoading || isFetching ? "Scanning…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Loading State ── */}
      {(isLoading || isFetching) && !data && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Scanning 60 tickers…</p>
            <p className="text-xs text-gray-400 mt-1">Fetching price data, computing 4-tier confluence scores, detecting phases. This takes 30–60 seconds.</p>
          </div>
          <div className="grid grid-cols-6 gap-1 max-w-xs mx-auto">
            {Array.from({ length: 60 }).map((_, i) => (
              <div key={i} className="h-2 rounded-sm bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 30}ms` }} />
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* ── Summary Stats ── */}
          <SummaryBar results={data.results} />

          {/* ── Filters ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium">Filter:</span>
            {/* Verdict filter */}
            {(["ALL", "ALIGNED", "PARTIAL", "CONFLICTED"] as const).map(v => (
              <button
                key={v}
                onClick={() => setVerdictFilter(v)}
                className={cn(
                  "text-xs font-semibold px-3 py-1 rounded-full border transition-colors",
                  verdictFilter === v
                    ? v === "ALIGNED" ? "bg-green-500 text-white border-green-500"
                      : v === "PARTIAL" ? "bg-yellow-400 text-white border-yellow-400"
                      : v === "CONFLICTED" ? "bg-gray-500 text-white border-gray-500"
                      : "bg-gray-800 text-white border-gray-800"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                )}
              >{v}</button>
            ))}
            <span className="text-gray-200">|</span>
            {/* Phase filter */}
            {(["ALL", "TRENDING", "CONSOLIDATING", "COILING"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPhaseFilter(p)}
                className={cn(
                  "text-xs font-semibold px-3 py-1 rounded-full border transition-colors",
                  phaseFilter === p
                    ? p === "TRENDING" ? "bg-indigo-500 text-white border-indigo-500"
                      : p === "COILING" ? "bg-orange-500 text-white border-orange-500"
                      : p === "CONSOLIDATING" ? "bg-slate-500 text-white border-slate-500"
                      : "bg-gray-800 text-white border-gray-800"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                )}
              >{p === "ALL" ? "ALL PHASES" : p}</button>
            ))}
            <span className="text-gray-200">|</span>
            {/* Backtest tier filter */}
            {(["ALL", "A", "B", "C", "D"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={cn(
                  "text-xs font-semibold px-3 py-1 rounded-full border transition-colors",
                  tierFilter === t
                    ? t === "A" ? "bg-green-500 text-white border-green-500"
                      : t === "B" ? "bg-blue-500 text-white border-blue-500"
                      : t === "C" ? "bg-yellow-400 text-white border-yellow-400"
                      : t === "D" ? "bg-red-500 text-white border-red-500"
                      : "bg-gray-800 text-white border-gray-800"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                )}
              >{t === "ALL" ? "ALL TIERS" : `TIER ${t}`}</button>
            ))}
          </div>

          {/* ── Results count ── */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-800">{filtered.length}</span> of {data.results.length} tickers
            </p>
            {isFetching && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing…
              </span>
            )}
          </div>

          {/* ── Cards Grid ── */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
              <p className="text-sm text-gray-500">No tickers match the current filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((result, idx) => (
                <ScanCard
                  key={result.ticker}
                  result={result}
                  rank={data.results.findIndex(r => r.ticker === result.ticker) + 1}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
