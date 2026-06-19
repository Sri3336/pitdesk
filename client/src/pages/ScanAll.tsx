import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap,
  Target, ArrowRight, Activity, Waves, Cpu, Database, Search, Download,
} from "lucide-react";
import { TICKER_UNIVERSE } from "../../../shared/tickerUniverse";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
type PCRSignal = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

interface PCRBatchItem {
  ticker: string;
  pcr: number;
  signal: PCRSignal;
  strategyHint: string;
  recommendation: string;
  totalCallVolume: number;
  totalPutVolume: number;
  error?: string;
}

type VCPStage = "STAGE_1_BASE" | "STAGE_2_UPTREND" | "VCP_FORMING" | "VCP_PIVOT" | "BREAKOUT" | "EXTENDED" | "STAGE_3_TOP" | "STAGE_4_DECLINE";

interface VCPBatchItem {
  ticker: string;
  vcpScore: number;
  stage: VCPStage;
  contractions: Array<{ index: number; startPrice: number; endPrice: number; depth: number; durationDays: number }>;
  pivotLevel: number;
  currentPrice: number;
  distanceToPivot: number;
  priorUptrend: number;
  volumeContraction: boolean;
  recentVolumeDry: boolean;
  aboveKeyMAs: boolean;
  recommendation: string;
  optionsPlay: string;
  rationale: string;
  stopLoss: number;
  priceTarget: number;
  hasVCP: boolean;
  error?: string;
}

