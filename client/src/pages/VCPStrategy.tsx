import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, RefreshCw, Search, Filter, Target, ArrowUpDown, Info,
  CheckCircle, XCircle, AlertTriangle, Zap, Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TICKER_UNIVERSE, SECTORS, type TickerInfo } from "../../../shared/tickerUniverse";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type VCPStage = "STAGE_1_BASE" | "STAGE_2_UPTREND" | "VCP_FORMING" | "VCP_PIVOT" | "BREAKOUT" | "EXTENDED" | "STAGE_3_TOP" | "STAGE_4_DECLINE";

// Display stage mapped from raw VCPStage
type DisplayStage = "STRONG_SETUP" | "DEVELOPING" | "EARLY" | "NO_PATTERN";

function toDisplayStage(stage: VCPStage): DisplayStage {
  if (stage === "VCP_PIVOT" || stage === "BREAKOUT") return "STRONG_SETUP";
  if (stage === "VCP_FORMING") return "DEVELOPING";
  if (stage === "STAGE_2_UPTREND") return "EARLY";
  return "NO_PATTERN";
}

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
  fiftyDayMA: number;
  twoHundredDayMA: number;
  recommendation: string;
  optionsPlay: string;
  rationale: string;
  stopLoss: number;
  priceTarget: number;
  hasVCP: boolean;
  priceHistory: { date: string; close: number; volume: number }[];
  error?: string;
}

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<DisplayStage, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  STRONG_SETUP:  { label: "Strong Setup",  color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-300", icon: <Zap className="h-3.5 w-3.5" /> },
  DEVELOPING:    { label: "Developing",    color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-200",    icon: <TrendingUp className="h-3.5 w-3.5" /> },
  EARLY:         { label: "Early Stage",   color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  NO_PATTERN:    { label: "No Pattern",    color: "text-slate-500",   bg: "bg-slate-50",    border: "border-slate-200",   icon: <XCircle className="h-3.5 w-3.5" /> },
};

function StageBadge({ stage }: { stage: VCPStage }) {
  const cfg = STAGE_CONFIG[toDisplayStage(stage)];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 7 ? "#10b981" : score >= 5 ? "#3b82f6" : score >= 3 ? "#f59e0b" : "#94a3b8";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${(score / 9) * 100}%`, background: color }} />
      </div>
      <span className="text-xs font-bold num w-8 text-right" style={{ color }}>{score}/9</span>
    </div>
  );
}

function PullbackChain({ pullbacks }: { pullbacks: number[] }) {
  if (!pullbacks.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {pullbacks.map((p, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <span className={`text-xs font-semibold num px-1.5 py-0.5 rounded ${
            i === pullbacks.length - 1 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}>{p.toFixed(1)}%</span>
          {i < pullbacks.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
        </span>
      ))}
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok
        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        : <XCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

// ─── VCP Row Card ─────────────────────────────────────────────────────────────
function VCPRow({ item, tickerInfo }: { item: VCPBatchItem; tickerInfo?: TickerInfo }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STAGE_CONFIG[toDisplayStage(item.stage)];
  const nearPivot = item.distanceToPivot <= 3;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} transition-all`}>
      <button
        className="w-full text-left p-3 flex items-center gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Ticker */}
        <div className="w-16 shrink-0">
          <span className="font-bold text-sm text-foreground">{item.ticker}</span>
          {tickerInfo && <p className="text-[10px] text-muted-foreground truncate">{tickerInfo.sector}</p>}
        </div>

        {/* Score bar */}
        <div className="w-28 shrink-0">
          <ScoreBar score={item.vcpScore} />
        </div>

        {/* Stage */}
        <div className="w-28 shrink-0">
          <StageBadge stage={item.stage} />
        </div>

        {/* Contractions */}
        <div className="flex-1 min-w-0 hidden md:block">
          <PullbackChain pullbacks={item.contractions.map((c: { depth: number }) => c.depth)} />
        </div>

        {/* Distance to pivot */}
        <div className="w-24 shrink-0 text-right hidden lg:block">
          {item.pivotLevel > 0 && (
            <span className={`text-xs font-semibold num ${nearPivot ? "text-emerald-700" : "text-muted-foreground"}`}>
              {nearPivot && <Target className="h-3 w-3 inline mr-0.5" />}
              {item.distanceToPivot.toFixed(1)}% to pivot
            </span>
          )}
        </div>

        <div className="w-4 shrink-0 text-muted-foreground text-xs">{expanded ? "▲" : "▼"}</div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-current/10 mt-1 pt-3 space-y-3">
          {/* Price metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Current Price</p>
              <p className="text-base font-bold num">${item.currentPrice.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pivot Level</p>
              <p className={`text-base font-bold num ${nearPivot ? "text-emerald-700" : ""}`}>
                {item.pivotLevel > 0 ? `$${item.pivotLevel.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stop Loss</p>
              <p className="text-base font-bold num text-red-600">${item.stopLoss.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Target</p>
              <p className="text-base font-bold num text-emerald-700">${item.priceTarget.toFixed(2)}</p>
            </div>
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            <CheckItem ok={item.priorUptrend >= 20} label={`Prior uptrend ${item.priorUptrend.toFixed(0)}% (need ≥20%)`} />
            <CheckItem ok={item.contractions.length >= 2} label={`${item.contractions.length} contractions (need ≥2)`} />
            <CheckItem ok={item.volumeContraction} label="Volume contracting in base" />
            <CheckItem ok={item.recentVolumeDry} label="Recent volume dry-up" />
            <CheckItem ok={item.aboveKeyMAs} label="Above 50-day & 200-day MA" />
            <CheckItem ok={item.distanceToPivot <= 5} label="Within 5% of pivot" />
          </div>

          {/* Pullback chain */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pullback Contractions</p>
            <PullbackChain pullbacks={item.contractions.map(c => c.depth)} />
          </div>

          {/* Options play */}
          <div className="rounded-md bg-white/60 border border-current/10 p-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">Options Play</p>
            <p className="text-xs text-blue-700 font-medium">{item.optionsPlay}</p>
            <p className="text-xs text-muted-foreground">{item.recommendation}</p>
          </div>

          {/* Rationale */}
          <p className="text-xs text-muted-foreground italic">{item.rationale}</p>

          {/* Mini sparkline chart */}
          {item.priceHistory && item.priceHistory.length > 10 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">60-Day Price Chart</p>
              <div className="rounded-md bg-white/60 border border-current/10 p-2">
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={item.priceHistory.slice(-60)} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => v.slice(5)}
                      interval={Math.floor(item.priceHistory.slice(-60).length / 5)}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]}
                      labelFormatter={(l: string) => l}
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    {item.pivotLevel > 0 && (
                      <ReferenceLine
                        y={item.pivotLevel}
                        stroke="#10b981"
                        strokeDasharray="4 2"
                        strokeWidth={1.5}
                        label={{ value: `Pivot $${item.pivotLevel.toFixed(2)}`, position: "insideTopRight", fontSize: 9, fill: "#10b981" }}
                      />
                    )}
                    {item.fiftyDayMA > 0 && (
                      <ReferenceLine
                        y={item.fiftyDayMA}
                        stroke="#f59e0b"
                        strokeDasharray="3 2"
                        strokeWidth={1}
                        label={{ value: "50d", position: "insideTopLeft", fontSize: 8, fill: "#f59e0b" }}
                      />
                    )}
                    {item.twoHundredDayMA > 0 && (
                      <ReferenceLine
                        y={item.twoHundredDayMA}
                        stroke="#ef4444"
                        strokeDasharray="3 2"
                        strokeWidth={1}
                        label={{ value: "200d", position: "insideBottomLeft", fontSize: 8, fill: "#ef4444" }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1 justify-center text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-blue-500 rounded"></span>Price</span>
                  {item.pivotLevel > 0 && <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-emerald-500 rounded" style={{ borderTop: "1.5px dashed #10b981", background: "none" }}></span>Pivot</span>}
                  {item.fiftyDayMA > 0 && <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-amber-400 rounded"></span>50d MA</span>}
                  {item.twoHundredDayMA > 0 && <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-red-500 rounded"></span>200d MA</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── VCP Explainer Video Section ────────────────────────────────────────────
const VCP_YT_ID = "MCxRAOXzUF4";
function VCPHowToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const handleOpenChange = (v: boolean) => { if (!v) setPlaying(false); onClose(); };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            How to Use the VCP Strategy
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5">
          <div
            className="relative w-full rounded-lg overflow-hidden bg-slate-900 cursor-pointer"
            style={{ aspectRatio: "16/9" }}
            onClick={() => !playing && setPlaying(true)}
          >
            {playing ? (
              <iframe
                src={`https://www.youtube.com/embed/${VCP_YT_ID}?autoplay=1&rel=0`}
                title="PitDesk: How to Use the VCP Strategy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : (
              <>
                <img
                  src={`https://img.youtube.com/vi/${VCP_YT_ID}/maxresdefault.jpg`}
                  alt="VCP Strategy How-To thumbnail"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${VCP_YT_ID}/hqdefault.jpg`; }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-600/90 text-white shadow-lg hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 ml-1" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded font-medium">2:34</div>
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Stage 1: Accumulation", hint: "Base building, low volume", color: "text-slate-700 bg-slate-50 border-slate-200" },
              { label: "Stage 2: Uptrend", hint: "VCP forms here — buy zone", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
              { label: "Pivot Breakout", hint: "Buy ATM call, 30–45 DTE", color: "text-blue-700 bg-blue-50 border-blue-200" },
              { label: "Stop Loss", hint: "Close below pivot level", color: "text-red-700 bg-red-50 border-red-200" },
            ].map(item => (
              <div key={item.label} className={`rounded border p-2 ${item.color}`}>
                <p className="font-semibold leading-tight">{item.label}</p>
                <p className="mt-0.5 opacity-80">{item.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VCPExplainerSection() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardContent className="pt-4 pb-3">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 text-left group hover:opacity-90 transition-opacity"
        >
          {/* YouTube thumbnail preview */}
          <div className="relative shrink-0 w-24 h-14 rounded-md overflow-hidden border border-emerald-200 shadow-sm">
            <img
              src={`https://img.youtube.com/vi/${VCP_YT_ID}/hqdefault.jpg`}
              alt="VCP Strategy explainer thumbnail"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-600/90 text-white">
                <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">How VCP Strategy Works</p>
            <p className="text-xs text-emerald-700">Watch a 2m 34s explainer — Minervini VCP pattern, 9-point score, and breakout options plays</p>
          </div>
          <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4l4 4-4 4"/></svg>
        </button>
        <VCPHowToModal open={open} onClose={() => setOpen(false)} />
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VCPStrategy() {
  const [sector, setSector] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "distance" | "ticker">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [stageFilter, setStageFilter] = useState<DisplayStage | "ALL">("ALL");

  const tickers = useMemo(() => {
    let list = TICKER_UNIVERSE;
    if (sector !== "ALL") list = list.filter(t => t.sector === sector);
    return list.map(t => t.symbol);
  }, [sector]);

  const { data, isLoading, refetch, isFetching } = trpc.vcp.batch.useQuery(
    { tickers },
    { staleTime: 10 * 60 * 1000 }
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.filter((d: VCPBatchItem) => !d.error);
    if (search) {
      const q = search.toUpperCase();
      items = items.filter((d: VCPBatchItem) => d.ticker.includes(q));
    }
    if (stageFilter !== "ALL") {
      items = items.filter((d: VCPBatchItem) => toDisplayStage(d.stage) === stageFilter);
    }
    items = [...items].sort((a: VCPBatchItem, b: VCPBatchItem) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortBy === "score") { va = a.vcpScore; vb = b.vcpScore; }
      else if (sortBy === "distance") { va = a.distanceToPivot; vb = b.distanceToPivot; }
      else { va = a.ticker; vb = b.ticker; }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return items;
  }, [data, search, sortBy, sortDir, stageFilter]);

  // Summary
  const summary = useMemo(() => {
    if (!data) return null;
    const items = data.filter((d: VCPBatchItem) => !d.error);
    const counts: Record<DisplayStage, number> = { STRONG_SETUP: 0, DEVELOPING: 0, EARLY: 0, NO_PATTERN: 0 };
    items.forEach((d: VCPBatchItem) => { counts[toDisplayStage(d.stage)]++; });
    const nearPivot = items.filter((d: VCPBatchItem) => d.distanceToPivot <= 3 && toDisplayStage(d.stage) !== "NO_PATTERN").length;
    return { counts, nearPivot, total: items.length };
  }, [data]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VCP Strategy Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Volatility Contraction Pattern detection across 66 tickers — Minervini breakout methodology
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* VCP Explainer Video */}
      <VCPExplainerSection />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["STRONG_SETUP", "DEVELOPING", "EARLY", "NO_PATTERN"] as DisplayStage[]).map(stage => {
            const cfg = STAGE_CONFIG[stage];
            return (
              <Card key={stage} className={`border ${cfg.border} ${cfg.bg} cursor-pointer transition-all`}
                onClick={() => setStageFilter("ALL")}>
                <CardContent className="pt-3 pb-3 text-center">
                  <div className={`flex items-center justify-center gap-1 ${cfg.color} mb-1`}>
                    {cfg.icon}
                    <span className="text-xs font-semibold">{cfg.label}</span>
                  </div>
                  <p className={`text-2xl font-bold num ${cfg.color}`}>{summary.counts[stage]}</p>
                  <p className="text-[10px] text-muted-foreground">tickers</p>
                </CardContent>
              </Card>
            );
          })}
          <Card className="border-emerald-300 bg-emerald-50 cursor-pointer" onClick={() => { setSortBy("distance"); setSortDir("asc"); setStageFilter("ALL"); }}>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-700 mb-1">
                <Target className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Near Pivot</span>
              </div>
              <p className="text-2xl font-bold num text-emerald-700">{summary.nearPivot}</p>
              <p className="text-[10px] text-muted-foreground">within 3%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sector preset quick-filters */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "All",           code: "ALL" },
          { label: "Quantum & AI",  code: "QMAI" },
          { label: "Semiconductors",code: "SEMI" },
          { label: "Technology",    code: "TECH" },
          { label: "Emerging Tech", code: "EMRG" },
          { label: "Financials",    code: "FIN" },
        ].map(preset => {
          const activeSector = TICKER_UNIVERSE.find(t => t.sectorCode === preset.code)?.sector ?? "ALL";
          const isActive = preset.code === "ALL" ? sector === "ALL" : sector === activeSector;
          return (
            <button
              key={preset.code}
              onClick={() => setSector(preset.code === "ALL" ? "ALL" : activeSector)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-transparent text-muted-foreground border-border hover:border-blue-400 hover:text-blue-700"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search ticker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 w-36 text-sm"
          />
        </div>
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sectors</SelectItem>
            {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleSort("score")}>
          <ArrowUpDown className="h-3.5 w-3.5 mr-1" />Score {sortBy === "score" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleSort("distance")}>
          <ArrowUpDown className="h-3.5 w-3.5 mr-1" />Distance {sortBy === "distance" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </Button>
        {stageFilter !== "ALL" && (
          <Button variant="outline" size="sm" className="h-8 text-xs text-blue-700 border-blue-300" onClick={() => setStageFilter("ALL")}>
            ✕ Clear stage filter
          </Button>
        )}
        {/* Copy Watchlist */}
        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs ml-auto"
            onClick={() => {
              const tickers = filtered.map((item: VCPBatchItem) => item.ticker).join(", ");
              navigator.clipboard.writeText(tickers).then(() =>
                toast.success(`Copied ${filtered.length} tickers to clipboard`)
              );
            }}
          >
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="2" width="9" height="11" rx="1.5" />
              <path d="M3 4H2a1 1 0 00-1 1v9a1 1 0 001 1h8a1 1 0 001-1v-1" />
            </svg>
            Copy {filtered.length} tickers
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tickers match your filters.</p>
          ) : (
            filtered.map((item: VCPBatchItem) => (
              <VCPRow
                key={item.ticker}
                item={item}
                tickerInfo={TICKER_UNIVERSE.find(t => t.symbol === item.ticker)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
