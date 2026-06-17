import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  BellOff,
  CheckCircle,
  Info,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanResult {
  ticker: string;
  currentPrice: number;
  swingHigh: number;
  swingLow: number;
  confluences: Array<{
    fibLevel: number;
    fibPrice: number;
    emaPeriod: number;
    emaValue: number;
    currentPrice: number;
    fibProximityPct: number;
    emaProximityPct: number;
    isConfluent: boolean;
  }>;
  hasConfluence: boolean;
}

interface AlertConfig {
  id: number;
  ticker: string;
  enabled: boolean;
  proximityPct: number;
  fibLevels: number[] | string;
  emaPeriods: number[] | string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  lastTriggeredAt?: Date | null;
}

interface HistoryEntry {
  id: number;
  ticker: string;
  currentPrice: string | null;
  fibLevel: number | null;
  fibPrice: string | null;
  emaPeriod: number | null;
  emaPrice: string | null;
  proximityPct: number | null;
  notifiedEmail: boolean;
  notifiedPush: boolean;
  scannedAt: Date;
}

function fmt(n: string | number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function parseLevels(v: number[] | string | null | undefined): number[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v as string); } catch { return []; }
}

// ─── Add Alert Dialog ─────────────────────────────────────────────────────────

const FIB_OPTIONS = [23.6, 38.2, 50.0, 61.8, 78.6];
const EMA_OPTIONS = [9, 20, 50, 200];

function AddAlertDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [ticker, setTicker] = useState("");
  const [proximityPct, setProximityPct] = useState(1.0);
  const [fibLevels, setFibLevels] = useState<number[]>([38.2, 61.8]);
  const [emaPeriods, setEmaPeriods] = useState<number[]>([9, 20, 50, 200]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  const upsertMutation = trpc.fibAlerts.upsert.useMutation({
    onSuccess: () => {
      toast.success(`Alert configured for ${ticker.toUpperCase()}`);
      onSuccess();
      onClose();
      setTicker("");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleFib = (level: number) => {
    setFibLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const toggleEma = (period: number) => {
    setEmaPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-green-600" />
            Configure Fib+EMA Alert
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ticker</Label>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL or leave blank for all 60 PCR tickers"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Proximity Threshold
              <Tooltip>
                <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>Price must be within this % of both a Fib level AND an EMA</TooltipContent>
              </Tooltip>
            </Label>
            <div className="flex items-center gap-3">
              <Slider
                min={0.1}
                max={3}
                step={0.1}
                value={[proximityPct]}
                onValueChange={([v]) => setProximityPct(v)}
                className="flex-1"
              />
              <span className="text-sm font-semibold text-green-600 w-10">{proximityPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fibonacci Levels to Watch</Label>
            <div className="flex flex-wrap gap-2">
              {FIB_OPTIONS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleFib(level)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    fibLevels.includes(level)
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-background text-foreground border-border hover:border-green-400"
                  }`}
                >
                  {level}%
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>EMA Periods to Check</Label>
            <div className="flex gap-2">
              {EMA_OPTIONS.map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => toggleEma(period)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    emaPeriods.includes(period)
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-background text-foreground border-border hover:border-blue-400"
                  }`}
                >
                  EMA-{period}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Notification Channels</Label>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email (akulasridhar@gmail.com)
              </div>
              <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Push Notification
              </div>
              <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              disabled={upsertMutation.isPending || fibLevels.length === 0 || emaPeriods.length === 0}
              onClick={() =>
                upsertMutation.mutate({
                  ticker: ticker || "ALL",
                  proximityPct,
                  fibLevels,
                  emaPeriods,
                  emailEnabled,
                  pushEnabled,
                })
              }
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
            >
              {upsertMutation.isPending ? "Saving…" : "Save Alert"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Scan Results Table ───────────────────────────────────────────────────────

function ScanResultsTable({
  results,
  loading,
  started,
  onSendAlert,
}: {
  results: ScanResult[];
  loading: boolean;
  started: boolean;
  onSendAlert: (r: ScanResult, c: ScanResult["confluences"][0]) => void;
}) {
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Sparkles className="h-8 w-8 text-green-400" />
        <div className="text-sm font-medium">Click "Run Scan" to find Fib+EMA confluence zones</div>
        <div className="text-xs">Scans all 60 PCR tickers for 38.2%–61.8% retracement + EMA confluence</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-green-500" />
        <div className="text-sm">Scanning 60 PCR tickers for confluence zones…</div>
        <div className="text-xs">Fetching price history and computing Fib + EMA levels</div>
      </div>
    );
  }

  const confluent = results.filter((r) => r.hasConfluence);
  const nonConfluent = results.filter((r) => !r.hasConfluence);

  if (confluent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Bell className="h-8 w-8 text-yellow-400" />
        <div className="text-sm font-medium">No confluence zones found</div>
        <div className="text-xs">Try widening the proximity threshold or adjusting Fib levels</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4" />
        {confluent.length} tickers with Fib+EMA confluence
        {nonConfluent.length > 0 && (
          <span className="text-muted-foreground font-normal ml-1">
            ({nonConfluent.length} scanned, no confluence)
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Price</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Fib Level</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">EMA</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Proximity</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Alert</th>
            </tr>
          </thead>
          <tbody>
            {confluent.flatMap((r) =>
              r.confluences.map((c, i) => (
                <tr key={`${r.ticker}-${i}`} className="border-b border-border hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{r.ticker}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-400 text-green-700 bg-green-50">
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        Confluence
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmt(r.currentPrice)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className="text-xs font-bold text-green-700">{c.fibLevel}%</span>
                      <span className="text-[10px] text-muted-foreground">{fmt(c.fibPrice)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className="text-xs font-bold text-blue-700">EMA-{c.emaPeriod}</span>
                      <span className="text-[10px] text-muted-foreground">{fmt(c.emaValue)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="text-xs">
                      <div>Fib: <span className="font-medium text-green-600">{c.fibProximityPct.toFixed(2)}%</span></div>
                      <div>EMA: <span className="font-medium text-blue-600">{c.emaProximityPct.toFixed(2)}%</span></div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => onSendAlert(r, c)}
                    >
                      <Bell className="h-3 w-3 mr-1" />
                      Alert
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FibEmaAlerts() {
  const [showAdd, setShowAdd] = useState(false);
  const [scanStarted, setScanStarted] = useState(false);
  const [proximityPct, setProximityPct] = useState(1.0);
  const [fibLevels, setFibLevels] = useState<number[]>([38.2, 50.0, 61.8]);
  const [emaPeriods, setEmaPeriods] = useState<number[]>([9, 20, 50, 200]);

  const alertsQuery = trpc.fibAlerts.list.useQuery(undefined, { staleTime: 60 * 1000 });
  const historyQuery = trpc.fibAlerts.history.useQuery({ limit: 50 }, { staleTime: 60 * 1000 });

  const scanMutation = trpc.fibAlerts.scan.useMutation();
  const deleteMutation = trpc.fibAlerts.delete.useMutation({
    onSuccess: () => { toast.success("Alert deleted"); alertsQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const sendAlertMutation = trpc.fibAlerts.sendAlerts.useMutation({
    onSuccess: (data) => {
      const parts = [];
      if (data.emailSent) parts.push("email");
      if (data.pushSent) parts.push("push");
      toast.success(`Alert sent via ${parts.join(" + ") || "no channels"}`);
      historyQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const scanResults = (scanMutation.data as ScanResult[] | undefined) ?? [];
  const alerts = (alertsQuery.data as AlertConfig[] | undefined) ?? [];
  const history = (historyQuery.data as HistoryEntry[] | undefined) ?? [];

  const handleScan = () => {
    setScanStarted(true);
    scanMutation.mutate({ proximityPct, fibLevels, emaPeriods });
    toast.info("Scanning 60 PCR tickers for Fib+EMA confluence…");
  };

  const handleSendAlert = (r: ScanResult, c: ScanResult["confluences"][0]) => {
    sendAlertMutation.mutate({
      ticker: r.ticker,
      currentPrice: r.currentPrice,
      fibLevel: c.fibLevel,
      fibPrice: c.fibPrice,
      emaPeriod: c.emaPeriod,
      emaValue: c.emaValue,
      proximityPct: c.fibProximityPct,
      emailEnabled: true,
      pushEnabled: true,
    });
  };

  const toggleFib = (level: number) => {
    setFibLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const toggleEma = (period: number) => {
    setEmaPeriods((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-600" />
            Fib + EMA Confluence Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan 60 PCR tickers for price at 38.2%–61.8% Fibonacci retracement AND near a key EMA simultaneously
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAdd(true)}
            className="shrink-0"
          >
            <Settings className="h-4 w-4 mr-1.5" />
            Configure
          </Button>
          <Button
            onClick={handleScan}
            disabled={scanMutation.isPending}
            className="bg-green-500 hover:bg-green-600 text-white shrink-0"
          >
            {scanMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {scanMutation.isPending ? "Scanning…" : "Run Scan"}
          </Button>
        </div>
      </div>

      {/* Scan settings */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium whitespace-nowrap">Proximity</label>
              <div className="flex items-center gap-2">
                <Slider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={[proximityPct]}
                  onValueChange={([v]) => setProximityPct(v)}
                  className="w-28"
                />
                <span className="text-sm font-semibold text-green-600 w-10">{proximityPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Fib Levels</div>
              <div className="flex flex-wrap gap-1.5">
                {FIB_OPTIONS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleFib(level)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      fibLevels.includes(level)
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-background text-foreground border-border hover:border-green-400"
                    }`}
                  >
                    {level}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">EMA Periods</div>
              <div className="flex gap-1.5">
                {EMA_OPTIONS.map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => toggleEma(period)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      emaPeriods.includes(period)
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-background text-foreground border-border hover:border-blue-400"
                    }`}
                  >
                    EMA-{period}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Scan Results / Alert Configs / History */}
      <Tabs defaultValue="scan">
        <TabsList>
          <TabsTrigger value="scan">Scan Results</TabsTrigger>
          <TabsTrigger value="configs">
            Alert Configs
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {alerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            Alert History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Scan Results */}
        <TabsContent value="scan" className="mt-4">
          <ScanResultsTable
            results={scanResults}
            loading={scanMutation.isPending}
            started={scanStarted}
            onSendAlert={handleSendAlert}
          />
        </TabsContent>

        {/* Alert Configurations */}
        <TabsContent value="configs" className="mt-4">
          {alertsQuery.isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading configurations…
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
              <Settings className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium">No alert configurations yet</div>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Configuration
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Threshold</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Fib Levels</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Channels</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-3 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} className="border-b border-border hover:bg-accent/30">
                      <td className="px-3 py-2.5 font-bold text-sm">{a.ticker}</td>
                      <td className="px-3 py-2.5 text-center text-sm">{a.proximityPct.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {parseLevels(a.fibLevels).map((l) => (
                            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                              {l}%
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {a.emailEnabled && <Mail className="h-3.5 w-3.5 text-blue-500" />}
                          {a.pushEnabled && <Bell className="h-3.5 w-3.5 text-green-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className={a.enabled ? "border-green-400 text-green-700 bg-green-50" : "border-gray-300 text-gray-500"}
                        >
                          {a.enabled ? "Active" : "Paused"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteMutation.mutate({ id: a.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Alert History */}
        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
              <Bell className="h-8 w-8 text-gray-300" />
              <div className="text-sm font-medium">No alerts sent yet</div>
              <div className="text-xs">Run a scan and click "Alert" on any confluence result</div>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Price</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Fib</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">EMA</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Channels</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-border hover:bg-accent/30">
                      <td className="px-3 py-2.5 font-bold text-sm">{h.ticker}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(h.currentPrice)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs font-medium text-green-700">{h.fibLevel}%</span>
                        <div className="text-[10px] text-muted-foreground">{fmt(h.fibPrice)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs font-medium text-blue-700">EMA-{h.emaPeriod}</span>
                        <div className="text-[10px] text-muted-foreground">{fmt(h.emaPrice)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {h.notifiedEmail && <Mail className="h-3.5 w-3.5 text-blue-500" />}
                          {h.notifiedPush && <Bell className="h-3.5 w-3.5 text-green-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                        {new Date(h.scannedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddAlertDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => alertsQuery.refetch()}
      />
    </div>
  );
}
