import { useState, useMemo, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw, Search,
  Clock, Calendar, Play, Database, Zap, AlertCircle, CheckCircle2,
  Bell, BellOff, Plus, Trash2, ToggleLeft, ToggleRight, Target, Award,
  X, ChevronRight, Activity, BarChart2, Info, BookOpen,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { TICKER_UNIVERSE, SECTORS, type TickerInfo } from "../../../shared/tickerUniverse";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Area, AreaChart,
} from "recharts";
import { PCRTrendChart } from "@/components/PCRTrendChart";

// ─── Types ────────────────────────────────────────────────────────────────────
type PCRSignal = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

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

type ScanRow = {
  id: number; ticker: string; signal: string; pcr: string; pcrOI: string;
  coiDelta: string | null; coiPctChange: string | null;
  strategyHint: string; recommendation: string;
  totalPutVolume: number; totalCallVolume: number;
  signalStrength: number; runDate: string;
  pcrDeltaVsPrior: string | null; priorSignal: string | null;
  coiCallPct: number | null; coiPutPct: number | null;
  coiImbalancePct: number | null; coiSignal: string | null;
  atmStrike: number | null; isExpiryDay: boolean; isExpiryEve: boolean;
  atmCallDelta: number | null; atmPutDelta: number | null; expiration: string | null;
};

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