// ─── PCR signal config ────────────────────────────────────────────────────────
const PCR_CONFIG: Record<PCRSignal, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; short: string }> = {
  EXTREME_FEAR:  { label: "Extreme Fear",  color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-300", icon: <TrendingUp className="h-3.5 w-3.5" />, short: "EF" },
  FEAR:          { label: "Fear",          color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-200",    icon: <TrendingUp className="h-3.5 w-3.5" />, short: "F" },
  NEUTRAL:       { label: "Neutral",       color: "text-slate-600",   bg: "bg-slate-50",    border: "border-slate-200",   icon: <Minus className="h-3.5 w-3.5" />, short: "N" },
  GREED:         { label: "Greed",         color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   icon: <TrendingDown className="h-3.5 w-3.5" />, short: "G" },
  EXTREME_GREED: { label: "Extreme Greed", color: "text-red-700",     bg: "bg-red-50",      border: "border-red-300",     icon: <AlertTriangle className="h-3.5 w-3.5" />, short: "EG" },
};

// ─── VCP display stage ────────────────────────────────────────────────────────
function toDisplayStage(stage: VCPStage): "STRONG_SETUP" | "DEVELOPING" | "EARLY" | "NO_PATTERN" {
  if (stage === "VCP_PIVOT" || stage === "BREAKOUT") return "STRONG_SETUP";
  if (stage === "VCP_FORMING") return "DEVELOPING";
  if (stage === "STAGE_2_UPTREND") return "EARLY";
  return "NO_PATTERN";
}

const VCP_STAGE_CONFIG = {
  STRONG_SETUP: { label: "Strong Setup",  color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-300", icon: <Zap className="h-3.5 w-3.5" /> },
  DEVELOPING:   { label: "Developing",    color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-200",    icon: <TrendingUp className="h-3.5 w-3.5" /> },
  EARLY:        { label: "Early Stage",   color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  NO_PATTERN:   { label: "No Pattern",    color: "text-slate-500",   bg: "bg-slate-50",    border: "border-slate-200",   icon: <Minus className="h-3.5 w-3.5" /> },
};

// ─── PCR Card ─────────────────────────────────────────────────────────────────
function PCRCard({ item, onAnalyze }: { item: PCRBatchItem; onAnalyze: (ticker: string) => void }) {
  const cfg = PCR_CONFIG[item.signal];
  const tickerInfo = TICKER_UNIVERSE.find(t => t.symbol === item.ticker);
  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-bold text-sm text-foreground">{item.ticker}</span>
          {tickerInfo && <p className="text-[10px] text-muted-foreground">{tickerInfo.sector}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {cfg.icon}{cfg.label}
          </span>
          <button
            onClick={() => onAnalyze(item.ticker)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors"
            title="Open in Analyzer"
          >
            <Search className="h-3 w-3" />Analyze
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">PCR <span className="font-bold num text-foreground">{item.pcr.toFixed(2)}</span></span>
        <span className="text-muted-foreground">P vol <span className="font-semibold num text-foreground">{(item.totalPutVolume / 1000).toFixed(0)}k</span></span>
        <span className="text-muted-foreground">C vol <span className="font-semibold num text-foreground">{(item.totalCallVolume / 1000).toFixed(0)}k</span></span>
      </div>
      <p className="text-xs text-blue-700 font-medium">{item.strategyHint}</p>
      <p className="text-[10px] text-muted-foreground line-clamp-2">{item.recommendation}</p>
    </div>
  );
}

// ─── VCP Card ─────────────────────────────────────────────────────────────────
function VCPCard({ item, onAnalyze }: { item: VCPBatchItem; onAnalyze: (ticker: string) => void }) {
  const ds = toDisplayStage(item.stage);
  const cfg = VCP_STAGE_CONFIG[ds];
  const tickerInfo = TICKER_UNIVERSE.find(t => t.symbol === item.ticker);
  const nearPivot = item.distanceToPivot <= 3;
  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-bold text-sm text-foreground">{item.ticker}</span>
          {tickerInfo && <p className="text-[10px] text-muted-foreground">{tickerInfo.sector}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {cfg.icon}{cfg.label}
          </span>
          <button
            onClick={() => onAnalyze(item.ticker)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors"
            title="Open in Analyzer"
          >
            <Search className="h-3 w-3" />Analyze
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">Score <span className="font-bold num text-foreground">{item.vcpScore}/9</span></span>
        <span className={`font-semibold num ${nearPivot ? "text-emerald-700" : "text-muted-foreground"}`}>
          {nearPivot && <Target className="h-3 w-3 inline mr-0.5" />}
          {item.distanceToPivot.toFixed(1)}% to pivot
        </span>
        <span className="text-muted-foreground">{item.contractions.length} contractions</span>
      </div>
      <p className="text-xs text-blue-700 font-medium">{item.optionsPlay}</p>
      <p className="text-[10px] text-muted-foreground line-clamp-2">{item.rationale}</p>
    </div>
  );
}

// ─── Sector Heatmap ───────────────────────────────────────────────────────────
const SIGNAL_SCORE: Record<PCRSignal, number> = {
  EXTREME_FEAR: -2, FEAR: -1, NEUTRAL: 0, GREED: 1, EXTREME_GREED: 2,
};

function SectorHeatmap({ pcrData, vcpData }: { pcrData: PCRBatchItem[] | undefined; vcpData: VCPBatchItem[] | undefined }) {
  const sectors = useMemo(() => {
    const sectorMap = new Map<string, { pcrScores: number[]; vcpScores: number[]; tickers: string[] }>();
    TICKER_UNIVERSE.forEach(t => {
      if (!sectorMap.has(t.sector)) sectorMap.set(t.sector, { pcrScores: [], vcpScores: [], tickers: [] });
      sectorMap.get(t.sector)!.tickers.push(t.symbol);
    });
    if (pcrData) {
      pcrData.filter(d => !d.error).forEach(d => {
        const info = TICKER_UNIVERSE.find(t => t.symbol === d.ticker);
        if (info && sectorMap.has(info.sector)) {
          sectorMap.get(info.sector)!.pcrScores.push(SIGNAL_SCORE[d.signal]);
        }
      });
    }
    if (vcpData) {
      vcpData.filter(d => !d.error).forEach(d => {
        const info = TICKER_UNIVERSE.find(t => t.symbol === d.ticker);
        if (info && sectorMap.has(info.sector)) {
          sectorMap.get(info.sector)!.vcpScores.push(d.vcpScore);
        }
      });
    }
    return Array.from(sectorMap.entries()).map(([sector, data]) => {
      const avgPcr = data.pcrScores.length ? data.pcrScores.reduce((a, b) => a + b, 0) / data.pcrScores.length : 0;
      const avgVcp = data.vcpScores.length ? data.vcpScores.reduce((a, b) => a + b, 0) / data.vcpScores.length : 0;
      const pcrSignal: PCRSignal = avgPcr <= -1.5 ? "EXTREME_FEAR" : avgPcr <= -0.5 ? "FEAR" : avgPcr >= 1.5 ? "EXTREME_GREED" : avgPcr >= 0.5 ? "GREED" : "NEUTRAL";
      return { sector, avgPcr, avgVcp, pcrSignal, tickerCount: data.tickers.length };
    }).sort((a, b) => a.avgPcr - b.avgPcr);
  }, [pcrData, vcpData]);

  if (!pcrData && !vcpData) {
    return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
      {sectors.map(({ sector, avgPcr, avgVcp, pcrSignal, tickerCount }) => {
        const cfg = PCR_CONFIG[pcrSignal];
        const barWidth = Math.min(100, (avgVcp / 9) * 100);
        const barColor = avgVcp >= 6 ? "bg-emerald-500" : avgVcp >= 3 ? "bg-blue-400" : "bg-slate-300";
        return (
          <div key={sector} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-2.5 space-y-1.5`}>
            <p className="text-[10px] font-semibold text-foreground leading-tight truncate" title={sector}>{sector}</p>
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.short}</span>
              <span className="text-[10px] text-muted-foreground num">{avgPcr >= 0 ? "+" : ""}{avgPcr.toFixed(1)}</span>
            </div>
            <div className="space-y-0.5">
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground">VCP avg {avgVcp.toFixed(1)}/9 &middot; {tickerCount} tickers</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ─── Skeleton grid ────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex justify-between"><Skeleton className="h-4 w-16" /><Skeleton className="h-5 w-24 rounded-full" /></div>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ScanAll() {
  const [, setLocation] = useLocation();
  const allTickers = TICKER_UNIVERSE.map(t => t.symbol);

  const { data: pcrData, isLoading: pcrLoading, refetch: refetchPcr, isFetching: pcrFetching } =
    trpc.pcr.getBatch.useQuery({ tickers: allTickers }, { staleTime: 10 * 60 * 1000 });

  const { data: vcpData, isLoading: vcpLoading, refetch: refetchVcp, isFetching: vcpFetching } =
    trpc.vcp.batch.useQuery({ tickers: allTickers }, { staleTime: 10 * 60 * 1000 });

  const isFetching = pcrFetching || vcpFetching;
  const isLoading = pcrLoading || vcpLoading;

  // Top 5 PCR: actionable signals (Extreme Fear / Extreme Greed first, then Fear/Greed)
  const topPCR = useMemo(() => {
    if (!pcrData) return [];
    const items = (pcrData as PCRBatchItem[]).filter(d => !d.error && d.signal !== "NEUTRAL");
    items.sort((a, b) => {
      const rank: Record<PCRSignal, number> = { EXTREME_FEAR: 0, EXTREME_GREED: 1, FEAR: 2, GREED: 3, NEUTRAL: 4 };
      return rank[a.signal] - rank[b.signal];
    });
    return items.slice(0, 5);
  }, [pcrData]);

  // Top 5 VCP: highest score, non-NO_PATTERN
  const topVCP = useMemo(() => {
    if (!vcpData) return [];
    const items = (vcpData as VCPBatchItem[]).filter(d => !d.error && toDisplayStage(d.stage) !== "NO_PATTERN");
    items.sort((a, b) => b.vcpScore - a.vcpScore);
    return items.slice(0, 5);
  }, [vcpData]);

  // Summary counts
  const pcrSummary = useMemo(() => {
    if (!pcrData) return null;
    const items = (pcrData as PCRBatchItem[]).filter(d => !d.error);
    const counts: Record<PCRSignal, number> = { EXTREME_FEAR: 0, FEAR: 0, NEUTRAL: 0, GREED: 0, EXTREME_GREED: 0 };
    items.forEach(d => { counts[d.signal]++; });
    return { counts, total: items.length };
  }, [pcrData]);

  const vcpSummary = useMemo(() => {
    if (!vcpData) return null;
    const items = (vcpData as VCPBatchItem[]).filter(d => !d.error);
    const strong = items.filter(d => toDisplayStage(d.stage) === "STRONG_SETUP").length;
    const developing = items.filter(d => toDisplayStage(d.stage) === "DEVELOPING").length;
    const nearPivot = items.filter(d => d.distanceToPivot <= 3 && toDisplayStage(d.stage) !== "NO_PATTERN").length;
    return { strong, developing, nearPivot, total: items.length };
  }, [vcpData]);

  // Quantum & AI sector signals
  const qmaiSummary = useMemo(() => {
    const qmaiTickers = TICKER_UNIVERSE.filter(t => t.sectorCode === "QMAI").map(t => t.symbol);
    const pcrItems = (pcrData as PCRBatchItem[] | undefined)?.filter(d => qmaiTickers.includes(d.ticker) && !d.error) ?? [];
    const vcpItems = (vcpData as VCPBatchItem[] | undefined)?.filter(d => qmaiTickers.includes(d.ticker) && !d.error) ?? [];
    const topPcrSignal = pcrItems.find(d => d.signal === "EXTREME_FEAR" || d.signal === "EXTREME_GREED") ??
                         pcrItems.find(d => d.signal === "FEAR" || d.signal === "GREED");
    const topVcpSetup = vcpItems.filter(d => toDisplayStage(d.stage) !== "NO_PATTERN").sort((a, b) => b.vcpScore - a.vcpScore)[0];
    const actionable = pcrItems.filter(d => d.signal !== "NEUTRAL").length;
    return { topPcrSignal, topVcpSetup, actionable, total: qmaiTickers.length };
  }, [pcrData, vcpData]);

  const { data: snapshotDaysData } = trpc.pcrScheduled.countSnapshotDays.useQuery(undefined, { staleTime: 60 * 60 * 1000 });
  const snapshotDays = snapshotDaysData?.days ?? 0;

  const handleRefresh = () => { refetchPcr(); refetchVcp(); };

  // Navigate to Analyzer page pre-filled with a ticker
  const handleAnalyze = (ticker: string) => {
    setLocation(`/analyzer?ticker=${encodeURIComponent(ticker)}`);
  };

  // CSV export of actionable signals (PCR ≠ Neutral + VCP score ≥ 5)
  const handleExportCSV = () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows: string[] = ["Ticker,Sector,PCR Signal,PCR Value,VCP Score,VCP Stage,Distance to Pivot,Options Play"];
    const pcrItems = (pcrData as PCRBatchItem[] | undefined) ?? [];
    const vcpItems = (vcpData as VCPBatchItem[] | undefined) ?? [];
    const actionableTickers = new Set<string>();
    pcrItems.filter(d => !d.error && d.signal !== "NEUTRAL").forEach(d => actionableTickers.add(d.ticker));
    vcpItems.filter(d => !d.error && d.vcpScore >= 5).forEach(d => actionableTickers.add(d.ticker));
    actionableTickers.forEach(ticker => {
      const pcr = pcrItems.find(d => d.ticker === ticker);
      const vcp = vcpItems.find(d => d.ticker === ticker);
      const info = TICKER_UNIVERSE.find(t => t.symbol === ticker);
      const pcrSignal = pcr ? PCR_CONFIG[pcr.signal].label : "N/A";
      const pcrVal = pcr ? pcr.pcr.toFixed(2) : "N/A";
      const vcpScore = vcp ? `${vcp.vcpScore}/9` : "N/A";
      const vcpStage = vcp ? toDisplayStage(vcp.stage) : "N/A";
      const dist = vcp ? `${vcp.distanceToPivot.toFixed(1)}%` : "N/A";
      const play = vcp?.optionsPlay ?? pcr?.strategyHint ?? "N/A";
      rows.push(`${ticker},"${info?.sector ?? ""}","${pcrSignal}",${pcrVal},${vcpScore},${vcpStage},${dist},"${play}"`);
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watchlist_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scan All — Daily Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Top 5 PCR signals and top 5 VCP setups across the 66-ticker universe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isLoading}>
            <Download className="h-4 w-4 mr-2" />
            Export Watchlist
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh All
          </Button>
        </div>
      </div>

      {/* Days with data banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
        snapshotDays === 0
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : snapshotDays === 1
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}>
        <Database className="h-3.5 w-3.5 shrink-0" />
        {snapshotDays === 0 ? (
          <span><strong>No EOD snapshots yet.</strong> Run the EOD snapshot from the PCR Strategy → 11:30 AM Scan tab to enable COI delta calculations. COI requires at least 1 prior baseline.</span>
        ) : snapshotDays === 1 ? (
          <span><strong>1 day of EOD data.</strong> COI delta is available for today’s scan. Accumulate more days for trend analysis.</span>
        ) : (
          <span><strong>{snapshotDays} days of EOD data</strong> in the database. COI calculations have a solid baseline for all {snapshotDays} trading days. Last updated: <strong>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong></span>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mb-1">PCR Extreme Fear</p>
            <p className="text-2xl font-bold num text-emerald-700">
              {pcrSummary ? pcrSummary.counts.EXTREME_FEAR : <Skeleton className="h-7 w-8 mx-auto" />}
            </p>
            <p className="text-[10px] text-muted-foreground">contrarian bull signals</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-red-600 font-semibold mb-1">PCR Extreme Greed</p>
            <p className="text-2xl font-bold num text-red-700">
              {pcrSummary ? pcrSummary.counts.EXTREME_GREED : <Skeleton className="h-7 w-8 mx-auto" />}
            </p>
            <p className="text-[10px] text-muted-foreground">contrarian bear signals</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mb-1">VCP Strong Setups</p>
            <p className="text-2xl font-bold num text-emerald-700">
              {vcpSummary ? vcpSummary.strong : <Skeleton className="h-7 w-8 mx-auto" />}
            </p>
            <p className="text-[10px] text-muted-foreground">pivot/breakout stage</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold mb-1">Near Pivot (&lt;3%)</p>
            <p className="text-2xl font-bold num text-blue-700">
              {vcpSummary ? vcpSummary.nearPivot : <Skeleton className="h-7 w-8 mx-auto" />}
            </p>
            <p className="text-[10px] text-muted-foreground">ready to break out</p>
          </CardContent>
        </Card>
        {/* Quantum & AI card */}
        <Card className="border-violet-200 bg-violet-50 col-span-2 md:col-span-1">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="h-3.5 w-3.5 text-violet-600" />
              <p className="text-[10px] uppercase tracking-wide text-violet-600 font-semibold">Quantum &amp; AI</p>
            </div>
            {!pcrData && !vcpData ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Actionable signals</span>
                  <span className="text-sm font-bold num text-violet-700">{qmaiSummary.actionable}/{qmaiSummary.total}</span>
                </div>
                {qmaiSummary.topPcrSignal && (
                  <p className="text-[10px] text-violet-700 font-medium truncate">
                    PCR: {qmaiSummary.topPcrSignal.ticker} — {PCR_CONFIG[qmaiSummary.topPcrSignal.signal].label}
                  </p>
                )}
                {qmaiSummary.topVcpSetup && (
                  <p className="text-[10px] text-emerald-700 font-medium truncate">
                    VCP: {qmaiSummary.topVcpSetup.ticker} — score {qmaiSummary.topVcpSetup.vcpScore}/9
                  </p>
                )}
                {!qmaiSummary.topPcrSignal && !qmaiSummary.topVcpSetup && (
                  <p className="text-[10px] text-muted-foreground">No active signals</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PCR Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold">Top PCR Signals</h2>
              <Badge variant="secondary" className="text-xs">Put/Call Ratio</Badge>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setLocation("/pcr-strategy")}>
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Extreme Fear (high PCR) = contrarian bullish. Extreme Greed (low PCR) = contrarian bearish.
          </p>
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
            : topPCR.length > 0
              ? topPCR.map(item => <PCRCard key={item.ticker} item={item} onAnalyze={handleAnalyze} />)
              : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                  No actionable PCR signals right now — all tickers are near neutral.
                </div>
              )
          }
        </div>

        {/* VCP Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">Top VCP Setups</h2>
              <Badge variant="secondary" className="text-xs">Minervini</Badge>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setLocation("/vcp-strategy")}>
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ranked by VCP score (0–9). Strong Setup = pivot or breakout stage. Buy call debit spread on breakout.
          </p>
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
            : topVCP.length > 0
              ? topVCP.map(item => <VCPCard key={item.ticker} item={item} onAnalyze={handleAnalyze} />)
              : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                  No VCP setups detected right now. Check back as patterns develop.
                </div>
              )
          }
        </div>
      </div>

      {/* Sector Heatmap */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold">Sector Heatmap</h2>
          <Badge variant="secondary" className="text-xs">PCR signal + VCP avg score</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Color = average PCR sentiment across all tickers in the sector. Bar = average VCP score (0–9). Most fearful sectors listed first.
        </p>
        <SectorHeatmap pcrData={pcrData as PCRBatchItem[] | undefined} vcpData={vcpData as VCPBatchItem[] | undefined} />
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center border-t pt-4">
        Data sourced from Yahoo Finance. PCR is estimated from volume proxy. VCP uses 90-day price history.
        Refresh to get latest market data. Not financial advice.
      </p>
    </div>
  );
}
