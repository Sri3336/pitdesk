import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw, Search, Filter,
  BarChart2, ArrowUpDown, Info, Clock, Calendar, Play, Database, Zap, AlertCircle, CheckCircle2,
  Share2, Bell, BellOff, Plus, Trash2, ToggleLeft, ToggleRight,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { TICKER_UNIVERSE, SECTORS, type TickerInfo } from "../../../shared/tickerUniverse";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  LineChart, Line, Area, AreaChart,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type PCRSignal = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

// ─── PCR Sparkline Component ─────────────────────────────────────────────────
function PCRSparkline({ ticker, signal }: { ticker: string; signal: PCRSignal }) {
  const { data } = trpc.pcrScheduled.getPCRHistory.useQuery(
    { ticker, days: 7 },
    { staleTime: 10 * 60 * 1000 }
  );

  if (!data || data.length < 2) return null;

  const chartData = (data as Array<{ runDate: string; pcr: string; signal: string }>).map(d => ({
    date: d.runDate.slice(5), // MM-DD
    pcr: parseFloat(d.pcr),
  }));

  // Color by current signal
  const areaColor = signal === "EXTREME_FEAR" ? "#10b981"
    : signal === "FEAR" ? "#14b8a6"
    : signal === "GREED" ? "#f59e0b"
    : signal === "EXTREME_GREED" ? "#ef4444"
    : "#94a3b8";

  return (
    <div className="w-24 h-10 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`sparkGrad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={areaColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={areaColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="pcr"
            stroke={areaColor}
            strokeWidth={1.5}
            fill={`url(#sparkGrad-${ticker})`}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={0.85} stroke="#94a3b8" strokeDasharray="2 2" strokeWidth={0.8} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface PCRBatchItem {
  ticker: string;
  pcr: number;
  pcrOI: number;
  signal: PCRSignal;
  signalStrength: number;
  recommendation: string;
  strategyHint: string;
  totalPutVolume: number;
  totalCallVolume: number;
  ivSkew: number;
  error?: string;
}

// ─── Signal config ────────────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<PCRSignal, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; description: string }> = {
  EXTREME_FEAR:  { label: "Extreme Fear",  color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", icon: <TrendingUp className="h-3.5 w-3.5" />,   description: "Contrarian Bullish — sell put premium" },
  FEAR:          { label: "Fear",          color: "text-teal-700",    bg: "bg-teal-50",     border: "border-teal-200",    icon: <TrendingUp className="h-3.5 w-3.5" />,   description: "Mildly Bullish — bull put spread" },
  NEUTRAL:       { label: "Neutral",       color: "text-slate-600",   bg: "bg-slate-50",    border: "border-slate-200",   icon: <Minus className="h-3.5 w-3.5" />,        description: "No edge — iron condor / strangle" },
  GREED:         { label: "Greed",         color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   icon: <TrendingDown className="h-3.5 w-3.5" />, description: "Mildly Bearish — bear call spread" },
  EXTREME_GREED: { label: "Extreme Greed", color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200",     icon: <AlertTriangle className="h-3.5 w-3.5" />, description: "Contrarian Bearish — sell call premium" },
};

function SignalBadge({ signal }: { signal: PCRSignal }) {
  const cfg = SIGNAL_CONFIG[signal];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function PCRGauge({ pcr }: { pcr: number }) {
  // PCR gauge: 0 (extreme greed) to 2+ (extreme fear), midpoint 1.0
  const pct = Math.min(100, Math.max(0, (pcr / 2.0) * 100));
  const color = pcr >= 1.5 ? "#10b981" : pcr >= 1.2 ? "#14b8a6" : pcr >= 0.8 ? "#94a3b8" : pcr >= 0.5 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Greed</span><span>Neutral</span><span>Fear</span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-red-400 via-slate-300 to-emerald-400 overflow-hidden">
        <div
          className="absolute top-0 h-full w-1 rounded-full bg-white shadow-sm border border-slate-400"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
      <div className="text-center">
        <span className="text-sm font-bold num" style={{ color }}>{pcr.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── PCR Price Sparkline (30-day price history from EOD snapshots) ───────────────
function PCRPriceSparkline({ ticker, signal }: { ticker: string; signal: PCRSignal }) {
  const { data: eodData } = trpc.pcrScheduled.getEodHistory.useQuery(
    { ticker, days: 30 },
    { staleTime: 10 * 60 * 1000 }
  );

  if (!eodData || eodData.length < 2) {
    return (
      <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground">
        No price history yet
      </div>
    );
  }

  const cfg = SIGNAL_CONFIG[signal];
  const strokeColor = signal === "EXTREME_FEAR" || signal === "FEAR" ? "#10b981" :
    signal === "EXTREME_GREED" || signal === "GREED" ? "#ef4444" : "#94a3b8";

  const chartData = eodData.map((d: { snapshotDate: string; closingPrice: string | null; pcrVolume: string }) => ({
    date: d.snapshotDate.slice(5), // MM-DD
    price: parseFloat(d.closingPrice ?? "0"),
    pcr: parseFloat(d.pcrVolume),
  }));

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Price History ({eodData.length}d)</p>
      <ResponsiveContainer width="100%" height={64}>
        <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
          <defs>
            <linearGradient id={`sparkGrad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="price"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#sparkGrad-${ticker})`}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 6, fontSize: 10, padding: "4px 8px" }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]}
            labelFormatter={(l: string) => l}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PCR Row Card ─────────────────────────────────────────────────────────────
function PCRRow({ item, tickerInfo }: { item: PCRBatchItem; tickerInfo?: TickerInfo }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SIGNAL_CONFIG[item.signal];

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} transition-all`}>
      <button
        className="w-full text-left p-3 flex items-center gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-16 shrink-0">
          <span className="font-bold text-sm text-foreground">{item.ticker}</span>
          {tickerInfo && <p className="text-[10px] text-muted-foreground truncate">{tickerInfo.sector}</p>}
        </div>
        <div className="flex-1 min-w-0">
          <PCRGauge pcr={item.pcr} />
        </div>
        <div className="w-28 shrink-0 text-right">
          <SignalBadge signal={item.signal} />
        </div>
        <div className="w-32 shrink-0 text-right hidden md:block">
          <p className="text-xs text-muted-foreground">{item.strategyHint}</p>
        </div>
        <div className="w-4 shrink-0 text-muted-foreground text-xs">
          {expanded ? "▲" : "▼"}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-current/10 mt-1 pt-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">PCR (Volume)</p>
              <p className="text-base font-bold num">{item.pcr.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">PCR (OI)</p>
              <p className="text-base font-bold num">{item.pcrOI.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">IV Skew</p>
              <p className={`text-base font-bold num ${item.ivSkew > 3 ? "text-amber-700" : item.ivSkew < -3 ? "text-blue-700" : "text-foreground"}`}>
                {item.ivSkew > 0 ? "+" : ""}{item.ivSkew.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md bg-white/60 border border-current/10 p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Signal Strength</p>
              <p className="text-base font-bold num">{item.signalStrength}/100</p>
            </div>
          </div>
          <div className="rounded-md bg-white/60 border border-current/10 p-3">
            <p className="text-xs font-semibold text-foreground mb-1">Recommended Trade</p>
            <p className="text-xs text-muted-foreground">{item.recommendation}</p>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Put Vol: <span className="font-semibold text-foreground num">{item.totalPutVolume.toLocaleString()}</span></span>
            <span>Call Vol: <span className="font-semibold text-foreground num">{item.totalCallVolume.toLocaleString()}</span></span>
          </div>
          {/* Mini sparkline */}
          <div className="rounded-md bg-white/60 border border-current/10 p-2">
            <PCRPriceSparkline ticker={item.ticker} signal={item.signal} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PCR Alert Settings Tab ─────────────────────────────────────────────────
function PCRAlertSettingsTab() {
  const utils = trpc.useUtils();
  const { data: settings = [], isLoading } = trpc.pcrAlerts.listSettings.useQuery();
  const [newTicker, setNewTicker] = useState("");
  const [newFlags, setNewFlags] = useState({
    alertOnFear: true,
    alertOnGreed: true,
    alertOnExtremeFear: true,
    alertOnExtremeGreed: true,
  });

  const upsert = trpc.pcrAlerts.upsertSettings.useMutation({
    onSuccess: () => {
      utils.pcrAlerts.listSettings.invalidate();
      setNewTicker("");
      toast.success("Alert saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSetting = trpc.pcrAlerts.deleteSettings.useMutation({
    onSuccess: () => {
      utils.pcrAlerts.listSettings.invalidate();
      toast.success("Alert removed");
    },
  });

  const toggle = trpc.pcrAlerts.toggleEnabled.useMutation({
    onSuccess: () => utils.pcrAlerts.listSettings.invalidate(),
  });

  const handleAdd = () => {
    const t = newTicker.trim().toUpperCase();
    if (!t) return;
    upsert.mutate({ ticker: t, ...newFlags });
  };

  return (
    <div className="space-y-4">
      <Card className="border-violet-200 bg-violet-50/40">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-violet-600" />
            PCR Regime-Change Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-xs text-muted-foreground mb-3">
            Get notified when a ticker's PCR signal crosses from Neutral into Fear or Greed during the 11:30 AM scan.
            Configure which signal transitions trigger a notification for each ticker.
          </p>

          {/* Add new alert */}
          <div className="rounded-lg border border-violet-200 bg-white p-3 mb-4">
            <p className="text-xs font-semibold text-foreground mb-2">Add Alert</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Ticker</label>
                <Input
                  placeholder="e.g. NVDA"
                  value={newTicker}
                  onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  className="h-8 w-28 text-sm font-mono"
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {([
                  { key: "alertOnExtremeFear", label: "Extreme Fear", color: "text-emerald-700" },
                  { key: "alertOnFear", label: "Fear", color: "text-teal-700" },
                  { key: "alertOnGreed", label: "Greed", color: "text-amber-700" },
                  { key: "alertOnExtremeGreed", label: "Extreme Greed", color: "text-red-700" },
                ] as const).map(({ key, label, color }) => (
                  <label key={key} className={`flex items-center gap-1.5 text-xs cursor-pointer ${color}`}>
                    <input
                      type="checkbox"
                      checked={newFlags[key]}
                      onChange={e => setNewFlags(f => ({ ...f, [key]: e.target.checked }))}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleAdd}
                disabled={upsert.isPending || !newTicker.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Alert
              </Button>
            </div>
          </div>

          {/* Existing alerts */}
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : settings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-violet-200 p-6 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No alerts configured yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Add a ticker above to start receiving regime-change notifications.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(settings as Array<{
                id: number; ticker: string; enabled: boolean;
                alertOnFear: boolean; alertOnGreed: boolean;
                alertOnExtremeFear: boolean; alertOnExtremeGreed: boolean;
              }>).map(s => (
                <div key={s.id} className={`rounded-lg border p-3 flex items-center justify-between gap-3 flex-wrap ${
                  s.enabled ? "border-violet-200 bg-white" : "border-slate-200 bg-slate-50 opacity-60"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm font-mono">{s.ticker}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {s.alertOnExtremeFear && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Ext. Fear</span>}
                      {s.alertOnFear && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">Fear</span>}
                      {s.alertOnGreed && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Greed</span>}
                      {s.alertOnExtremeGreed && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Ext. Greed</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggle.mutate({ ticker: s.ticker, enabled: !s.enabled })}
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors ${
                        s.enabled
                          ? "border-violet-200 text-violet-700 hover:bg-violet-50"
                          : "border-slate-200 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {s.enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      {s.enabled ? "On" : "Off"}
                    </button>
                    <button
                      onClick={() => deleteSetting.mutate({ ticker: s.ticker })}
                      className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── PCR Explainer Video Section ────────────────────────────────────────────
function PCRExplainerSection() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleToggle = () => {
    setOpen(prev => {
      if (prev && videoRef.current) videoRef.current.pause();
      return !prev;
    });
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="pt-4 pb-3">
        <button
          onClick={handleToggle}
          className="w-full flex items-center justify-between gap-3 text-left group"
        >
          <div className="flex items-center gap-3">
            {/* Thumbnail preview — always visible */}
            <div className="relative shrink-0 w-24 h-14 rounded-md overflow-hidden border border-blue-200 shadow-sm">
              <img
                src="/manus-storage/pcr_frame1_title_b46f06b4.png"
                alt="PCR Strategy explainer thumbnail"
                className="w-full h-full object-cover"
              />
              {!open && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600/90 text-white">
                    <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">How PCR Strategy Works</p>
              <p className="text-xs text-blue-700">Watch a 96-second explainer — PCR signals, COI delta, and options plays</p>
            </div>
          </div>
          <svg className={`w-4 h-4 text-blue-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4"/></svg>
        </button>

        {open && (
          <div className="mt-4">
            <video
              ref={videoRef}
              src="/manus-storage/pcr_explainer_18c762bd.mp4"
              poster="/manus-storage/pcr_frame1_title_b46f06b4.png"
              controls
              autoPlay
              className="w-full rounded-lg shadow-md max-h-[420px] bg-slate-900"
              style={{ aspectRatio: "16/9" }}
            />
            {/* Share button */}
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/pcr-strategy?howItWorks=open`;
                  navigator.clipboard.writeText(url).then(() => toast.success("Link copied to clipboard!"));
                }}
                className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 transition-colors px-2 py-1 rounded hover:bg-blue-100"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share this explainer
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { label: "Extreme Fear (PCR > 1.5)", hint: "Contrarian Bullish → Buy Calls", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                { label: "Fear (PCR 1.2–1.5)", hint: "Mildly Bullish → Bull Call Spread", color: "text-teal-700 bg-teal-50 border-teal-200" },
                { label: "Greed (PCR 0.5–0.8)", hint: "Mildly Bearish → Bear Put Spread", color: "text-amber-700 bg-amber-50 border-amber-200" },
                { label: "Extreme Greed (PCR < 0.5)", hint: "Contrarian Bearish → Buy Puts", color: "text-red-700 bg-red-50 border-red-200" },
              ].map(item => (
                <div key={item.label} className={`rounded border p-2 ${item.color}`}>
                  <p className="font-semibold leading-tight">{item.label}</p>
                  <p className="mt-0.5 opacity-80">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scan History Tab ───────────────────────────────────────────────────────
function ScanHistoryTab() {
  const [days, setDays] = useState(14);
  const { data: histData, isLoading } = trpc.pcrScheduled.getHistoricalResults.useQuery(
    { days },
    { staleTime: 5 * 60 * 1000 }
  );

  // Group by runDate
  const grouped = useMemo(() => {
    if (!histData) return [];
    const map = new Map<string, typeof histData>();
    for (const row of histData) {
      const key = `${row.runDate}|${row.runType}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      const [date, runType] = key.split("|");
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.signal] = (counts[r.signal] ?? 0) + 1;
      return { date, runType, rows, counts };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [histData]);

  // Build trend chart data: one point per unique runDate (intraday_scan preferred over eod)
  // MUST be before any early returns to satisfy Rules of Hooks
  const trendData = useMemo(() => {
    if (!grouped || grouped.length < 2) return [];
    const byDate = new Map<string, typeof grouped[0]>();
    for (const g of grouped) {
      const existing = byDate.get(g.date);
      if (!existing || g.runType === "intraday_scan") byDate.set(g.date, g);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(g => ({
        date: g.date.slice(5),
        fear: (g.counts["EXTREME_FEAR"] ?? 0) + (g.counts["FEAR"] ?? 0),
        neutral: g.counts["NEUTRAL"] ?? 0,
        greed: (g.counts["EXTREME_GREED"] ?? 0) + (g.counts["GREED"] ?? 0),
        total: g.rows.length,
      }));
  }, [grouped]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>;

  if (!histData || histData.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">No scan history yet</p>
        <p className="text-xs text-muted-foreground mt-1">Scan history will appear here after the first scheduled run completes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Signal Trend Chart */}
      {trendData.length >= 2 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              Signal Distribution Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="trendFear" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="trendGreed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip
                  contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number, name: string) => [v, name === "fear" ? "Fear" : name === "greed" ? "Greed" : "Neutral"]}
                />
                <Area type="monotone" dataKey="fear" stroke="#10b981" fill="url(#trendFear)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="greed" stroke="#ef4444" fill="url(#trendGreed)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="neutral" stroke="#94a3b8" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1 text-[10px] text-muted-foreground justify-center">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Fear (Bullish)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Greed (Bearish)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-400 inline-block" style={{ borderTop: '2px dashed #94a3b8', background: 'none' }} /> Neutral</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Days selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Show last:</span>
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              days === d ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
            }`}
          >{d} days</button>
        ))}
      </div>

      {grouped.map(({ date, runType, rows, counts }) => (
        <Card key={`${date}-${runType}`} className="border-slate-200">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{date}</span>
                <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">
                  {runType === "intraday_scan" ? "11:30 AM Scan" : "EOD Snapshot"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {(["EXTREME_FEAR", "FEAR", "NEUTRAL", "GREED", "EXTREME_GREED"] as PCRSignal[]).map(sig => {
                  const cnt = counts[sig] ?? 0;
                  if (!cnt) return null;
                  const cfg = SIGNAL_CONFIG[sig];
                  return (
                    <span key={sig} className={`px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                      {cfg.label} {cnt}
                    </span>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
              {rows.slice(0, 24).map(row => {
                const sig = row.signal as PCRSignal;
                const cfg = SIGNAL_CONFIG[sig] ?? SIGNAL_CONFIG.NEUTRAL;
                return (
                  <div key={row.ticker} className={`rounded px-2 py-1 border ${cfg.border} ${cfg.bg} flex items-center justify-between gap-1`}>
                    <span className="text-xs font-bold">{row.ticker}</span>
                    <span className={`text-[10px] font-semibold num ${cfg.color}`}>{parseFloat(row.pcr).toFixed(2)}</span>
                  </div>
                );
              })}
              {rows.length > 24 && (
                <div className="rounded px-2 py-1 border border-slate-200 bg-slate-50 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">+{rows.length - 24} more</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Scan Detail Tab ────────────────────────────────────────────────────────
function ScanDetailTab() {
  const { data: runDates = [], isLoading: datesLoading } = trpc.pcrScheduled.getScanRunDates.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? runDates[0] ?? null;

  const { data: detail = [], isLoading: detailLoading } = trpc.pcrScheduled.getScanRunDetail.useQuery(
    { runDate: activeDate! },
    { enabled: !!activeDate, staleTime: 5 * 60 * 1000 }
  );

  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [signalFilter, setSignalFilter] = useState("ALL");
  const [searchQ, setSearchQ] = useState("");
  const [sortCol, setSortCol] = useState<"ticker" | "pcr" | "delta" | "signal">("delta");
  const [sortAsc, setSortAsc] = useState(false);

  const sectors = useMemo(() => {
    const s = new Set(detail.map(r => r.sector));
    return ["ALL", ...Array.from(s).sort()];
  }, [detail]);

  const filtered = useMemo(() => {
    let rows = detail;
    if (sectorFilter !== "ALL") rows = rows.filter(r => r.sector === sectorFilter);
    if (signalFilter !== "ALL") rows = rows.filter(r => r.currentSignal === signalFilter);
    if (searchQ) rows = rows.filter(r => r.ticker.includes(searchQ.toUpperCase()));
    return [...rows].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortCol === "ticker") { va = a.ticker; vb = b.ticker; }
      else if (sortCol === "pcr") { va = parseFloat(a.currentPCR); vb = parseFloat(b.currentPCR); }
      else if (sortCol === "delta") { va = parseFloat(a.pcrDeltaVsPrior ?? "0"); vb = parseFloat(b.pcrDeltaVsPrior ?? "0"); }
      else { va = a.signalStrength; vb = b.signalStrength; }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va - (vb as number)) : ((vb as number) - va);
    });
  }, [detail, sectorFilter, signalFilter, searchQ, sortCol, sortAsc]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(v => !v);
    else { setSortCol(col); setSortAsc(false); }
  };

  const signalChangedCount = useMemo(() => filtered.filter(r => r.signalChanged).length, [filtered]);

  if (datesLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;

  if (!runDates.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <Database className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">No intraday scan runs yet</p>
        <p className="text-xs text-muted-foreground mt-1">Run the 11:30 AM scan to see per-ticker OI comparison data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Run date picker + filters */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Scan Run Date</label>
              <Select value={activeDate ?? ""} onValueChange={v => setSelectedDate(v)}>
                <SelectTrigger className="h-8 w-36 text-sm">
                  <SelectValue placeholder="Select run" />
                </SelectTrigger>
                <SelectContent>
                  {runDates.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Sector</label>
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger className="h-8 w-36 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Signal</label>
              <Select value={signalFilter} onValueChange={setSignalFilter}>
                <SelectTrigger className="h-8 w-36 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Signals</SelectItem>
                  <SelectItem value="EXTREME_FEAR">Extreme Fear</SelectItem>
                  <SelectItem value="FEAR">Fear</SelectItem>
                  <SelectItem value="NEUTRAL">Neutral</SelectItem>
                  <SelectItem value="GREED">Greed</SelectItem>
                  <SelectItem value="EXTREME_GREED">Extreme Greed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="AAPL..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
              </div>
            </div>
            {signalChangedCount > 0 && (
              <div className="ml-auto">
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 border">
                  <Zap className="h-3 w-3 mr-1" />{signalChangedCount} regime change{signalChangedCount !== 1 ? "s" : ""}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* OI Bar Chart — top 10 movers by |delta| */}
      {!detailLoading && filtered.length > 0 && (() => {
        const top10 = [...filtered]
          .filter(r => r.priorPutOI && r.priorCallOI)
          .sort((a, b) => Math.abs(parseFloat(b.pcrDeltaVsPrior ?? "0")) - Math.abs(parseFloat(a.pcrDeltaVsPrior ?? "0")))
          .slice(0, 10);
        if (!top10.length) return null;
        const oiChartData = top10.map(r => ({
          ticker: r.ticker,
          putOI: r.priorPutOI ?? 0,
          callOI: r.priorCallOI ?? 0,
          delta: parseFloat(r.pcrDeltaVsPrior ?? "0"),
        }));
        return (
          <Card className="border-slate-200">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-violet-500" />
                Prior EOD Put vs Call OI — Top 10 Movers
                <span className="text-xs font-normal text-muted-foreground ml-1">(sorted by |PCR Δ|)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={oiChartData} margin={{ top: 4, right: 8, bottom: 20, left: 8 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ticker" tick={{ fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === "putOI" ? "Prior Put OI" : "Prior Call OI",
                    ]}
                    labelFormatter={(label: string) => {
                      const row = oiChartData.find(r => r.ticker === label);
                      return `${label} — PCR Δ ${row?.delta !== undefined ? (row.delta > 0 ? "+" : "") + row.delta.toFixed(3) : ""}`;
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="putOI" name="putOI" fill="#22c55e" radius={[3,3,0,0]} maxBarSize={28} />
                  <Bar dataKey="callOI" name="callOI" fill="#ef4444" radius={[3,3,0,0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 justify-center mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" />Put OI (bullish hedge)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" />Call OI (bearish hedge)</span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Detail table */}
      {detailLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-muted-foreground">No results for the selected filters.</p>
        </div>
      ) : (
        <Card className="border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("ticker")}>
                    Ticker {sortCol === "ticker" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Sector</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("signal")}>
                    Signal {sortCol === "signal" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("pcr")}>
                    PCR {sortCol === "pcr" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort("delta")}>
                    Δ vs Prior EOD {sortCol === "delta" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Prior OI PCR</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Prior Put OI</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Prior Call OI</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Prior Close</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Strategy</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const delta = row.pcrDeltaVsPrior ? parseFloat(row.pcrDeltaVsPrior) : null;
                  const sig = (row.currentSignal as PCRSignal) in SIGNAL_CONFIG ? row.currentSignal as PCRSignal : "NEUTRAL";
                  const cfg = SIGNAL_CONFIG[sig];
                  const priorSig = row.priorSignal && (row.priorSignal as PCRSignal) in SIGNAL_CONFIG ? row.priorSignal as PCRSignal : null;
                  return (
                    <tr key={row.ticker} className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${row.signalChanged ? "bg-violet-50/30" : ""}`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold font-mono text-sm">{row.ticker}</span>
                          {row.signalChanged && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                              <Zap className="h-2.5 w-2.5" />Regime ↑
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.sector}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <SignalBadge signal={sig} />
                          {priorSig && priorSig !== sig && (
                            <span className="text-[10px] text-muted-foreground">was {SIGNAL_CONFIG[priorSig].label}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
                        {parseFloat(row.currentPCR).toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {delta !== null ? (
                          <span className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold ${
                            delta > 0.05 ? "text-emerald-700" : delta < -0.05 ? "text-red-600" : "text-slate-500"
                          }`}>
                            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {delta > 0 ? "+" : ""}{delta.toFixed(3)}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {row.priorPCROI ? parseFloat(row.priorPCROI).toFixed(3) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {row.priorPutOI ? row.priorPutOI.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {row.priorCallOI ? row.priorCallOI.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {row.closingPrice ? `$${parseFloat(row.closingPrice).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium ${cfg.color}`}>{row.strategyHint}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filtered.length} tickers • Prior EOD from {filtered[0]?.priorSnapshotDate ?? "—"}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const csv = [
                  ["Ticker","Sector","Signal","PCR","Delta vs Prior","Prior OI PCR","Prior Put OI","Prior Call OI","Prior Close","Strategy"],
                  ...filtered.map(r => [
                    r.ticker, r.sector, r.currentSignal, r.currentPCR,
                    r.pcrDeltaVsPrior ?? "", r.priorPCROI ?? "",
                    r.priorPutOI ?? "", r.priorCallOI ?? "",
                    r.closingPrice ?? "", r.strategyHint,
                  ]),
                ].map(row => row.join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `pcr_scan_${activeDate}.csv`; a.click();
                URL.revokeObjectURL(url);
                toast.success("CSV downloaded");
              }}
            >
              ↓ Export CSV
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PCRStrategy() {
  const [sector, setSector] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"pcr" | "signal" | "ticker">("pcr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const tickers = useMemo(() => {
    let list = TICKER_UNIVERSE;
    if (sector !== "ALL") list = list.filter(t => t.sector === sector);
    return list.map(t => t.symbol);
  }, [sector]);

  const { data: _rawBatch, isLoading, refetch, isFetching } = trpc.pcr.getBatch.useQuery(
    { tickers },
    { staleTime: 5 * 60 * 1000 }
  );
  const data = _rawBatch as PCRBatchItem[] | undefined;

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.filter((d: PCRBatchItem) => !d.error);
    if (search) {
      const q = search.toUpperCase();
      items = items.filter((d: PCRBatchItem) => d.ticker.includes(q));
    }
    items = [...items].sort((a: PCRBatchItem, b: PCRBatchItem) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortBy === "pcr") { va = a.pcr; vb = b.pcr; }
      else if (sortBy === "signal") { va = a.signalStrength; vb = b.signalStrength; }
      else { va = a.ticker; vb = b.ticker; }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return items;
  }, [data, search, sortBy, sortDir]);

  // Summary stats
  const summary = useMemo(() => {
    if (!data) return null;
    const items = data.filter((d: PCRBatchItem) => !d.error);
    const counts = { EXTREME_FEAR: 0, FEAR: 0, NEUTRAL: 0, GREED: 0, EXTREME_GREED: 0 };
    items.forEach((d: PCRBatchItem) => counts[d.signal]++);
    const avgPCR = items.reduce((s: number, d: PCRBatchItem) => s + d.pcr, 0) / (items.length || 1);
    return { counts, avgPCR, total: items.length };
  }, [data]);

  // Chart data
  const chartData = useMemo(() => {
    if (!filtered.length) return [];
    return filtered.slice(0, 20).map((d: PCRBatchItem) => ({
      ticker: d.ticker,
      pcr: d.pcr,
      color: d.pcr >= 1.5 ? "#10b981" : d.pcr >= 1.2 ? "#14b8a6" : d.pcr >= 0.8 ? "#94a3b8" : d.pcr >= 0.5 ? "#f59e0b" : "#ef4444",
    }));
  }, [filtered]);

  // Scheduled results (today's 11:30 AM scan)
  const { data: scheduledData, isLoading: scheduledLoading, refetch: refetchScheduled } =
    trpc.pcrScheduled.getIntradayResults.useQuery({}, { staleTime: 5 * 60 * 1000 });

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const triggerEod = trpc.pcrScheduled.triggerEodSnapshot.useMutation({
    onSuccess: (result) => {
      toast.success(`EOD Snapshot complete — saved ${result.saved} tickers (${result.errors} errors)`);
    },
    onError: (err) => toast.error(`EOD Snapshot failed: ${err.message}`),
  });

  const triggerIntraday = trpc.pcrScheduled.triggerIntradayScan.useMutation({
    onSuccess: (result) => {
      toast.success(`Intraday scan complete — ${result.processed} tickers, ${result.actionable} actionable signals`);
      refetchScheduled();
    },
    onError: (err) => toast.error(`Intraday scan failed: ${err.message}`),
  });

  // Missing tickers indicator
  const { data: missingData, refetch: refetchMissing } =
    trpc.pcrScheduled.getMissingTickers.useQuery({}, { staleTime: 2 * 60 * 1000 });

  const retryMissing = trpc.pcrScheduled.retryMissingTickers.useMutation({
    onSuccess: (result) => {
      toast.success((result as any).message ?? `Retry complete`);
      refetchMissing();
    },
    onError: (err) => toast.error(`Retry failed: ${err.message}`),
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  // Biggest Movers data
  const { data: biggestMovers } = trpc.pcrScheduled.getBiggestMovers.useQuery({}, { staleTime: 5 * 60 * 1000 });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PCR Strategy Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Put/Call Ratio signals across 50 tickers — contrarian sentiment-based options strategy
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* PCR Explainer Video */}
      <PCRExplainerSection />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["EXTREME_FEAR", "FEAR", "NEUTRAL", "GREED", "EXTREME_GREED"] as PCRSignal[]).map(sig => {
            const cfg = SIGNAL_CONFIG[sig];
            return (
              <Card key={sig} className={`border ${cfg.border} ${cfg.bg}`}>
                <CardContent className="pt-3 pb-3 text-center">
                  <div className={`flex items-center justify-center gap-1 ${cfg.color} mb-1`}>
                    {cfg.icon}
                    <span className="text-xs font-semibold">{cfg.label}</span>
                  </div>
                  <p className={`text-2xl font-bold num ${cfg.color}`}>{summary.counts[sig]}</p>
                  <p className="text-[10px] text-muted-foreground">tickers</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table"><BarChart2 className="h-4 w-4 mr-1.5" />Table View</TabsTrigger>
          <TabsTrigger value="chart"><BarChart2 className="h-4 w-4 mr-1.5" />PCR Chart</TabsTrigger>
          <TabsTrigger value="scheduled"><Clock className="h-4 w-4 mr-1.5" />11:30 AM Scan</TabsTrigger>
          <TabsTrigger value="detail"><Database className="h-4 w-4 mr-1.5" />Scan Detail</TabsTrigger>
          <TabsTrigger value="history"><Calendar className="h-4 w-4 mr-1.5" />Scan History</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-4 w-4 mr-1.5" />Alerts</TabsTrigger>
        </TabsList>

        {/* Sector Preset Buttons */}
        <div className="flex flex-wrap gap-1.5 mt-3 mb-2">
          {[
            { label: "All", value: "ALL" },
            { label: "Quantum & AI", value: "Quantum & AI" },
            { label: "Semiconductors", value: "Semiconductors" },
            { label: "Technology", value: "Technology" },
            { label: "Financials", value: "Financials" },
            { label: "Healthcare", value: "Healthcare" },
            { label: "Energy", value: "Energy" },
          ].map(preset => (
            <button
              key={preset.value}
              onClick={() => setSector(preset.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                sector === preset.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-1 mb-3">
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
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleSort("pcr")}>
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />PCR {sortBy === "pcr" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleSort("signal")}>
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />Strength {sortBy === "signal" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleSort("ticker")}>
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />A–Z {sortBy === "ticker" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </Button>
        </div>

        <TabsContent value="table" className="mt-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tickers match your filters.</p>
              ) : (
                filtered.map((item: PCRBatchItem) => (
                  <PCRRow
                    key={item.ticker}
                    item={item}
                    tickerInfo={TICKER_UNIVERSE.find(t => t.symbol === item.ticker)}
                  />
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chart" className="mt-0">
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">PCR by Ticker (top 20)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                    <XAxis dataKey="ticker" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 2]} />
                    <Tooltip
                      contentStyle={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [v.toFixed(2), "PCR"]}
                    />
                    <ReferenceLine y={1.2} stroke="#10b981" strokeDasharray="4 2" label={{ value: "Fear 1.2", fontSize: 9, fill: "#10b981" }} />
                    <ReferenceLine y={0.8} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "Greed 0.8", fontSize: 9, fill: "#f59e0b" }} />
                    <Bar dataKey="pcr" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Scheduled Results Tab */}
        <TabsContent value="scheduled" className="mt-4">
          <Card className="border-blue-200 bg-blue-50/40 mb-4">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-2 flex-1">
                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-800 space-y-1">
                    <p><strong>Scheduled PCR Scans:</strong> Two automated runs capture options flow data daily.</p>
                    <p><strong>4:30 PM ET (EOD Snapshot):</strong> Captures end-of-day Open Interest (OI) baseline for all 66 tickers. This is the reference point for tomorrow's COI calculation.</p>
                    <p><strong>11:30 AM ET (Intraday Scan):</strong> Computes live PCR + Change in OI (COI) vs the prior EOD baseline. A large positive COI delta means new put contracts were opened overnight — a sign of fresh institutional hedging.</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 gap-1.5"
                      onClick={() => triggerEod.mutate()}
                      disabled={triggerEod.isPending}
                    >
                      {triggerEod.isPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Database className="h-3.5 w-3.5" />
                      )}
                      {triggerEod.isPending ? "Running EOD..." : "Run EOD Snapshot Now"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                      onClick={() => triggerIntraday.mutate()}
                      disabled={triggerIntraday.isPending}
                    >
                      {triggerIntraday.isPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      {triggerIntraday.isPending ? "Scanning..." : "Run 11:30 AM Scan Now"}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Missing Tickers Indicator */}
          {missingData && missingData.count > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <span className="text-sm font-semibold text-amber-800">{missingData.count} tickers missing from today's EOD snapshot</span>
                  <p className="text-xs text-amber-700 mt-0.5">{missingData.missing.join(", ")}</p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 gap-1.5 shrink-0"
                  onClick={() => retryMissing.mutate({})}
                  disabled={retryMissing.isPending}
                >
                  {retryMissing.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {retryMissing.isPending ? "Retrying..." : "Retry Missing Tickers"}
                </Button>
              )}
            </div>
          ) : missingData && missingData.count === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-emerald-800 font-medium">All {(missingData as any).total ?? 60} tickers have EOD data for today</span>
            </div>
          ) : null}

          {/* Biggest Movers Section */}
          {biggestMovers && biggestMovers.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-foreground">Biggest Movers Today</h3>
                <span className="text-xs text-muted-foreground">— top 5 tickers by PCR shift vs prior day</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {(biggestMovers as Array<{
                  ticker: string; pcr: string; signal: string;
                  pcrDeltaVsPrior: string | null; priorSignal: string | null;
                  strategyHint: string; recommendation: string;
                }>).map(item => {
                  const sig = item.signal as PCRSignal;
                  const cfg = SIGNAL_CONFIG[sig] ?? SIGNAL_CONFIG.NEUTRAL;
                  const delta = item.pcrDeltaVsPrior !== null ? parseFloat(item.pcrDeltaVsPrior) : null;
                  const priorSig = item.priorSignal as PCRSignal | null;
                  const regimeChanged = priorSig && priorSig !== sig;
                  return (
                    <Card key={item.ticker} className={`border ${cfg.border} ${cfg.bg} relative overflow-hidden`}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm">{item.ticker}</span>
                          <SignalBadge signal={sig} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">PCR <span className="font-bold num">{parseFloat(item.pcr).toFixed(2)}</span></span>
                          {delta !== null && (
                            <span className={`text-xs font-bold num ${
                              delta > 0 ? "text-amber-700" : delta < 0 ? "text-emerald-700" : "text-muted-foreground"
                            }`}>
                              {delta > 0 ? "▲" : "▼"}{delta > 0 ? "+" : ""}{delta.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {regimeChanged && priorSig && (
                          <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                            ↑ from {SIGNAL_CONFIG[priorSig]?.label ?? priorSig}
                          </span>
                        )}
                        <p className="text-[10px] text-blue-700 font-medium mt-1 truncate">{item.strategyHint}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {scheduledLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : !scheduledData || scheduledData.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No scan results yet for today</p>
              <p className="text-xs text-muted-foreground mt-1">
                The 11:30 AM ET scan runs automatically on weekdays. Results will appear here after the first run.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(scheduledData as Array<{
                id: number; ticker: string; signal: string; pcr: string; pcrOI: string;
                coiDelta: string | null; coiPctChange: string | null;
                strategyHint: string; recommendation: string;
                totalPutVolume: number; totalCallVolume: number;
                signalStrength: number; runDate: string;
                pcrDeltaVsPrior: string | null; priorSignal: string | null;
              }>)
                .sort((a, b) => b.signalStrength - a.signalStrength)
                .map(item => {
                  const sig = item.signal as PCRSignal;
                  const cfg = SIGNAL_CONFIG[sig] ?? SIGNAL_CONFIG.NEUTRAL;
                  const coiDelta = parseFloat(item.coiDelta ?? "0");
                  const coiPct = parseFloat(item.coiPctChange ?? "0");
                  const tickerInfo = TICKER_UNIVERSE.find(t => t.symbol === item.ticker);
                  const pcrDelta = item.pcrDeltaVsPrior !== null && item.pcrDeltaVsPrior !== undefined
                    ? parseFloat(item.pcrDeltaVsPrior)
                    : null;
                  const priorSig = item.priorSignal as PCRSignal | null;
                  const regimeChanged = priorSig && priorSig !== sig;
                  return (
                    <div key={item.id} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-bold text-sm">{item.ticker}</span>
                            {tickerInfo && <p className="text-[10px] text-muted-foreground">{tickerInfo.sector}</p>}
                          </div>
                          <SignalBadge signal={sig} />
                          {regimeChanged && priorSig && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                              ↑ from {SIGNAL_CONFIG[priorSig]?.label ?? priorSig}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs flex-wrap">
                          <span className="text-muted-foreground">PCR <span className="font-bold num text-foreground">{parseFloat(item.pcr).toFixed(2)}</span></span>
                          <span className="text-muted-foreground">OI PCR <span className="font-bold num text-foreground">{parseFloat(item.pcrOI).toFixed(2)}</span></span>
                          {pcrDelta !== null && (
                            <span className={`inline-flex items-center gap-0.5 font-semibold num text-xs ${
                              pcrDelta > 0 ? "text-amber-700" : pcrDelta < 0 ? "text-emerald-700" : "text-muted-foreground"
                            }`}>
                              {pcrDelta > 0 ? "▲" : pcrDelta < 0 ? "▼" : "—"}
                              {pcrDelta > 0 ? "+" : ""}{pcrDelta.toFixed(2)} vs prior
                            </span>
                          )}
                          {coiDelta !== 0 && (
                            <span className={`font-semibold num ${coiDelta > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                              COI {coiDelta > 0 ? "+" : ""}{(coiDelta / 1000).toFixed(0)}k ({coiPct > 0 ? "+" : ""}{coiPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                        <p className="text-xs text-blue-700 font-medium mt-1.5">{item.strategyHint}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{item.recommendation}</p>
                      {/* 7-day PCR sparkline */}
                      <PCRSparkline ticker={item.ticker} signal={sig} />
                    </div>
                  );
                })}
            </div>
          )}
        </TabsContent>

        {/* Scan Detail Tab */}
        <TabsContent value="detail" className="mt-4">
          <ScanDetailTab />
        </TabsContent>

        {/* Scan History Tab */}
        <TabsContent value="history" className="mt-4">
          <ScanHistoryTab />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="mt-4">
          <PCRAlertSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
