/**
 * PCRDashboard.tsx
 *
 * The primary landing page for the Options Strategy Analyzer.
 * Shows a dense, sortable, filterable daily decision table for all tickers:
 *   - Prior-day EOD OI baseline (Put OI, Call OI, PCR OI)
 *   - Today's intraday PCR + delta vs prior
 *   - Signal badge, strategy hint, 7-day sparkline
 *   - Click any row → TickerDetailDrawer (PCR deep-dive + fundamentals + option chain)
 */

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw, Search,
  ChevronUp, ChevronDown, ChevronsUpDown, Activity, Clock, Zap,
  BookmarkPlus, ExternalLink, Info,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { SECTORS } from "../../../shared/tickerUniverse";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts";
import TickerDetailDrawer from "@/components/TickerDetailDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────
type PCRSignal = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";
type SortKey = "ticker" | "sector" | "pcr" | "pcrDelta" | "signal" | "putOI" | "callOI";
type SortDir = "asc" | "desc";

interface LandingRow {
  ticker: string;
  name: string;
  sector: string;
  priorPutOI: number | null;
  priorCallOI: number | null;
  priorPCROI: string | null;
  priorSnapshotDate: string | null;
  closingPrice: string | null;
  hasIntradayScan: boolean;
  currentPCR: string | null;
  currentPCROI: string | null;
  currentSignal: string;
  signalStrength: number;
  strategyHint: string;
  recommendation: string;
  pcrDeltaVsPrior: string | null;
  priorSignal: string | null;
  signalChanged: boolean;
  coiDelta: string | null;
  coiPctChange: string | null;
  ivSkew: string | null;
  totalPutVolume: number;
  totalCallVolume: number;
  pcrHistory: Array<{ runDate: string; pcr: string; signal: string }>;
}

// ─── Signal config ────────────────────────────────────────────────────────────
const SIGNAL_CFG: Record<PCRSignal, {
  label: string;
  shortLabel: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  icon: React.ReactNode;
}> = {
  EXTREME_FEAR:  { label: "Extreme Fear",  shortLabel: "X-Fear",  textColor: "text-emerald-400", bgColor: "bg-emerald-950/60", borderColor: "border-emerald-700/50", dotColor: "bg-emerald-400", icon: <TrendingUp className="h-3 w-3" /> },
  FEAR:          { label: "Fear",          shortLabel: "Fear",    textColor: "text-teal-400",    bgColor: "bg-teal-950/60",    borderColor: "border-teal-700/50",    dotColor: "bg-teal-400",    icon: <TrendingUp className="h-3 w-3" /> },
  NEUTRAL:       { label: "Neutral",       shortLabel: "Neutral", textColor: "text-gray-500",   bgColor: "bg-gray-100/60",   borderColor: "border-gray-300/40",   dotColor: "bg-gray-400",   icon: <Minus className="h-3 w-3" /> },
  GREED:         { label: "Greed",         shortLabel: "Greed",   textColor: "text-amber-400",   bgColor: "bg-amber-50/60",   borderColor: "border-amber-700/50",   dotColor: "bg-amber-400",   icon: <TrendingDown className="h-3 w-3" /> },
  EXTREME_GREED: { label: "Extreme Greed", shortLabel: "X-Greed", textColor: "text-red-400",     bgColor: "bg-red-950/60",     borderColor: "border-red-700/50",     dotColor: "bg-red-400",     icon: <AlertTriangle className="h-3 w-3" /> },
};

