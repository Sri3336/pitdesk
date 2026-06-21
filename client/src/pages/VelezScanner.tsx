import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { Okala80_20Panel } from "@/components/Okala80_20Panel";
import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FibLevel {
  level: number;
  price: number;
  label: string;
}

interface EmaConfluence {
  fibLevel: number;
  fibPrice: number;
  emaPeriod: number;
  emaValue: number;
  currentPrice: number;
  fibProximityPct: number;
  emaProximityPct: number;
  isConfluent: boolean;
}

interface DailySignal {
  ticker: string;
  signalDate: string;
  entry: number;
  target25: number;
  target50: number;
  stop: number;
  dropPct: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  swingHigh: number;
  swingLow: number;
  fibRetracements: FibLevel[];
  fibExtensions: FibLevel[];
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  fibEmaConfluences: EmaConfluence[];
  hasConfluence: boolean;
  // Liquidity Sweep
  sweptPDH?: boolean;
  sweptPDL?: boolean;
  prevDayHigh?: number | null;
  prevDayLow?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fibLevelColor(level: number): string {
  if (level === 38.2) return "text-blue-600 bg-blue-50";
  if (level === 50.0) return "text-yellow-600 bg-yellow-50";
  if (level === 61.8) return "text-green-600 bg-green-50";
  if (level === 78.6) return "text-red-600 bg-red-50";
  return "text-gray-600 bg-gray-50";
}

function extLevelColor(level: number): string {
  if (level === 127.2) return "text-blue-700 bg-blue-100";
  if (level === 161.8) return "text-green-700 bg-green-100";
  if (level === 261.8) return "text-purple-700 bg-purple-100";
  return "text-gray-700 bg-gray-100";
}

// ─── Fib Levels Panel ─────────────────────────────────────────────────────────

function FibLevelsPanel({ signal }: { signal: DailySignal }) {
  const [showExt, setShowExt] = useState(false);

  return (
    <div className="space-y-3">
      {/* Retracements */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Retracement Levels
        </div>
        <div className="grid grid-cols-5 gap-1">
          {signal.fibRetracements.map((f) => (
            <div
              key={f.level}
              className={`rounded-md px-2 py-1.5 text-center text-xs font-medium ${fibLevelColor(f.level)}`}
            >
              <div className="font-bold">{f.level}%</div>
              <div className="text-[10px] mt-0.5">{fmt(f.price)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Extensions */}
      <div>
        <button
          onClick={() => setShowExt((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
        >
          {showExt ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Extension Targets
        </button>
        {showExt && (
          <div className="grid grid-cols-3 gap-1">
            {signal.fibExtensions.map((f) => (
              <div
                key={f.level}
                className={`rounded-md px-2 py-1.5 text-center text-xs font-medium ${extLevelColor(f.level)}`}
              >
                <div className="font-bold">{f.level}%</div>
                <div className="text-[10px] mt-0.5">{fmt(f.price)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EMA values */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          EMA Values
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "EMA-9", val: signal.ema9 },
            { label: "EMA-20", val: signal.ema20 },
            { label: "EMA-50", val: signal.ema50 },
            { label: "EMA-200", val: signal.ema200 },
          ].map((e) => (
            <div key={e.label} className="rounded-md px-2 py-1.5 text-center text-xs bg-gray-50 border border-gray-200">
              <div className="font-semibold text-gray-500">{e.label}</div>
              <div className="text-[10px] mt-0.5 text-gray-700">{fmt(e.val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Confluence */}
      {signal.fibEmaConfluences.length > 0 && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3">
          <div className="flex items-center gap-1.5 text-green-700 font-semibold text-xs mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Fib + EMA Confluence Detected
          </div>
          <div className="space-y-1">
            {signal.fibEmaConfluences.map((c, i) => (
              <div key={i} className="text-xs text-green-800">
                {c.fibLevel}% Fib ({fmt(c.fibPrice)}) ↔ EMA-{c.emaPeriod} ({fmt(c.emaValue)}) — within {c.fibProximityPct.toFixed(2)}%
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: DailySignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-border hover:bg-accent/50 cursor-pointer transition-colors ${expanded ? "bg-accent/30" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground">{signal.ticker}</span>
            {/* A+ Sweep Confluence Score: Velez signal + Fib/EMA confluence + PDH/PDL sweep */}
            {signal.hasConfluence && (signal.sweptPDH || signal.sweptPDL) && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge className="text-[10px] px-1.5 py-0 bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 font-bold shadow-sm">
                    ⭐ A+
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">
                  <p className="font-semibold">A+ Sweep Confluence Setup</p>
                  <p className="text-xs mt-0.5">Velez drop signal + Fib/EMA confluence + {signal.sweptPDH ? '↑PDH liquidity sweep' : '↓PDL liquidity sweep'} — highest-conviction setup</p>
                </TooltipContent>
              </Tooltip>
            )}
            {signal.hasConfluence && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-400 text-green-700 bg-green-50">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                    Confluence
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Fib + EMA confluence detected within 1%</TooltipContent>
              </Tooltip>
            )}
            {signal.sweptPDH && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-400 text-purple-700 bg-purple-50">
                    ↑PDH
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Swept Previous Day High ({signal.prevDayHigh != null ? `$${Number(signal.prevDayHigh).toFixed(2)}` : '—'}) — liquidity grab above prior highs</TooltipContent>
              </Tooltip>
            )}
            {signal.sweptPDL && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-400 text-orange-700 bg-orange-50">
                    ↓PDL
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Swept Previous Day Low ({signal.prevDayLow != null ? `$${Number(signal.prevDayLow).toFixed(2)}` : '—'}) — liquidity grab below prior lows</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">{signal.signalDate}</div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="font-semibold text-sm">{fmt(signal.entry)}</div>
          <div className="text-[10px] text-red-500 flex items-center justify-end gap-0.5">
            <TrendingDown className="h-3 w-3" />
            {fmtPct(signal.dropPct)}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="text-xs text-muted-foreground">T25</div>
          <div className="text-sm font-medium text-blue-600">{fmt(signal.target25)}</div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="text-xs text-muted-foreground">T50</div>
          <div className="text-sm font-medium text-green-600">{fmt(signal.target50)}</div>
        </td>
        <td className="px-3 py-2.5 text-right hidden sm:table-cell">
          <div className="text-xs text-muted-foreground">Stop</div>
          <div className="text-sm font-medium text-red-500">{fmt(signal.stop)}</div>
        </td>
        <td className="px-3 py-2.5 text-right hidden md:table-cell">
          <div className="text-xs text-muted-foreground">Vol Ratio</div>
          <div className={`text-sm font-medium ${signal.volumeRatio >= 2 ? "text-orange-500" : "text-foreground"}`}>
            {signal.volumeRatio.toFixed(1)}x
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {/* Fib level badges */}
            {signal.fibRetracements.slice(1, 3).map((f) => (
              <span key={f.level} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${fibLevelColor(f.level)}`}>
                {f.level}%
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <div className="text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4 mx-auto" /> : <ChevronRight className="h-4 w-4 mx-auto" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-accent/20">
          <td colSpan={8} className="px-4 py-4">
            <FibLevelsPanel signal={signal} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── How-To Video Modal ──────────────────────────────────────────────────────
const VELEZ_YT_ID = "6rSI7Ibws_o";
function HowToVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const handleOpenChange = (v: boolean) => { if (!v) setPlaying(false); onClose(); };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-blue-500" />
            How to Use the Velez Scanner
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
                src={`https://www.youtube.com/embed/${VELEZ_YT_ID}?autoplay=1&rel=0`}
                title="PitDesk: How to Use the Velez Scanner"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : (
              <>
                <img
                  src={`https://img.youtube.com/vi/${VELEZ_YT_ID}/maxresdefault.jpg`}
                  alt="Velez Scanner How-To thumbnail"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${VELEZ_YT_ID}/hqdefault.jpg`; }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-600/90 text-white shadow-lg hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 ml-1" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded font-medium">2:55</div>
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">The Method</div>
              <div className="space-y-1 text-muted-foreground">
                <div>Fibonacci retracement + EMA cluster</div>
                <div>Proximity <span className="text-blue-600 font-medium">&lt;1%</span> = sweet spot</div>
                <div>Price bounce = institutional entry</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Two Tabs</div>
              <div className="space-y-1 text-muted-foreground">
                <div><span className="font-medium">Daily</span> — swing trades, 3–10 day holds</div>
                <div><span className="font-medium">Intraday 5-min</span> — same-day entries</div>
                <div>Both scan all 60 PCR tickers</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Trade Plan</div>
              <div className="space-y-1 text-muted-foreground">
                <div>Entry: break above confirming candle</div>
                <div>Stop: below Fibonacci level</div>
                <div>Target: 127% / 161.8% extension</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ORS How-To Modal ───────────────────────────────────────────────────────
function OrsHowToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-green-500" />
            Opening Range Scalper — How-To Guide
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 space-y-4">
          {/* Video placeholder */}
          <div className="relative w-full rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-green-600/20 border-2 border-green-500/40 flex items-center justify-center mx-auto">
                <BookOpen className="h-7 w-7 text-green-400" />
              </div>
              <div className="text-white font-semibold">ORS How-To Video</div>
              <div className="text-slate-400 text-sm">YouTube video coming soon</div>
            </div>
          </div>
          {/* Quick reference */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">The Setup</div>
              <div className="space-y-1 text-muted-foreground">
                <div>First 30-min opening range box</div>
                <div>ATR gate: price move ≥25% daily ATR</div>
                <div>Reversal candle at range boundary</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Entry Rules</div>
              <div className="space-y-1 text-muted-foreground">
                <div>Window: 10:00 AM – 3:00 PM ET</div>
                <div>Hammer / Inv. Hammer / Engulfing</div>
                <div>Entry on break of reversal candle</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Targets</div>
              <div className="space-y-1 text-muted-foreground">
                <div>TP1: opposite side of range</div>
                <div>TP2: 1.5× range extension</div>
                <div>Stop: below/above reversal candle</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PRP How-To Modal ───────────────────────────────────────────────────────
function PrpHowToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-purple-500" />
            Previous Range Pullback — How-To Guide
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 space-y-4">
          {/* Video placeholder */}
          <div className="relative w-full rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-purple-600/20 border-2 border-purple-500/40 flex items-center justify-center mx-auto">
                <BookOpen className="h-7 w-7 text-purple-400" />
              </div>
              <div className="text-white font-semibold">PRP How-To Video</div>
              <div className="text-slate-400 text-sm">YouTube video coming soon — narrated guide uploaded to Google Drive</div>
            </div>
          </div>
          {/* Quick reference */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">The Setup</div>
              <div className="space-y-1 text-muted-foreground">
                <div>ICT/SMC: Break of Structure (BOS)</div>
                <div>Price pulls back to 30/50/70% zone</div>
                <div>EMA-21 alignment confirms direction</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Status Levels</div>
              <div className="space-y-1 text-muted-foreground">
                <div><span className="text-green-600 font-medium">PRIME</span>: in 30–50% zone + EMA</div>
                <div><span className="text-yellow-600 font-medium">IN ZONE</span>: 30–70% retracement</div>
                <div><span className="text-slate-500 font-medium">WATCHING</span>: BOS detected</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Trade Plan</div>
              <div className="space-y-1 text-muted-foreground">
                <div>Entry: bounce from 30/50% level</div>
                <div>Stop: below swing low (BOS origin)</div>
                <div>Target: prior swing high (R:R ≥2:1)</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VelezScanner() {
  const [tab, setTab] = useState<"daily" | "intraday" | "ors" | "prp">(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "ors" || t === "intraday" || t === "daily" || t === "prp") return t;
    }
    return "daily";
  });
  // Sync tab when URL changes (e.g. sidebar navigation to /velez-scanner?tab=prp)
  const [location] = useLocation();
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "ors" || t === "intraday" || t === "daily" || t === "prp") setTab(t);
  }, [location]);

  const [showHowTo, setShowHowTo] = useState(false);
  const [showOrsHowTo, setShowOrsHowTo] = useState(false);
  const [showPrpHowTo, setShowPrpHowTo] = useState(false);
  const [thresholdPct, setThresholdPct] = useState(1.0);
  const [minPrice, setMinPrice] = useState(10);
  const [excludeOtc, setExcludeOtc] = useState(true);
  const [enabled, setEnabled] = useState(false);

  const dailyQuery = trpc.velez.scanDaily.useQuery(
    { thresholdPct, minPrice, excludeOtc },
    { enabled: enabled && tab === "daily", staleTime: 5 * 60 * 1000 }
  );

  const intradayQuery = trpc.velez.scanIntraday.useQuery(
    { thresholdPct, minPrice, excludeOtc },
    { enabled: enabled && tab === "intraday", staleTime: 60 * 1000 }
  );

  const orsQuery = trpc.openingRangeScalper.scan.useQuery(
    {},
    { enabled: enabled && tab === "ors", staleTime: 60 * 1000 }
  );
  const prpQuery = trpc.previousRange.scan.useQuery(
    {},
    { enabled: enabled && tab === "prp", staleTime: 5 * 60 * 1000 }
  );
  const query = tab === "daily" ? dailyQuery : intradayQuery;
  const signals = (query.data as DailySignal[] | undefined) ?? [];

  const handleScan = () => {
    setEnabled(true);
    if (tab === "daily") dailyQuery.refetch();
    else if (tab === "intraday") intradayQuery.refetch();
    else if (tab === "ors") orsQuery.refetch();
    else prpQuery.refetch();
    const label = tab === "ors" ? "Opening Range Scalper" : tab === "prp" ? "Previous Range Pullback" : `${tab} Velez`;
    toast.info(`Running ${label} scan across 60 PCR tickers…`);
  };

  const confluenceCount = signals.filter((s) => s.hasConfluence).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-blue-500" />
            Velez Scanner
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scans 60 PCR tickers for Velez drop signals with Fibonacci overlay and EMA confluence
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs px-3 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => {
              if (tab === "ors") setShowOrsHowTo(true);
              else if (tab === "prp") setShowPrpHowTo(true);
              else setShowHowTo(true);
            }}
          >
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            How-To
          </Button>
          <Button
            onClick={handleScan}
            disabled={query.isFetching}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
          {query.isFetching ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          {query.isFetching ? "Scanning…" : "Run Scan"}
        </Button>
        </div>
      </div>
      <HowToVideoModal open={showHowTo} onClose={() => setShowHowTo(false)} />

      {/* Controls */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-6">
            {/* Confluence threshold */}
            <div className="flex items-center gap-3 min-w-48">
              <label className="text-sm font-medium whitespace-nowrap">
                Confluence Threshold
              </label>
              <div className="flex items-center gap-2 flex-1">
                <Slider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={[thresholdPct]}
                  onValueChange={([v]) => setThresholdPct(v)}
                  className="w-32"
                />
                <span className="text-sm font-semibold text-green-600 w-10">
                  {thresholdPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="w-px h-8 bg-border hidden sm:block" />

            {/* Min price filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Min Price</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value) || 0)}
                  className="w-20 pl-6 h-8 text-sm"
                />
              </div>
            </div>

            <div className="w-px h-8 bg-border hidden sm:block" />

            {/* Exclude OTC toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="exclude-otc"
                checked={excludeOtc}
                onCheckedChange={setExcludeOtc}
              />
              <label htmlFor="exclude-otc" className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                <Shield className="h-3.5 w-3.5 text-blue-500" />
                Exclude OTC / Pink Sheets
              </label>
              {excludeOtc && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 bg-blue-50">
                  Active
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>Confluence = price within threshold % of both a Fib level AND an EMA simultaneously</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats bar */}
      {signals.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-foreground">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="font-semibold">{signals.length}</span>
            <span className="text-muted-foreground">signals found</span>
          </div>
          {confluenceCount > 0 && (
            <div className="flex items-center gap-1.5 text-green-700">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold">{confluenceCount}</span>
              <span>with Fib+EMA confluence</span>
            </div>
          )}
        </div>
      )}

            {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "daily" | "intraday" | "ors" | "prp")}>
        <TabsList>
          <TabsTrigger value="daily">Daily Signals</TabsTrigger>
          <TabsTrigger value="intraday">Intraday 5-min</TabsTrigger>
          <TabsTrigger value="ors" className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Opening Range Scalper
          </TabsTrigger>
          <TabsTrigger value="prp" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Prev Range Pullback
          </TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          <ScannerTable signals={signals} loading={query.isFetching} started={enabled} />
        </TabsContent>
        <TabsContent value="intraday" className="mt-4">
          <ScannerTable signals={signals} loading={query.isFetching} started={enabled} />
        </TabsContent>
        <TabsContent value="ors" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
            <OrsTable results={orsQuery.data ?? []} loading={orsQuery.isFetching} started={enabled && tab === "ors"} />
            <div className="border border-border rounded-xl p-4 bg-card sticky top-4">
              <Okala80_20Panel />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="prp" className="mt-4">
          <PrpTable results={prpQuery.data ?? []} loading={prpQuery.isFetching} started={enabled && tab === "prp"} />
        </TabsContent>
      </Tabs>
      {/* Velez How-To Modal */}
      <HowToVideoModal open={showHowTo} onClose={() => setShowHowTo(false)} />
      {/* ORS How-To Modal */}
      <OrsHowToModal open={showOrsHowTo} onClose={() => setShowOrsHowTo(false)} />
      {/* PRP How-To Modal */}
      <PrpHowToModal open={showPrpHowTo} onClose={() => setShowPrpHowTo(false)} />
    </div>
  );
}

function ScannerTable({
  signals,
  loading,
  started,
}: {
  signals: DailySignal[];
  loading: boolean;
  started: boolean;
}) {
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Zap className="h-8 w-8 text-green-400" />
        <div className="text-sm font-medium">Click "Run Scan" to scan 60 PCR tickers</div>
        <div className="text-xs">Results include Fib retracements, extension targets, and EMA confluence</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-green-500" />
        <div className="text-sm">Scanning 60 tickers and computing Fibonacci levels…</div>
        <div className="text-xs text-muted-foreground">This may take 15–30 seconds</div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <AlertTriangle className="h-8 w-8 text-yellow-400" />
        <div className="text-sm font-medium">No Velez signals found today</div>
        <div className="text-xs">Market may be in a low-volatility phase</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Entry / Drop</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">T25%</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">T50%</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">Stop</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden md:table-cell">Vol</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Fib Levels</th>
              <th className="px-3 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <SignalRow key={s.ticker} signal={s} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
        Click any row to expand Fib retracements, extension targets (127.2%, 161.8%, 261.8%), and EMA values.
        <span className="ml-2 text-green-600 font-medium">Green "Confluence" badge = price within {1}% of both Fib level AND EMA.</span>
      </div>
    </div>
  );
}

// ─── ORS Types ────────────────────────────────────────────────────────────────
interface OrsSignal {
  ticker: string;
  direction: "LONG" | "SHORT" | "NONE";
  boxHigh: number;
  boxLow: number;
  boxSize: number;
  dailyAtr: number;
  atrThreshold: number;
  atrGatePassed: boolean;
  openingCandleBullish: boolean;
  reversalPattern: string;
  reversalCandleHigh: number;
  reversalCandleLow: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  riskReward: number;
  currentPrice: number;
  scannedAt: string;
  withinWindow: boolean;
  status: "SETUP_READY" | "WATCHING" | "NO_GATE" | "NO_SIGNAL" | "WINDOW_CLOSED";
  statusReason: string;
}

// ─── ORS Table Component ──────────────────────────────────────────────────────
function OrsTable({
  results,
  loading,
  started,
}: {
  results: OrsSignal[];
  loading: boolean;
  started: boolean;
}) {
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Target className="h-8 w-8 text-orange-400" />
        <div className="text-sm font-medium">Click "Run Scan" to scan for Opening Range Scalper setups</div>
        <div className="text-xs text-center max-w-sm">
          Scans 60 tickers for first 15-min candle ATR gate, box breakout, and reversal candle pattern (9:30–11:00 AM ET)
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
        <div className="text-sm">Scanning 60 tickers for opening range setups…</div>
        <div className="text-xs text-muted-foreground">Fetching 15-min candles and computing ATR gates</div>
      </div>
    );
  }

  const ready = results.filter((r) => r.status === "SETUP_READY");
  const watching = results.filter((r) => r.status === "WATCHING");
  const noGate = results.filter((r) => r.status === "NO_GATE");

  return (
    <div className="space-y-4">
      {/* Strategy legend */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{ready.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Setup Ready</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-amber-500">{watching.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">ATR Gate Passed — Watching</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-slate-400">{noGate.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">ATR Gate Failed</div>
        </div>
      </div>

      {ready.length === 0 && watching.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border border-dashed border-border rounded-xl">
          <AlertTriangle className="h-6 w-6 text-yellow-400" />
          <div className="text-sm font-medium">No ORS setups found</div>
          <div className="text-xs">Run scan between 9:45–11:00 AM ET for best results</div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Direction</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Entry</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Stop</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">TP1</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">TP2</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">R:R</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Pattern</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...ready, ...watching].map((r) => (
                  <OrsRow key={r.ticker} result={r} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
            ATR Gate: first 15-min candle ≥ 25% of Daily ATR-14. Entry on reversal candle break. TP1 = near box edge, TP2 = far box edge.
          </div>
        </div>
      )}
    </div>
  );
}

function OrsRow({ result: r }: { result: OrsSignal }) {
  const [, navigate] = useLocation();
  const isLong = r.direction === "LONG";
  const isShort = r.direction === "SHORT";
  const isReady = r.status === "SETUP_READY";
  const handleLogTrade = () => {
    const params = new URLSearchParams({
      ticker: r.ticker,
      direction: r.direction === "LONG" ? "long" : "short",
      entry: r.entryPrice > 0 ? r.entryPrice.toFixed(2) : "",
      stop: r.stopLoss > 0 ? r.stopLoss.toFixed(2) : "",
      tp1: r.tp1 > 0 ? r.tp1.toFixed(2) : "",
      tp2: r.tp2 > 0 ? r.tp2.toFixed(2) : "",
      strategy: "Opening Range Scalper",
    });
    navigate(`/trade-log?${params.toString()}`);
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{r.ticker}</span>
          {r.atrGatePassed && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-700 border-green-300">ATR ✓</Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Box: {r.boxLow.toFixed(2)}–{r.boxHigh.toFixed(2)} ({r.boxSize.toFixed(2)})
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        {isReady ? (
          <Badge className={`text-xs ${isLong ? "bg-green-100 text-green-800 border-green-300" : "bg-red-100 text-red-800 border-red-300"}`}>
            {isLong ? (
              <><TrendingUp className="h-3 w-3 mr-1" />LONG</>
            ) : (
              <><TrendingDown className="h-3 w-3 mr-1" />SHORT</>
            )}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        {r.entryPrice > 0 ? `$${r.entryPrice.toFixed(2)}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-red-600">
        {r.stopLoss > 0 ? `$${r.stopLoss.toFixed(2)}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-blue-600">
        {r.tp1 > 0 ? `$${r.tp1.toFixed(2)}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-green-600">
        {r.tp2 > 0 ? `$${r.tp2.toFixed(2)}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right text-xs hidden sm:table-cell">
        {r.riskReward > 0 ? (
          <span className={r.riskReward >= 2 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
            {r.riskReward.toFixed(1)}:1
          </span>
        ) : "—"}
      </td>
      <td className="px-3 py-2.5 text-center">
        {r.reversalPattern !== "NONE" ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {r.reversalPattern.replace(/_/g, " ")}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${
            isReady
              ? "bg-green-50 text-green-700 border-green-300"
              : r.status === "WATCHING"
              ? "bg-amber-50 text-amber-700 border-amber-300"
              : "bg-slate-50 text-slate-500 border-slate-200"
          }`}
        >
          {isReady ? "READY" : r.status === "WATCHING" ? "WATCHING" : "NO GATE"}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-center">
        {isReady && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 border-green-400 text-green-700 hover:bg-green-50"
            onClick={handleLogTrade}
          >
            Log Trade
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─── PRP Types ────────────────────────────────────────────────────────────────
interface PrpSignal {
  ticker: string;
  direction: "BULLISH" | "BEARISH";
  bosLevel: number;
  rangeAnchor: number;
  rangeSize: number;
  currentPrice: number;
  retracementPct: number;
  retracementZone: string;
  level30: number;
  level50: number;
  level70: number;
  target: number;
  stop: number;
  rr: number;
  bosDate: string;
  daysSinceBos: number;
  bosVolumeRatio: number;
  currentVolumeRatio: number;
  ema21: number | null;
  ema21Aligned: boolean;
}

// ─── PRP Table Component ──────────────────────────────────────────────────────
function PrpTable({
  results,
  loading,
  started,
}: {
  results: PrpSignal[];
  loading: boolean;
  started: boolean;
}) {
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <TrendingUp className="h-8 w-8 text-purple-400" />
        <div className="text-sm font-medium">Click "Run Scan" to scan for Previous Range Pullback setups</div>
        <div className="text-xs text-center max-w-sm">
          Detects break of structure + 30/50/70% retracement into prior range using daily OHLC data (ICT/SMC method)
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
        <div className="text-sm">Scanning 60 tickers for break-of-structure + pullback setups…</div>
        <div className="text-xs text-muted-foreground">Fetching daily OHLC and computing swing structure</div>
      </div>
    );
  }

  const prime = results.filter((r) => r.retracementZone !== "NONE" && r.rr >= 2 && r.ema21Aligned);
  const inZone = results.filter((r) => r.retracementZone !== "NONE" && !(r.rr >= 2 && r.ema21Aligned));
  const watching = results.filter((r) => r.retracementZone === "NONE");

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{prime.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Prime Setup (BOS + Zone + 4 Swings)</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-blue-500">{inZone.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">In Pullback Zone</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-slate-400">{watching.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">BOS Detected — Watching</div>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground border border-dashed border-border rounded-xl">
          <AlertTriangle className="h-6 w-6 text-yellow-400" />
          <div className="text-sm font-medium">No PRP setups found</div>
          <div className="text-xs">No break-of-structure events detected across 60 tickers</div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Price</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">BOS High</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">30% Ret</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">50% Ret</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">70% Ret</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground hidden md:table-cell">Swings</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...prime, ...inZone, ...watching].map((r) => (
                  <PrpRow key={r.ticker} result={r} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
            BOS = Break of Structure (price closes above prior swing high). Retracements are 30/50/70% of the prior range.
            <span className="ml-2 text-purple-600 font-medium">Prime Setup = BOS + price in 30–70% zone + ≥4 swings into zone.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PrpRow({ result: r }: { result: PrpSignal }) {
  const [, navigate] = useLocation();
  const isPrime = r.retracementZone !== "NONE" && r.rr >= 2 && r.ema21Aligned;
  const isInZone = r.retracementZone !== "NONE" && !isPrime;

  const handleLogTrade = () => {
    const entry = r.level50 > 0 ? r.level50.toFixed(2) : "";
    const stop = r.stop > 0 ? r.stop.toFixed(2) : "";
    const tp1 = r.target > 0 ? r.target.toFixed(2) : "";
    const params = new URLSearchParams({
      ticker: r.ticker,
      direction: "long",
      entry,
      stop,
      tp1,
      strategy: "Previous Range Pullback",
    });
    navigate(`/trade-log?${params.toString()}`);
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{r.ticker}</span>
          {r.ema21Aligned && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 text-purple-700 border-purple-300">
              EMA↑
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">BOS: {r.bosDate}</div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <div className="font-semibold">${r.currentPrice.toFixed(2)}</div>
        {r.retracementZone !== "NONE" && (
          <div className="text-[10px] text-purple-600">{r.retracementZone}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-green-600">
        ${r.bosLevel.toFixed(2)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <span className={Math.abs(r.currentPrice - r.level30) / (r.level30 || 1) < 0.01 ? "text-purple-600 font-semibold" : "text-muted-foreground"}>
          ${r.level30.toFixed(2)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <span className={Math.abs(r.currentPrice - r.level50) / (r.level50 || 1) < 0.01 ? "text-purple-600 font-semibold" : "text-muted-foreground"}>
          ${r.level50.toFixed(2)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs hidden sm:table-cell">
        <span className={Math.abs(r.currentPrice - r.level70) / (r.level70 || 1) < 0.01 ? "text-purple-600 font-semibold" : "text-muted-foreground"}>
          ${r.level70.toFixed(2)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center hidden md:table-cell">
        <div className="flex items-center justify-center gap-1">
          <span className={`text-xs font-semibold ${r.ema21Aligned ? "text-purple-600" : "text-muted-foreground"}`}>
            {r.daysSinceBos}d
          </span>
          <span className="text-[10px] text-muted-foreground">since BOS</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${
            isPrime
              ? "bg-purple-50 text-purple-700 border-purple-300"
              : isInZone
              ? "bg-blue-50 text-blue-700 border-blue-300"
              : "bg-slate-50 text-slate-500 border-slate-200"
          }`}
        >
          {isPrime ? "PRIME" : isInZone ? "IN ZONE" : "WATCHING"}
          {r.direction === "BEARISH" && <span className="ml-1 text-[9px]">↓</span>}
        </Badge>
      </td>
      <td className="px-3 py-2.5 text-center">
        {(isPrime || isInZone) && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 border-purple-400 text-purple-700 hover:bg-purple-50"
            onClick={handleLogTrade}
          >
            Log Trade
          </Button>
        )}
      </td>
    </tr>
  );
}