// ─── PCR Sparkline (7-day from EOD snapshots) ─────────────────────────────────
function PCRSparkline({ ticker, signal }: { ticker: string; signal: PCRSignal }) {
  const { data } = trpc.pcrScheduled.getPCRHistory.useQuery(
    { ticker, days: 7 },
    { staleTime: 10 * 60 * 1000 }
  );
  if (!data || data.length < 2) return null;
  const pts = (data as unknown as Array<{ pcr: string | number; date: string }>).map(d => ({ v: parseFloat(String(d.pcr)) }));
  const cfg = SIGNAL_CONFIG[signal];
  const color = cfg.color.replace("text-", "").replace("-700", "").replace("-600", "");
  const strokeColor = signal === "EXTREME_FEAR" || signal === "FEAR" ? "#10b981" :
    signal === "EXTREME_GREED" || signal === "GREED" ? "#ef4444" : "#94a3b8";
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={pts} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Heat Map Cell ─────────────────────────────────────────────────────────────
interface HeatCellData {
  ticker: string;
  tickerInfo?: TickerInfo;
  // From live batch (PCR sentiment)
  batchItem?: PCRBatchItem;
  // From 11:30 AM scan (COI)
  scanRow?: ScanRow;
}

function HeatCell({ cell, onClick, isSelected }: {
  cell: HeatCellData;
  onClick: () => void;
  isSelected: boolean;
}) {
  const { batchItem, scanRow, ticker } = cell;
  const hasCOI = !!(scanRow?.coiSignal && scanRow.coiSignal !== "NEUTRAL" && (scanRow.coiImbalancePct ?? 0) > 0);
  const coiSig = scanRow?.coiSignal ?? null;
  const imbalance = scanRow?.coiImbalancePct ?? 0;

  // Determine cell color based on available data
  // Priority: COI signal (Tradier) > PCR sentiment
  let bgColor = "bg-slate-100 hover:bg-slate-200";
  let textColor = "text-slate-700";
  let borderColor = "border-slate-200";
  let intensity = 0;

  if (coiSig === "BUY_CALL") {
    intensity = Math.min(1, imbalance / 80);
    bgColor = `bg-emerald-${intensity > 0.7 ? "200" : intensity > 0.4 ? "100" : "50"} hover:bg-emerald-200`;
    textColor = "text-emerald-800";
    borderColor = intensity > 0.6 ? "border-emerald-400" : "border-emerald-200";
  } else if (coiSig === "BUY_PUT") {
    intensity = Math.min(1, imbalance / 80);
    bgColor = `bg-red-${intensity > 0.7 ? "200" : intensity > 0.4 ? "100" : "50"} hover:bg-red-200`;
    textColor = "text-red-800";
    borderColor = intensity > 0.6 ? "border-red-400" : "border-red-200";
  } else if (batchItem) {
    const sig = batchItem.signal;
    if (sig === "EXTREME_FEAR") { bgColor = "bg-emerald-100 hover:bg-emerald-200"; textColor = "text-emerald-800"; borderColor = "border-emerald-300"; }
    else if (sig === "FEAR") { bgColor = "bg-teal-50 hover:bg-teal-100"; textColor = "text-teal-800"; borderColor = "border-teal-200"; }
    else if (sig === "GREED") { bgColor = "bg-amber-50 hover:bg-amber-100"; textColor = "text-amber-800"; borderColor = "border-amber-200"; }
    else if (sig === "EXTREME_GREED") { bgColor = "bg-red-100 hover:bg-red-200"; textColor = "text-red-800"; borderColor = "border-red-300"; }
  }

  const isLoading = !batchItem && !scanRow;
  const pcr = batchItem ? batchItem.pcr.toFixed(2) : scanRow ? parseFloat(scanRow.pcr).toFixed(2) : "—";

  return (
    <button
      onClick={onClick}
      className={`
        relative rounded-lg border-2 p-2 text-left transition-all duration-150 cursor-pointer
        ${bgColor} ${borderColor}
        ${isSelected ? "ring-2 ring-offset-1 ring-blue-500 border-blue-400 shadow-md scale-[1.03]" : "hover:shadow-sm hover:scale-[1.01]"}
        ${isLoading ? "animate-pulse" : ""}
      `}
      style={{ minHeight: 64 }}
    >
      {/* Strong signal glow indicator */}
      {hasCOI && imbalance >= 45 && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-400 animate-pulse" title="Strong COI signal" />
      )}
      {scanRow?.isExpiryDay && (
        <span className="absolute top-1 left-1 text-[8px] font-bold text-red-600">EXP</span>
      )}

      <div className={`font-bold text-sm leading-tight ${textColor}`}>{ticker}</div>

      {isLoading ? (
        <div className="h-3 w-8 bg-slate-200 rounded mt-1" />
      ) : hasCOI ? (
        <>
          {/* COI split mini-bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5 mb-0.5">
            <div className="bg-emerald-500" style={{ width: `${scanRow!.coiCallPct ?? 50}%` }} />
            <div className="bg-red-500" style={{ width: `${scanRow!.coiPutPct ?? 50}%` }} />
          </div>
          <div className={`text-[9px] font-semibold ${textColor}`}>
            {coiSig === "BUY_CALL" ? "▲ CALL" : "▼ PUT"} {imbalance.toFixed(0)}%
          </div>
        </>
      ) : (
        <div className={`text-[10px] font-mono mt-0.5 ${textColor} opacity-80`}>
          PCR {pcr}
        </div>
      )}
    </button>
  );
}

// ─── Detail Panel (slide-in from right) ───────────────────────────────────────
function DetailPanel({ cell, onClose }: { cell: HeatCellData; onClose: () => void }) {
  const { ticker, batchItem, scanRow, tickerInfo } = cell;
  const coiSig = scanRow?.coiSignal ?? null;
  const hasCOI = !!(coiSig && (scanRow?.coiImbalancePct ?? 0) > 0);
  const isBullish = coiSig === "BUY_CALL";
  const isBearish = coiSig === "BUY_PUT";
  const callPct = scanRow?.coiCallPct ?? 50;
  const putPct = scanRow?.coiPutPct ?? 50;
  const imbalance = scanRow?.coiImbalancePct ?? 0;
  const atmDelta = isBullish ? scanRow?.atmCallDelta : scanRow?.atmPutDelta;

  const sig = batchItem?.signal ?? "NEUTRAL";
  const cfg = SIGNAL_CONFIG[sig as PCRSignal] ?? SIGNAL_CONFIG.NEUTRAL;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-foreground">{ticker}</span>
            {scanRow?.isExpiryDay && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-300">EXPIRY TODAY</span>
            )}
            {scanRow?.isExpiryEve && !scanRow?.isExpiryDay && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300">EXP EVE</span>
            )}
          </div>
          {tickerInfo && (
            <p className="text-xs text-muted-foreground mt-0.5">{tickerInfo.name} · {tickerInfo.sector}</p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-200 transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* COI Signal Section */}
        {hasCOI ? (
          <div className={`rounded-lg border-2 p-3 ${isBullish ? "bg-emerald-50 border-emerald-300" : isBearish ? "bg-red-50 border-red-300" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">COI Signal (Tradier)</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                isBullish ? "bg-emerald-100 border-emerald-300 text-emerald-700" :
                isBearish ? "bg-red-100 border-red-300 text-red-700" :
                "bg-slate-100 border-slate-200 text-slate-600"
              }`}>
                {isBullish ? <TrendingUp className="h-3 w-3" /> : isBearish ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {isBullish ? "BUY CALL" : isBearish ? "BUY PUT" : "NEUTRAL"}
              </span>
            </div>

            {/* COI split bar */}
            <div className="mb-2">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span className="text-emerald-700 font-semibold">Calls {callPct.toFixed(1)}%</span>
                <span className="font-bold text-foreground">{imbalance.toFixed(1)}% imbalance</span>
                <span className="text-red-600 font-semibold">Puts {putPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex shadow-inner">
                <div className="bg-emerald-500 transition-all" style={{ width: `${callPct}%` }} />
                <div className="bg-red-500 transition-all" style={{ width: `${putPct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-1 text-center">7-Strike ATM COI Split</p>
            </div>

            {/* ATM details */}
            <div className="grid grid-cols-3 gap-2 text-center mt-2">
              {scanRow?.atmStrike && (
                <div className="rounded bg-white/70 border border-slate-200 px-2 py-1.5">
                  <p className="text-[9px] text-muted-foreground">ATM Strike</p>
                  <p className="text-sm font-bold text-foreground">${scanRow.atmStrike.toFixed(2)}</p>
                </div>
              )}
              {atmDelta !== null && atmDelta !== undefined && (
                <div className="rounded bg-white/70 border border-slate-200 px-2 py-1.5">
                  <p className="text-[9px] text-muted-foreground">Delta</p>
                  <p className="text-sm font-bold text-foreground">{Math.abs(atmDelta).toFixed(2)}</p>
                </div>
              )}
              {scanRow?.expiration && (
                <div className="rounded bg-white/70 border border-slate-200 px-2 py-1.5">
                  <p className="text-[9px] text-muted-foreground">Expiry</p>
                  <p className="text-xs font-bold text-foreground">{scanRow.expiration}</p>
                </div>
              )}
            </div>

            {/* Entry hint */}
            {coiSig !== "NEUTRAL" && (
              <div className="mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2">
                <p className="text-xs text-blue-800 font-semibold">
                  🎯 Entry: Wait for VWAP pullback after 11:30 AM
                </p>
                <p className="text-[10px] text-blue-700 mt-0.5">
                  {isBullish ? "Buy ATM call" : "Buy ATM put"}
                  {scanRow?.atmStrike ? ` at $${scanRow.atmStrike} strike` : ""}
                  {atmDelta !== null && atmDelta !== undefined ? ` · Δ ${Math.abs(atmDelta).toFixed(2)}` : ""}
                  {" · Square off by 3:20 PM"}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            No 11:30 AM scan data yet. Run the scan to see COI signals.
          </div>
        )}

        {/* PCR Sentiment Section */}
        {batchItem && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">PCR Sentiment</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground">PCR (Vol)</p>
                <p className="text-lg font-bold num text-foreground">{batchItem.pcr.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground">PCR (OI)</p>
                <p className="text-lg font-bold num text-foreground">{batchItem.pcrOI.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground">Put Vol</p>
                <p className="text-sm font-bold num text-foreground">{(batchItem.totalPutVolume / 1000).toFixed(0)}k</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground">Call Vol</p>
                <p className="text-sm font-bold num text-foreground">{(batchItem.totalCallVolume / 1000).toFixed(0)}k</p>
              </div>
            </div>
            <div className="mt-2">
              <SignalBadge signal={batchItem.signal} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{batchItem.strategyHint}</p>
          </div>
        )}

        {/* 7-day sparkline */}
        {batchItem && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">7-Day PCR Trend</p>
            <PCRSparkline ticker={ticker} signal={batchItem.signal} />
          </div>
        )}

        {/* Scan metadata */}
        {scanRow && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Scan Info</p>
            <p className="text-[10px] text-muted-foreground">Last scan: {new Date(scanRow.runDate).toLocaleString()}</p>
            {scanRow.recommendation && (
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{scanRow.recommendation}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PCR Alert Settings Tab (unchanged) ──────────────────────────────────────
function PCRAlertSettingsTab() {
  const utils = trpc.useUtils();
  const { data: _rawSettings = [], isLoading } = trpc.pcrAlerts.listSettings.useQuery();
  const settings = _rawSettings as unknown as Array<{ ticker: string; enabled: boolean; onExtremeFear: boolean; onFear: boolean; onExtremeGreed: boolean; onGreed: boolean }>;
  const [newTicker, setNewTicker] = useState("");
  const [newFlags, setNewFlags] = useState({
    onExtremeFear: true, onFear: false, onExtremeGreed: true, onGreed: false,
  });
  const upsert = trpc.pcrAlerts.upsertSettings.useMutation({
    onSuccess: () => { toast.success("Alert saved"); utils.pcrAlerts.listSettings.invalidate(); setNewTicker(""); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const deleteSetting = trpc.pcrAlerts.deleteSettings.useMutation({
    onSuccess: () => { toast.success("Alert removed"); utils.pcrAlerts.listSettings.invalidate(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const toggle = trpc.pcrAlerts.toggleEnabled.useMutation({
    onSuccess: () => utils.pcrAlerts.listSettings.invalidate(),
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-blue-600" />Add Alert
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-muted-foreground mb-1 block">Ticker</label>
              <Input value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} placeholder="AAPL" className="h-8 text-sm" />
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { key: "onExtremeFear", label: "Extreme Fear" },
                { key: "onFear", label: "Fear" },
                { key: "onExtremeGreed", label: "Extreme Greed" },
                { key: "onGreed", label: "Greed" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={newFlags[key as keyof typeof newFlags]}
                    onChange={e => setNewFlags(f => ({ ...f, [key]: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600" />
                  {label}
                </label>
              ))}
            </div>
            <Button size="sm" className="h-8" onClick={() => {
              if (!newTicker.trim()) { toast.error("Enter a ticker"); return; }
              upsert.mutate({ ticker: newTicker.trim(), ...newFlags });
            }} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Add Alert"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : settings.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No alerts configured. Add one above.</div>
      ) : (
        <div className="space-y-2">
          {(settings as Array<{ ticker: string; enabled: boolean; onExtremeFear: boolean; onFear: boolean; onExtremeGreed: boolean; onGreed: boolean }>).map(s => (
            <Card key={s.ticker} className="border-slate-200">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">{s.ticker}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {s.onExtremeFear && <Badge variant="outline" className="text-emerald-700 border-emerald-300 text-[10px]">Extreme Fear</Badge>}
                      {s.onFear && <Badge variant="outline" className="text-teal-700 border-teal-300 text-[10px]">Fear</Badge>}
                      {s.onExtremeGreed && <Badge variant="outline" className="text-red-700 border-red-300 text-[10px]">Extreme Greed</Badge>}
                      {s.onGreed && <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px]">Greed</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggle.mutate({ ticker: s.ticker, enabled: !s.enabled })} className="text-muted-foreground hover:text-foreground transition-colors">
                      {s.enabled ? <Bell className="h-4 w-4 text-blue-600" /> : <BellOff className="h-4 w-4" />}
                    </button>
                    <button onClick={() => deleteSetting.mutate({ ticker: s.ticker })} className="text-muted-foreground hover:text-red-600 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scan History Tab ─────────────────────────────────────────────────────────
function ScanHistoryTab() {
  const [days, setDays] = useState(14);
  const { data: histData, isLoading } = trpc.pcrScheduled.getHistoricalResults.useQuery(
    { days },
    { staleTime: 5 * 60 * 1000 }
  );
  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  const histData2 = histData as unknown as Array<{ date: string; runType: string; processed: number; actionable: number; topSignals: Array<{ ticker: string; signal: string; pcr: string }> }> | undefined;
  if (!histData2 || histData2.length === 0) return (
    <div className="text-center py-8 text-sm text-muted-foreground">
      <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      No historical scan data yet. Data will appear after the first automated scan.
    </div>
  );
  const rows = histData2!;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Show last</span>
        {[7, 14, 30].map(d => (
          <Button key={d} variant={days === d ? "default" : "outline"} size="sm" className="h-7 text-xs px-3" onClick={() => setDays(d)}>{d}d</Button>
        ))}
      </div>
      {rows.map((row, i) => (
        <Card key={i} className="border-slate-200">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{row.date}</span>
                <Badge variant="outline" className="text-[10px]">{row.runType}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{row.processed} tickers</span>
                <span>·</span>
                <span className="text-blue-700 font-semibold">{row.actionable} actionable</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
              {(row.topSignals ?? []).map((s) => {
                const sig = s.signal as PCRSignal;
                const cfg = SIGNAL_CONFIG[sig] ?? SIGNAL_CONFIG.NEUTRAL;
                return (
                  <div key={s.ticker} className={`rounded px-2 py-1 border border-slate-200 bg-slate-50 flex items-center justify-center`}>
                    <span className="font-bold text-xs mr-1">{s.ticker}</span>
                    <span className={`text-[9px] ${cfg.color}`}>{cfg.label.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Scan Detail Tab ──────────────────────────────────────────────────────────
function ScanDetailTab() {
  const { data: runDates = [], isLoading: datesLoading } = trpc.pcrScheduled.getScanRunDates.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const runDates2 = runDates as unknown as Array<{ date: string; runType: string }>;
  const effectiveDate = selectedDate ?? (runDates2[0]?.date ?? null);
  const { data: detail = [], isLoading: detailLoading } = trpc.pcrScheduled.getScanRunDetail.useQuery(
    { runDate: effectiveDate ?? "" },
    { enabled: !!effectiveDate, staleTime: 5 * 60 * 1000 }
  );
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [signalFilter, setSignalFilter] = useState("ALL");
  const [searchQ, setSearchQ] = useState("");
  const [sortCol, setSortCol] = useState<"ticker" | "pcr" | "delta" | "signal">("delta");
  const [sortAsc, setSortAsc] = useState(false);
  const filtered = useMemo(() => {
    let rows = (detail as unknown as Array<{ ticker: string; currentSignal: string; pcr: string; pcrDeltaVsPrior: string | null; priorSignal: string | null; sector: string; coiImbalancePct: number | null; coiSignal: string | null; coiCallPct: number | null; coiPutPct: number | null; atmStrike: number | null; atmCallDelta: number | null; atmPutDelta: number | null; expiration: string | null; isExpiryDay: boolean; isExpiryEve: boolean }>);
    if (sectorFilter !== "ALL") rows = rows.filter(r => r.sector === sectorFilter);
    if (signalFilter !== "ALL") rows = rows.filter(r => r.currentSignal === signalFilter);
    if (searchQ) rows = rows.filter(r => r.ticker.includes(searchQ.toUpperCase()));
    rows = [...rows].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortCol === "ticker") { va = a.ticker; vb = b.ticker; }
      else if (sortCol === "pcr") { va = parseFloat(a.pcr); vb = parseFloat(b.pcr); }
      else if (sortCol === "delta") { va = parseFloat(a.pcrDeltaVsPrior ?? "0"); vb = parseFloat(b.pcrDeltaVsPrior ?? "0"); }
      else { va = a.currentSignal; vb = b.currentSignal; }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return rows;
  }, [detail, sectorFilter, signalFilter, searchQ, sortCol, sortAsc]);
  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
  };
  if (datesLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (!runDates2.length) return (
    <div className="text-center py-8 text-sm text-muted-foreground">
      <Database className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      No scan runs yet. Run the 11:30 AM scan to see detailed results.
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Scan Date</label>
          <Select value={effectiveDate ?? ""} onValueChange={setSelectedDate}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Select date" /></SelectTrigger>
            <SelectContent>
              {runDates2.map(d => (
                <SelectItem key={d.date} value={d.date}>{d.date} ({d.runType})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Sector</label>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sectors</SelectItem>
              {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Signal</label>
          <Select value={signalFilter} onValueChange={setSignalFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Signals</SelectItem>
              {(["EXTREME_FEAR", "FEAR", "NEUTRAL", "GREED", "EXTREME_GREED"] as PCRSignal[]).map(s => (
                <SelectItem key={s} value={s}>{SIGNAL_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-muted-foreground mb-1 block">Search</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="AAPL…" className="h-8 text-xs pl-7" />
          </div>
        </div>
      </div>
      {detailLoading ? (
        <div className="space-y-1.5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">No results match your filters.</div>
      ) : (
        <Card className="border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {[
                    { col: "ticker" as const, label: "Ticker" },
                    { col: "signal" as const, label: "Signal" },
                    { col: "pcr" as const, label: "PCR" },
                    { col: "delta" as const, label: "Δ vs Prior" },
                  ].map(({ col, label }) => (
                    <th key={col} className="px-3 py-2 text-left font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort(col)}>
                      {label} {sortCol === col ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">COI Signal</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">ATM</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const sig = (row.currentSignal as PCRSignal) in SIGNAL_CONFIG ? row.currentSignal as PCRSignal : "NEUTRAL";
                  const cfg = SIGNAL_CONFIG[sig];
                  const delta = parseFloat(row.pcrDeltaVsPrior ?? "0");
                  const coiSig = row.coiSignal;
                  const hasCOI = !!(coiSig && (row.coiImbalancePct ?? 0) > 0);
                  return (
                    <tr key={row.ticker} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 font-bold">{row.ticker}</td>
                      <td className="px-3 py-2"><SignalBadge signal={sig} /></td>
                      <td className="px-3 py-2 font-mono">{parseFloat(row.pcr).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {row.pcrDeltaVsPrior !== null ? (
                          <span className={`font-semibold ${delta > 0 ? "text-amber-700" : delta < 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                            {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}{delta > 0 ? "+" : ""}{delta.toFixed(2)}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {hasCOI ? (
                          <span className={`font-bold text-[10px] ${coiSig === "BUY_CALL" ? "text-emerald-700" : "text-red-600"}`}>
                            {coiSig === "BUY_CALL" ? "▲ CALL" : "▼ PUT"} {(row.coiImbalancePct ?? 0).toFixed(0)}%
                          </span>
                        ) : <span className="text-muted-foreground text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {row.atmStrike ? `$${row.atmStrike}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filtered.length} tickers</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page — Signal Board ─────────────────────────────────────────────────
// ─── How-To Video Modal ──────────────────────────────────────────────────────
function HowToVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-green-600" />
            How to Use the PCR Strategy
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5">
          <video
            src="/manus-storage/pcr_howto_final_8a087d0c.mp4"
            controls
            autoPlay
            className="w-full rounded-lg bg-slate-900"
            style={{ maxHeight: "60vh" }}
          />
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">PCR Zones</div>
              <div className="space-y-1 text-muted-foreground">
                <div><span className="text-red-600 font-medium">PCR &gt; 1.2</span> — Fear → Contrarian Bullish</div>
                <div><span className="text-slate-500 font-medium">0.8–1.2</span> — Neutral</div>
                <div><span className="text-green-600 font-medium">PCR &lt; 0.5</span> — Greed → Contrarian Bearish</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">COI Signal</div>
              <div className="space-y-1 text-muted-foreground">
                <div>COI Imbalance <span className="text-orange-600 font-medium">≥45%</span> = strong conviction</div>
                <div>Smart money repositioning detected</div>
                <div>Highest-confidence trade setup</div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="font-semibold text-slate-700 mb-1">Workflow</div>
              <div className="space-y-1 text-muted-foreground">
                <div>1. Run <span className="font-medium">11:30 Scan</span> intraday</div>
                <div>2. Check Signal Board for setups</div>
                <div>3. Confirm with RSI + price action</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PCRStrategy() {
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"board" | "history" | "detail" | "alerts" | "trend">("board");
  const [showHowTo, setShowHowTo] = useState(false);

  const tickers = useMemo(() => TICKER_UNIVERSE.map(t => t.symbol), []);

  // Live PCR batch (sentiment)
  const { data: _rawBatch, isLoading: batchLoading, refetch, isFetching } = trpc.pcr.getBatch.useQuery(
    { tickers },
    { staleTime: 5 * 60 * 1000 }
  );
  const batchData = _rawBatch as PCRBatchItem[] | undefined;

  // 11:30 AM scan results (COI)
  const { data: scheduledData, isLoading: scheduledLoading, refetch: refetchScheduled } =
    trpc.pcrScheduled.getIntradayResults.useQuery({}, { staleTime: 5 * 60 * 1000 });

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const triggerEod = trpc.pcrScheduled.triggerEodSnapshot.useMutation({
    onSuccess: (result) => toast.success(`EOD Snapshot complete — saved ${result.saved} tickers (${result.errors} errors)`),
    onError: (err) => toast.error(`EOD Snapshot failed: ${err.message}`),
  });
  const triggerIntraday = trpc.pcrScheduled.triggerIntradayScan.useMutation({
    onSuccess: (result) => {
      toast.success(`Scan complete — ${result.processed} tickers, ${result.actionable} actionable signals`);
      refetchScheduled();
    },
    onError: (err) => toast.error(`Scan failed: ${err.message}`),
  });

  const { data: missingData } = trpc.pcrScheduled.getMissingTickers.useQuery({}, { staleTime: 2 * 60 * 1000 });
  const retryMissing = trpc.pcrScheduled.retryMissingTickers.useMutation({
    onSuccess: (result) => toast.success((result as any).message ?? "Retry complete"),
    onError: (err) => toast.error(`Retry failed: ${err.message}`),
  });

  // Build a map of scan rows by ticker for quick lookup
  const scanMap = useMemo(() => {
    const map = new Map<string, ScanRow>();
    if (scheduledData) {
      (scheduledData as ScanRow[]).forEach(r => map.set(r.ticker, r));
    }
    return map;
  }, [scheduledData]);

  // Build a map of batch items by ticker
  const batchMap = useMemo(() => {
    const map = new Map<string, PCRBatchItem>();
    if (batchData) {
      batchData.forEach(r => { if (!r.error) map.set(r.ticker, r); });
    }
    return map;
  }, [batchData]);

  // Filtered ticker list for the grid
  const filteredTickers = useMemo(() => {
    let list = TICKER_UNIVERSE;
    if (sectorFilter !== "ALL") list = list.filter(t => t.sector === sectorFilter);
    if (search) list = list.filter(t => t.symbol.includes(search.toUpperCase()) || t.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [sectorFilter, search]);

  // Summary stats
  const summary = useMemo(() => {
    if (!batchData) return null;
    const items = batchData.filter(d => !d.error);
    const counts = { EXTREME_FEAR: 0, FEAR: 0, NEUTRAL: 0, GREED: 0, EXTREME_GREED: 0 };
    items.forEach(d => counts[d.signal]++);
    const coiBullish = (scheduledData as ScanRow[] | undefined)?.filter(r => r.coiSignal === "BUY_CALL").length ?? 0;
    const coiBearish = (scheduledData as ScanRow[] | undefined)?.filter(r => r.coiSignal === "BUY_PUT").length ?? 0;
    const strongSignals = (scheduledData as ScanRow[] | undefined)?.filter(r => (r.coiImbalancePct ?? 0) >= 45).length ?? 0;
    return { counts, total: items.length, coiBullish, coiBearish, strongSignals };
  }, [batchData, scheduledData]);

  // Selected cell data
  const selectedCell = useMemo<HeatCellData | null>(() => {
    if (!selectedTicker) return null;
    return {
      ticker: selectedTicker,
      tickerInfo: TICKER_UNIVERSE.find(t => t.symbol === selectedTicker),
      batchItem: batchMap.get(selectedTicker),
      scanRow: scanMap.get(selectedTicker),
    };
  }, [selectedTicker, batchMap, scanMap]);

  const handleCellClick = useCallback((ticker: string) => {
    setSelectedTicker(prev => prev === ticker ? null : ticker);
  }, []);

  const hasScanData = !!(scheduledData && (scheduledData as ScanRow[]).length > 0);
  const missingCount = (missingData as any)?.missing ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Slim Top Bar ──────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2 mr-2">
          <Activity className="h-4 w-4 text-green-600" />
          <span className="font-bold text-sm text-foreground">PCR Signal Board</span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {([
            { id: "board", label: "Board", icon: <BarChart2 className="h-3.5 w-3.5" /> },
            { id: "trend", label: "Trend", icon: <Activity className="h-3.5 w-3.5" /> },
            { id: "detail", label: "Detail", icon: <Database className="h-3.5 w-3.5" /> },
            { id: "history", label: "History", icon: <Calendar className="h-3.5 w-3.5" /> },
            { id: "alerts", label: "Alerts", icon: <Bell className="h-3.5 w-3.5" /> },
          ] as const).map(v => (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeView === v.id
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.icon}{v.label}
            </button>
          ))}
        </div>

        {/* Sector filter */}
        {activeView === "board" && (
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="h-7 text-xs w-36 border-slate-200">
              <SelectValue placeholder="All Sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sectors</SelectItem>
              {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Search */}
        {activeView === "board" && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 text-xs pl-6 w-28 border-slate-200"
            />
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status indicators */}
        {summary && (
          <div className="flex items-center gap-3 text-xs">
            {summary.strongSignals > 0 && (
              <span className="flex items-center gap-1 text-orange-600 font-semibold">
                <Target className="h-3.5 w-3.5" />
                {summary.strongSignals} strong
              </span>
            )}
            {summary.coiBullish > 0 && (
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <TrendingUp className="h-3.5 w-3.5" />
                {summary.coiBullish} calls
              </span>
            )}
            {summary.coiBearish > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <TrendingDown className="h-3.5 w-3.5" />
                {summary.coiBearish} puts
              </span>
            )}
          </div>
        )}

        {/* Missing tickers warning */}
        {missingCount > 0 && (
          <button
            onClick={() => retryMissing.mutate({})}
            disabled={retryMissing.isPending}
            className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100 transition-colors"
          >
            <AlertCircle className="h-3 w-3" />
            {missingCount} missing — retry
          </button>
        )}

        {/* How-To button */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2.5 border-green-200 text-green-700 hover:bg-green-50"
          onClick={() => setShowHowTo(true)}
        >
          <BookOpen className="h-3.5 w-3.5 mr-1" />
          How-To
        </Button>

        {/* Scan controls */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => { refetch(); refetchScheduled(); }}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => triggerEod.mutate()}
                disabled={triggerEod.isPending}
              >
                <Database className="h-3.5 w-3.5 mr-1" />
                {triggerEod.isPending ? "Running…" : "EOD Snap"}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs px-2.5 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => triggerIntraday.mutate()}
                disabled={triggerIntraday.isPending}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {triggerIntraday.isPending ? "Scanning…" : "Run 11:30 Scan"}
              </Button>
            </>
          )}
        </div>
      </div>

      <HowToVideoModal open={showHowTo} onClose={() => setShowHowTo(false)} />

      {/* ── Main Content Area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Board / other views */}
        <div className={`flex-1 min-w-0 overflow-y-auto p-4 transition-all ${selectedCell && activeView === "board" ? "lg:pr-2" : ""}`}>

          {/* ── Board View ── */}
          {activeView === "board" && (
            <div>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">Legend:</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400" />
                  <span className="text-muted-foreground">BUY CALL (COI)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded bg-red-200 border border-red-400" />
                  <span className="text-muted-foreground">BUY PUT (COI)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
                  <span className="text-muted-foreground">Fear/Ext. Fear (PCR)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded bg-red-100 border border-red-200" />
                  <span className="text-muted-foreground">Greed/Ext. Greed (PCR)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  <span className="text-muted-foreground">Strong signal (≥45%)</span>
                </div>
                {!hasScanData && (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                    Showing PCR sentiment — run 11:30 AM scan for COI signals
                  </span>
                )}
              </div>

              {/* Sector groups */}
              {(() => {
                const sectors = sectorFilter === "ALL"
                  ? Array.from(new Set(TICKER_UNIVERSE.map(t => t.sector)))
                  : [sectorFilter];

                return sectors.map(sector => {
                  const sectorTickers = filteredTickers.filter(t => t.sector === sector);
                  if (sectorTickers.length === 0) return null;
                  return (
                    <div key={sector} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{sector}</span>
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-[10px] text-muted-foreground">{sectorTickers.length}</span>
                      </div>
                      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                        {sectorTickers.map(t => (
                          <HeatCell
                            key={t.symbol}
                            cell={{
                              ticker: t.symbol,
                              tickerInfo: t,
                              batchItem: batchMap.get(t.symbol),
                              scanRow: scanMap.get(t.symbol),
                            }}
                            onClick={() => handleCellClick(t.symbol)}
                            isSelected={selectedTicker === t.symbol}
                          />
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* ── Trend View ── */}
          {activeView === "trend" && (
            <div>
              <PCRTrendChart />
            </div>
          )}

          {/* ── Detail View ── */}
          {activeView === "detail" && <ScanDetailTab />}

          {/* ── History View ── */}
          {activeView === "history" && <ScanHistoryTab />}

          {/* ── Alerts View ── */}
          {activeView === "alerts" && <PCRAlertSettingsTab />}
        </div>

        {/* Right: Detail Panel (slides in when a cell is selected on board view) */}
        {selectedCell && activeView === "board" && (
          <div className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-hidden flex flex-col">
            <DetailPanel cell={selectedCell} onClose={() => setSelectedTicker(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