function getSignalCfg(signal: string) {
  return SIGNAL_CFG[signal as PCRSignal] ?? SIGNAL_CFG.NEUTRAL;
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function MiniSparkline({ history, signal }: { history: Array<{ runDate: string; pcr: string; signal: string }>; signal: string }) {
  if (!history || history.length < 2) {
    return <div className="w-16 h-8 flex items-center justify-center text-[9px] text-gray-400">No data</div>;
  }
  const cfg = getSignalCfg(signal);
  const strokeColor = signal === "EXTREME_FEAR" || signal === "FEAR" ? "#10b981"
    : signal === "EXTREME_GREED" || signal === "GREED" ? "#ef4444" : "#64748b";

  const chartData = history.map(d => ({ pcr: parseFloat(d.pcr) }));

  return (
    <div className="w-16 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <defs>
            <linearGradient id={`sg-${signal}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="pcr" stroke={strokeColor} strokeWidth={1.5}
            fill={`url(#sg-${signal})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PCR Delta Chip ───────────────────────────────────────────────────────────
function DeltaChip({ delta }: { delta: string | null }) {
  if (!delta) return <span className="text-gray-400 text-xs">—</span>;
  const v = parseFloat(delta);
  if (isNaN(v)) return <span className="text-gray-400 text-xs">—</span>;
  const isUp = v > 0;
  const abs = Math.abs(v).toFixed(2);
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold num border ${
      isUp ? "text-emerald-400 bg-emerald-950/50 border-emerald-700/40"
           : "text-red-400 bg-red-950/50 border-red-700/40"
    }`}>
      {isUp ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      {abs}
    </span>
  );
}

// ─── Signal Change Badge ──────────────────────────────────────────────────────
function SignalChangeBadge({ from, to }: { from: string; to: string }) {
  const fromCfg = getSignalCfg(from);
  const toCfg = getSignalCfg(to);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium">
      <span className={`${fromCfg.textColor} opacity-70`}>{fromCfg.shortLabel}</span>
      <span className="text-gray-400">→</span>
      <span className={toCfg.textColor}>{toCfg.shortLabel}</span>
    </span>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────
function SortHeader({ label, sortKey, currentSort, onSort }: {
  label: string;
  sortKey: SortKey;
  currentSort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
}) {
  const isActive = currentSort.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        isActive ? "text-amber-400" : "text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
      {isActive ? (
        currentSort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

// ─── Header Stats Bar ─────────────────────────────────────────────────────────
function StatsBar({ rows, lastScanTime }: { rows: LandingRow[]; lastScanTime: string | null }) {
  const scanned = rows.filter(r => r.hasIntradayScan);
  const fearCount = scanned.filter(r => r.currentSignal === "EXTREME_FEAR" || r.currentSignal === "FEAR").length;
  const greedCount = scanned.filter(r => r.currentSignal === "EXTREME_GREED" || r.currentSignal === "GREED").length;
  const neutralCount = scanned.filter(r => r.currentSignal === "NEUTRAL").length;
  const regimeChanges = scanned.filter(r => r.signalChanged).length;
  const extremeCount = scanned.filter(r => r.currentSignal === "EXTREME_FEAR" || r.currentSignal === "EXTREME_GREED").length;

  const sentiment = fearCount > greedCount + 5 ? "Bearish Hedging" :
                    greedCount > fearCount + 5 ? "Bullish Complacency" : "Mixed / Balanced";
  const sentimentColor = fearCount > greedCount + 5 ? "text-emerald-400" :
                         greedCount > fearCount + 5 ? "text-red-400" : "text-gray-500";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/80 border-b border-gray-200/60">
      {/* Market sentiment */}
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-xs text-gray-400">Market Sentiment:</span>
        <span className={`text-xs font-semibold ${sentimentColor}`}>{sentiment}</span>
      </div>

      <div className="h-4 w-px bg-gray-200/60" />

      {/* Signal distribution */}
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span className="text-gray-500">Fear</span>
          <span className="font-bold text-emerald-400 num">{fearCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
          <span className="text-gray-500">Neutral</span>
          <span className="font-bold text-gray-600 num">{neutralCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
          <span className="text-gray-500">Greed</span>
          <span className="font-bold text-red-400 num">{greedCount}</span>
        </span>
      </div>

      <div className="h-4 w-px bg-gray-200/60" />

      {/* Regime changes */}
      {regimeChanges > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <Zap className="h-3 w-3 text-violet-400" />
          <span className="text-violet-400 font-semibold">{regimeChanges} regime {regimeChanges === 1 ? "change" : "changes"}</span>
        </div>
      )}

      {/* Extreme signals */}
      {extremeCount > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <AlertTriangle className="h-3 w-3 text-amber-400" />
          <span className="text-amber-400 font-semibold">{extremeCount} extreme signal{extremeCount !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Coverage */}
      <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
        <span className="num">{scanned.length}/{rows.length}</span>
        <span>tickers scanned</span>
        {lastScanTime && (
          <>
            <Clock className="h-3 w-3" />
            <span>Last scan: {lastScanTime}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── OI Bar ───────────────────────────────────────────────────────────────────
function OIBar({ putOI, callOI }: { putOI: number | null; callOI: number | null }) {
  if (!putOI && !callOI) return <span className="text-gray-400 text-xs">—</span>;
  const total = (putOI ?? 0) + (callOI ?? 0);
  if (total === 0) return <span className="text-gray-400 text-xs">—</span>;
  const putPct = ((putOI ?? 0) / total) * 100;
  const callPct = ((callOI ?? 0) / total) * 100;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-2 w-20 rounded-full overflow-hidden gap-px cursor-default">
            <div className="bg-emerald-600/70 rounded-l-full" style={{ width: `${putPct}%` }} />
            <div className="bg-red-600/70 rounded-r-full" style={{ width: `${callPct}%` }} />
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p>Put OI: {(putOI ?? 0).toLocaleString()}</p>
          <p>Call OI: {(callOI ?? 0).toLocaleString()}</p>
          <p>PCR OI: {total > 0 ? ((putOI ?? 0) / (callOI ?? 1)).toFixed(2) : "—"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PCRDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // State
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [signalFilter, setSignalFilter] = useState("all");
  const [scanFilter, setScanFilter] = useState<"all" | "scanned" | "unscanned">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "signal", dir: "desc" });
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Data
  const { data: rows, isLoading, refetch, dataUpdatedAt } = trpc.pcrScheduled.getDailyLandingTable.useQuery(
    {},
    { staleTime: 2 * 60 * 1000, refetchInterval: 5 * 60 * 1000 }
  );

  const triggerScan = trpc.pcrScheduled.triggerIntradayScan.useMutation({
    onSuccess: (result) => {
      toast.success(`Scan complete — ${result.processed} tickers processed, ${result.actionable} actionable signals`);
      refetch();
    },
    onError: (err) => toast.error(`Scan failed: ${err.message}`),
  });

  const triggerEod = trpc.pcrScheduled.triggerEodSnapshot.useMutation({
    onSuccess: (result) => {
      toast.success(`EOD snapshot complete — ${result.saved} tickers saved`);
      refetch();
    },
    onError: (err) => toast.error(`EOD snapshot failed: ${err.message}`),
  });

  const savePCRRec = trpc.pcrScheduled.savePCRRecommendation.useMutation({
    onSuccess: () => toast.success("Recommendation saved for backtesting"),
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  // Sort handler
  const handleSort = useCallback((key: SortKey) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "signal" ? "desc" : "asc" }
    );
  }, []);

  // Last scan time
  const lastScanTime = useMemo(() => {
    if (!dataUpdatedAt) return null;
    return new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [dataUpdatedAt]);

  // Signal strength for sorting
  const signalOrder: Record<string, number> = {
    EXTREME_FEAR: 5, FEAR: 4, NEUTRAL: 2, GREED: 3, EXTREME_GREED: 5,
  };

  // Filtered + sorted rows
  const displayRows = useMemo(() => {
    if (!rows) return [];
    let filtered = rows as LandingRow[];

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      filtered = filtered.filter(r => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
    }
    if (sectorFilter !== "all") {
      filtered = filtered.filter(r => r.sector === sectorFilter);
    }
    if (signalFilter !== "all") {
      filtered = filtered.filter(r => r.currentSignal === signalFilter);
    }
    if (scanFilter === "scanned") {
      filtered = filtered.filter(r => r.hasIntradayScan);
    } else if (scanFilter === "unscanned") {
      filtered = filtered.filter(r => !r.hasIntradayScan);
    }

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "sector": cmp = a.sector.localeCompare(b.sector); break;
        case "pcr": cmp = parseFloat(a.currentPCR ?? "0") - parseFloat(b.currentPCR ?? "0"); break;
        case "pcrDelta": cmp = parseFloat(a.pcrDeltaVsPrior ?? "0") - parseFloat(b.pcrDeltaVsPrior ?? "0"); break;
        case "signal": cmp = (signalOrder[a.currentSignal] ?? 0) - (signalOrder[b.currentSignal] ?? 0); break;
        case "putOI": cmp = (a.priorPutOI ?? 0) - (b.priorPutOI ?? 0); break;
        case "callOI": cmp = (a.priorCallOI ?? 0) - (b.priorCallOI ?? 0); break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sectorFilter, signalFilter, scanFilter, sort]);

  const handleRowClick = (ticker: string) => {
    setSelectedTicker(ticker);
    setDrawerOpen(true);
  };

  const handleSaveRec = (row: LandingRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.hasIntradayScan) {
      toast.error("No intraday scan data yet — run the 11:30 AM scan first");
      return;
    }
    savePCRRec.mutate({
      ticker: row.ticker,
      signal: row.currentSignal,
      strategyHint: row.strategyHint,
      recommendation: row.recommendation,
      pcr: row.currentPCR ?? "0",
      pcrDeltaVsPrior: row.pcrDeltaVsPrior,
      priorSignal: row.priorSignal,
      runDate: new Date().toISOString().slice(0, 10),
      closingPrice: row.closingPrice,
    });
  };

  const sectors = useMemo(() => Array.from(new Set((rows as LandingRow[] | undefined ?? []).map(r => r.sector))).sort(), [rows]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0 bg-gray-50 text-gray-900">

        {/* ── Page Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">
              PCR Daily Dashboard
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Put/Call Ratio signals for {rows?.length ?? "—"} tickers · EOD baseline + 11:30 AM intraday scan
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => triggerEod.mutate()}
                disabled={triggerEod.isPending}
                className="text-xs border-gray-200 text-gray-500 hover:text-gray-700 hover:border-slate-500 bg-transparent"
              >
                {triggerEod.isPending ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                EOD Snapshot
              </Button>
              <Button
                size="sm"
                onClick={() => triggerScan.mutate()}
                disabled={triggerScan.isPending}
                className="text-xs bg-amber-600 hover:bg-amber-500 text-white border-0"
              >
                {triggerScan.isPending
                  ? <><RefreshCw className="h-3 w-3 animate-spin mr-1.5" />Scanning…</>
                  : <><Activity className="h-3 w-3 mr-1.5" />Run 11:30 Scan</>
                }
              </Button>
            </div>
          )}
        </div>

        {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
        {rows && rows.length > 0 && (
          <StatsBar rows={rows as LandingRow[]} lastScanTime={lastScanTime} />
        )}

        {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-200/60 shrink-0">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search ticker or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-white border-gray-200 text-gray-700 placeholder:text-gray-400"
            />
          </div>

          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs bg-white border-gray-200 text-gray-600">
              <SelectValue placeholder="All Sectors" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 text-gray-700">
              <SelectItem value="all">All Sectors</SelectItem>
              {sectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={signalFilter} onValueChange={setSignalFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs bg-white border-gray-200 text-gray-600">
              <SelectValue placeholder="All Signals" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 text-gray-700">
              <SelectItem value="all">All Signals</SelectItem>
              <SelectItem value="EXTREME_FEAR">Extreme Fear</SelectItem>
              <SelectItem value="FEAR">Fear</SelectItem>
              <SelectItem value="NEUTRAL">Neutral</SelectItem>
              <SelectItem value="GREED">Greed</SelectItem>
              <SelectItem value="EXTREME_GREED">Extreme Greed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={scanFilter} onValueChange={v => setScanFilter(v as typeof scanFilter)}>
            <SelectTrigger className="h-8 w-[140px] text-xs bg-white border-gray-200 text-gray-600">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 text-gray-700">
              <SelectItem value="all">All Tickers</SelectItem>
              <SelectItem value="scanned">Scanned Today</SelectItem>
              <SelectItem value="unscanned">No Scan Yet</SelectItem>
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-gray-400 num">{displayRows.length} rows</span>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-gray-200/50" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
                <tr className="border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 w-[120px]">
                    <SortHeader label="Ticker" sortKey="ticker" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 w-[130px] hidden lg:table-cell">
                    <SortHeader label="Sector" sortKey="sector" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 w-[100px]">
                    <SortHeader label="Signal" sortKey="signal" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 w-[80px]">
                    <SortHeader label="PCR" sortKey="pcr" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 w-[80px]">
                    <SortHeader label="Δ PCR" sortKey="pcrDelta" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 w-[120px] hidden xl:table-cell">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">OI Split</span>
                  </th>
                  <th className="text-left px-3 py-2.5 w-[80px] hidden md:table-cell">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">7d PCR</span>
                  </th>
                  <th className="text-left px-3 py-2.5 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Strategy Hint</span>
                  </th>
                  <th className="text-left px-3 py-2.5 w-[80px]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Price</span>
                  </th>
                  <th className="px-3 py-2.5 w-[60px]" />
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-gray-400 text-sm">
                      No tickers match your filters.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row, idx) => {
                    const cfg = getSignalCfg(row.currentSignal);
                    const isEven = idx % 2 === 0;
                    const hasData = row.hasIntradayScan;

                    return (
                      <tr
                        key={row.ticker}
                        onClick={() => handleRowClick(row.ticker)}
                        className={`border-b border-gray-200/40 cursor-pointer transition-colors group
                          ${isEven ? "bg-white" : "bg-gray-50/50"}
                          hover:bg-gray-100/80`}
                      >
                        {/* Ticker + Name */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotColor}`} />
                            <div>
                              <div className="font-bold text-gray-900 text-sm tracking-wide num">{row.ticker}</div>
                              <div className="text-[10px] text-gray-400 truncate max-w-[80px]">{row.name}</div>
                            </div>
                          </div>
                        </td>

                        {/* Sector */}
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <span className="text-xs text-gray-500">{row.sector}</span>
                        </td>

                        {/* Signal */}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border ${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor}`}>
                              {cfg.icon}
                              <span>{cfg.shortLabel}</span>
                            </span>
                            {row.signalChanged && row.priorSignal && (
                              <SignalChangeBadge from={row.priorSignal} to={row.currentSignal} />
                            )}
                          </div>
                        </td>

                        {/* PCR value */}
                        <td className="px-3 py-2.5">
                          {hasData ? (
                            <span className={`text-sm font-bold num ${cfg.textColor}`}>
                              {parseFloat(row.currentPCR ?? "0").toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>

                        {/* PCR Delta */}
                        <td className="px-3 py-2.5">
                          <DeltaChip delta={row.pcrDeltaVsPrior} />
                        </td>

                        {/* OI Split bar */}
                        <td className="px-3 py-2.5 hidden xl:table-cell">
                          <OIBar putOI={row.priorPutOI} callOI={row.priorCallOI} />
                        </td>

                        {/* 7-day sparkline */}
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <MiniSparkline history={row.pcrHistory} signal={row.currentSignal} />
                        </td>

                        {/* Strategy Hint */}
                        <td className="px-3 py-2.5">
                          {hasData ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-amber-400/80 font-medium cursor-help truncate max-w-[160px] block">
                                  {row.strategyHint}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs bg-gray-100 border-gray-200 text-gray-700">
                                {row.recommendation}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-gray-400 text-xs">Run scan for recommendation</span>
                          )}
                        </td>

                        {/* Closing price */}
                        <td className="px-3 py-2.5">
                          {row.closingPrice ? (
                            <span className="text-xs text-gray-600 num font-medium">
                              ${parseFloat(row.closingPrice).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => handleSaveRec(row, e)}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-amber-400 transition-colors"
                                >
                                  <BookmarkPlus className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Save for backtesting</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRowClick(row.ticker); }}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">View details</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Legend ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200/60 text-[10px] text-gray-400 shrink-0">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Fear = Contrarian Bullish</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />Neutral = Range-bound</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Greed = Contrarian Bearish</span>
          <span className="ml-auto flex items-center gap-1"><Info className="h-3 w-3" />Click any row for fundamentals, technicals &amp; option chain</span>
        </div>

      </div>

      {/* ── Ticker Detail Drawer ──────────────────────────────────────────────── */}
      {selectedTicker && (
        <TickerDetailDrawer
          ticker={selectedTicker}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          rowData={(rows as LandingRow[] | undefined)?.find(r => r.ticker === selectedTicker) ?? null}
        />
      )}
    </TooltipProvider>
  );
}
