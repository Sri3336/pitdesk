import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, AlertTriangle, Plus, CheckCircle2, XCircle, Minus, Clock, Settings, BookOpen, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

const SETUP_LABELS: Record<string, { label: string; color: string; description: string }> = {
  ORB: {
    label: "Opening Range Breakout",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    description: "9:30–9:45 AM range. Enter on 5-min close above/below OR with 1.5× volume.",
  },
  GAP_GO: {
    label: "Gap & Go",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Gap ≥1.5% with catalyst. Enter on first pullback to VWAP or OR high.",
  },
  VWAP_RECLAIM: {
    label: "VWAP Reclaim",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Price dips below VWAP then reclaims with volume. Bullish continuation.",
  },
};

const STATUS_CONFIG = {
  ACTIVE: { label: "Active", icon: Clock, color: "bg-blue-100 text-blue-700" },
  WIN: { label: "Win", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  LOSS: { label: "Loss", icon: XCircle, color: "bg-red-100 text-red-700" },
  SCRATCH: { label: "Scratch", icon: Minus, color: "bg-gray-100 text-gray-600" },
};

function pnlColor(pnl: number) {
  if (pnl > 0) return "text-green-600";
  if (pnl < 0) return "text-red-600";
  return "text-gray-500";
}

// ─── Add Trade Form ───────────────────────────────────────────────────────────

function AddTradeDialog({ onAdded, accountSize, maxRiskPerTrade }: {
  onAdded: () => void;
  accountSize: number;
  maxRiskPerTrade: number;
}) {
  const [open, setOpen] = useState(false);
  const todayStr = useMemo(() => today(), []);
  const { data: lastTradeData } = trpc.duxScanner.lastTradeResult.useQuery(
    { date: todayStr },
    { enabled: open }
  );
  const sizeDownActive = lastTradeData?.isLoss && lastTradeData.sizeDownPct > 0;
  const effectiveMaxRisk = sizeDownActive
    ? maxRiskPerTrade * (1 - lastTradeData!.sizeDownPct / 100)
    : maxRiskPerTrade;
  const [form, setForm] = useState({
    ticker: "",
    setupType: "ORB" as "ORB" | "GAP_GO" | "VWAP_RECLAIM",
    direction: "LONG" as "LONG" | "SHORT",
    entryPrice: "",
    stopPrice: "",
    targetPrice: "",
    notes: "",
    nearRetailZone: false,
    liquidityContext: "none" as string,
    liquidityNotes: "",
  });

  const addTrade = trpc.morningSession.addTrade.useMutation({
    onSuccess: () => {
      toast.success("Trade logged");
      setOpen(false);
      setForm({ ticker: "", setupType: "ORB", direction: "LONG", entryPrice: "", stopPrice: "", targetPrice: "", notes: "", nearRetailZone: false, liquidityContext: "none", liquidityNotes: "" });
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const entry = parseFloat(form.entryPrice) || 0;
  const stop = parseFloat(form.stopPrice) || 0;
  const target = parseFloat(form.targetPrice) || 0;
  const riskPerShare = entry && stop ? Math.abs(entry - stop) : 0;
  const shares = riskPerShare > 0 ? Math.floor(effectiveMaxRisk / riskPerShare) : 0;
  const rr = riskPerShare > 0 && target ? (Math.abs(target - entry) / riskPerShare).toFixed(2) : "—";
  const riskAmt = riskPerShare > 0 ? (riskPerShare * shares).toFixed(0) : "—";

  const isValid = form.ticker && entry > 0 && stop > 0 && target > 0 && shares > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Log Trade
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Morning Trade</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Ticker + Setup */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ticker</Label>
              <Input
                placeholder="NVDA"
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Setup</Label>
              <Select value={form.setupType} onValueChange={(v) => setForm((f) => ({ ...f, setupType: v as any }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORB">ORB</SelectItem>
                  <SelectItem value="GAP_GO">Gap & Go</SelectItem>
                  <SelectItem value="VWAP_RECLAIM">VWAP Reclaim</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Setup description */}
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {SETUP_LABELS[form.setupType].description}
          </div>

          {/* Direction */}
          <div className="flex gap-2">
            <Button
              variant={form.direction === "LONG" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={() => setForm((f) => ({ ...f, direction: "LONG" }))}
            >
              <TrendingUp className="h-4 w-4" /> Long
            </Button>
            <Button
              variant={form.direction === "SHORT" ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={() => setForm((f) => ({ ...f, direction: "SHORT" }))}
            >
              <TrendingDown className="h-4 w-4" /> Short
            </Button>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Entry $</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.entryPrice}
                onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Stop $</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.stopPrice}
                onChange={(e) => setForm((f) => ({ ...f, stopPrice: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Target $</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.targetPrice}
                onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))} className="mt-1" />
            </div>
          </div>

          {/* Auto-calculated position size */}
          {entry > 0 && stop > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Shares</div>
                  <div className="font-bold text-lg">{shares > 0 ? shares : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Risk $</div>
                  <div className="font-bold text-lg text-red-600">${riskAmt}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">R:R</div>
                  <div className={`font-bold text-lg ${parseFloat(rr) >= 2 ? "text-green-600" : "text-amber-600"}`}>{rr}:1</div>
                </div>
              </div>
              {parseFloat(rr) < 2 && target > 0 && (
                <p className="mt-2 text-xs text-amber-600 text-center">⚠ R:R below 2:1 — consider adjusting target</p>
              )}
            </div>
          )}

          <div>
            <Label>Notes (optional)</Label>
            <Textarea placeholder="Catalyst, volume note, setup quality..." value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1 h-20" />
          </div>

          {/* Dux Size-Down Banner */}
          {sizeDownActive && lastTradeData?.lastTrade && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-yellow-800">⚠ Previous trade was a loss — size reduced 50%</p>
                <p className="text-yellow-700 text-xs mt-0.5">
                  Last trade: {lastTradeData.lastTrade.ticker} {lastTradeData.lastTrade.setupType} → ${parseFloat(String(lastTradeData.lastTrade.pnl ?? "0")).toFixed(2)}
                </p>
                <p className="text-yellow-700 text-xs">Dux rule: after a loss, cut position size by 50% on next trade.</p>
                <p className="text-yellow-600 text-xs font-medium mt-1">Effective max risk: ${effectiveMaxRisk.toFixed(0)} (was ${maxRiskPerTrade.toFixed(0)})</p>
              </div>
            </div>
          )}

          {/* AJ Liquidity Context */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">Near Retail Zone?</span>
              </div>
              <Switch
                checked={form.nearRetailZone}
                onCheckedChange={(v) => setForm((f) => ({ ...f, nearRetailZone: v }))}
              />
            </div>
            {form.nearRetailZone && (
              <>
                <div>
                  <Label className="text-xs text-amber-700">Zone Type</Label>
                  <Select value={form.liquidityContext} onValueChange={(v) => setForm((f) => ({ ...f, liquidityContext: v }))}>
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Select zone type —</SelectItem>
                      <SelectItem value="resistance">Resistance</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="supply">Supply Zone</SelectItem>
                      <SelectItem value="demand">Demand Zone</SelectItem>
                      <SelectItem value="trendline">Trendline</SelectItem>
                      <SelectItem value="fibonacci">Fibonacci</SelectItem>
                      <SelectItem value="vwap">VWAP</SelectItem>
                      <SelectItem value="previous_high">Previous High</SelectItem>
                      <SelectItem value="previous_low">Previous Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-amber-700">Liquidity Note (optional)</Label>
                  <Input
                    className="mt-1 h-8 text-xs"
                    placeholder="e.g. 3-touch weekly resistance, heavy OI at $185"
                    value={form.liquidityNotes}
                    onChange={(e) => setForm((f) => ({ ...f, liquidityNotes: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-amber-600">💡 AJ: Breakout at a retail zone = higher conviction. Institutions sweep stops here before reversing.</p>
              </>
            )}
          </div>

          <Button
            className="w-full"
            disabled={!isValid || addTrade.isPending}
            onClick={() => addTrade.mutate({
              date: today(),
              ticker: form.ticker,
              setupType: form.setupType,
              direction: form.direction,
              entryPrice: entry,
              stopPrice: stop,
              targetPrice: target,
              shares,
              notes: form.notes || undefined,
              nearRetailZone: form.nearRetailZone,
              liquidityContext: form.nearRetailZone && form.liquidityContext !== "none" ? form.liquidityContext as any : undefined,
              liquidityNotes: form.nearRetailZone && form.liquidityNotes ? form.liquidityNotes : undefined,
            })}
          >
            {addTrade.isPending ? "Logging..." : "Log Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close Trade Dialog ───────────────────────────────────────────────────────

function CloseTradeDialog({ trade, onClosed }: { trade: any; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [notes, setNotes] = useState("");

  const closeTrade = trpc.morningSession.closeTrade.useMutation({
    onSuccess: (data) => {
      toast.success(`Trade closed — P&L: $${data.pnl.toFixed(2)}`);
      setOpen(false);
      onClosed();
    },
    onError: (e) => toast.error(e.message),
  });

  const ep = parseFloat(exitPrice) || 0;
  const entry = parseFloat(String(trade.entryPrice));
  const pnl = ep && entry
    ? (trade.direction === "LONG" ? (ep - entry) : (entry - ep)) * trade.shares
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Close</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close {trade.ticker} Trade</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Exit Price $</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)} className="mt-1" />
          </div>
          {pnl !== null && (
            <div className={`text-center text-2xl font-bold ${pnlColor(pnl)}`}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </div>
          )}
          <div>
            <Label>Notes (optional)</Label>
            <Textarea placeholder="What happened?" value={notes}
              onChange={(e) => setNotes(e.target.value)} className="mt-1 h-16" />
          </div>
          <Button className="w-full" disabled={!ep || closeTrade.isPending}
            onClick={() => closeTrade.mutate({ id: trade.id, exitPrice: ep, notes: notes || undefined })}>
            {closeTrade.isPending ? "Closing..." : "Confirm Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings Dialog ──────────────────────────────────────────────────────────

function SettingsDialog({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    accountSize: String(settings?.accountSize ?? "350000"),
    maxRiskPerTradePct: String(settings?.maxRiskPerTradePct ?? "1.00"),
    dailyLossLimitPct: String(settings?.dailyLossLimitPct ?? "2.00"),
    maxTradesPerDay: String(settings?.maxTradesPerDay ?? "3"),
    swingRiskPerTradePct: String(settings?.swingRiskPerTradePct ?? "1.50"),
    maxConcurrentSwings: String(settings?.maxConcurrentSwings ?? "3"),
  });

  const save = trpc.morningSession.saveSettings.useMutation({
    onSuccess: () => { toast.success("Settings saved"); setOpen(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const acct = parseFloat(form.accountSize) || 350000;
  const riskPct = parseFloat(form.maxRiskPerTradePct) || 1;
  const dailyPct = parseFloat(form.dailyLossLimitPct) || 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2"><Settings className="h-4 w-4" /> Settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Session Settings</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Account Size ($)</Label>
            <Input type="number" value={form.accountSize} onChange={(e) => setForm(f => ({ ...f, accountSize: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max Risk / Trade (%)</Label>
              <Input type="number" step="0.1" value={form.maxRiskPerTradePct} onChange={(e) => setForm(f => ({ ...f, maxRiskPerTradePct: e.target.value }))} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">${((acct * riskPct) / 100).toFixed(0)} per trade</p>
            </div>
            <div>
              <Label>Daily Loss Limit (%)</Label>
              <Input type="number" step="0.1" value={form.dailyLossLimitPct} onChange={(e) => setForm(f => ({ ...f, dailyLossLimitPct: e.target.value }))} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">${((acct * dailyPct) / 100).toFixed(0)} max loss</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max Trades / Day</Label>
              <Input type="number" min="1" max="10" value={form.maxTradesPerDay} onChange={(e) => setForm(f => ({ ...f, maxTradesPerDay: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Swing Risk / Trade (%)</Label>
              <Input type="number" step="0.1" value={form.swingRiskPerTradePct} onChange={(e) => setForm(f => ({ ...f, swingRiskPerTradePct: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <Button className="w-full" disabled={save.isPending}
            onClick={() => save.mutate({
              accountSize: acct,
              maxRiskPerTradePct: riskPct,
              dailyLossLimitPct: dailyPct,
              maxTradesPerDay: parseInt(form.maxTradesPerDay) || 3,
              swingRiskPerTradePct: parseFloat(form.swingRiskPerTradePct) || 1.5,
              maxConcurrentSwings: parseInt(form.maxConcurrentSwings) || 3,
            })}>
            {save.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MorningSession() {
  const [tab, setTab] = useState("today");
  const todayStr = useMemo(() => today(), []);

  const utils = trpc.useUtils();
  const { data: summary, isLoading } = trpc.morningSession.sessionSummary.useQuery({ date: todayStr });
  const { data: history } = trpc.morningSession.history.useQuery();
  const { data: settings } = trpc.morningSession.getSettings.useQuery();
  const { data: perfectTrader } = trpc.duxScanner.perfectTrader.useQuery(
    {},
    { enabled: tab === "history", staleTime: 5 * 60 * 1000 }
  );

  const refresh = () => {
    utils.morningSession.sessionSummary.invalidate();
    utils.morningSession.history.invalidate();
  };

  const accountSize = parseFloat(String(settings?.accountSize ?? "350000"));
  const maxRiskPerTrade = parseFloat(String(settings?.maxRiskPerTradePct ?? "1")) / 100 * accountSize;
  const dailyLossLimit = parseFloat(String(settings?.dailyLossLimitPct ?? "2")) / 100 * accountSize;

  const sessionPnl = summary?.sessionPnl ?? 0;
  const tradesCount = summary?.tradesCount ?? 0;
  const wins = summary?.wins ?? 0;
  const losses = summary?.losses ?? 0;
  const isLimitHit = summary?.isLimitHit ?? false;
  const isMaxTradesHit = summary?.isMaxTradesHit ?? false;

  // History stats
  const historyStats = useMemo(() => {
    if (!history) return null;
    const closed = history.filter((t) => t.status !== "ACTIVE");
    const totalPnl = closed.reduce((s, t) => s + parseFloat(String(t.pnl ?? "0")), 0);
    const winCount = closed.filter((t) => t.status === "WIN").length;
    const winRate = closed.length > 0 ? (winCount / closed.length) * 100 : 0;
    const bySetup: Record<string, { wins: number; total: number; pnl: number }> = {};
    for (const t of closed) {
      if (!bySetup[t.setupType]) bySetup[t.setupType] = { wins: 0, total: 0, pnl: 0 };
      bySetup[t.setupType].total++;
      bySetup[t.setupType].pnl += parseFloat(String(t.pnl ?? "0"));
      if (t.status === "WIN") bySetup[t.setupType].wins++;
    }
    return { totalPnl, winRate, winCount, total: closed.length, bySetup };
  }, [history]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Morning Session</h1>
          <p className="text-sm text-muted-foreground mt-1">9:30 – 11:30 AM EST · ORB · Gap & Go · VWAP Reclaim</p>
        </div>
        <div className="flex items-center gap-2">
          {settings && <SettingsDialog settings={settings} onSaved={refresh} />}
          {!isLimitHit && !isMaxTradesHit && (
            <AddTradeDialog onAdded={refresh} accountSize={accountSize} maxRiskPerTrade={maxRiskPerTrade} />
          )}
        </div>
      </div>

      {/* Kill switch banners */}
      {isLimitHit && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Daily Loss Limit Hit — Stop Trading</p>
            <p className="text-sm text-red-700">You've reached your ${dailyLossLimit.toFixed(0)} daily max loss. No more trades today.</p>
          </div>
        </div>
      )}
      {isMaxTradesHit && !isLimitHit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Max Trades Reached — Session Complete</p>
            <p className="text-sm text-amber-700">You've taken {settings?.maxTradesPerDay} trades today. Step away and review.</p>
          </div>
        </div>
      )}

      {/* Session KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Session P&L</p>
            <p className={`text-2xl font-bold mt-1 ${pnlColor(sessionPnl)}`}>
              {sessionPnl >= 0 ? "+" : ""}${sessionPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Trades</p>
            <p className="text-2xl font-bold mt-1">{tradesCount} <span className="text-sm text-muted-foreground">/ {settings?.maxTradesPerDay ?? 3}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">W / L</p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-600">{wins}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-red-600">{losses}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Daily Limit Used</p>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className={pnlColor(sessionPnl)}>${Math.abs(sessionPnl).toFixed(0)}</span>
                <span className="text-muted-foreground">${dailyLossLimit.toFixed(0)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${sessionPnl < 0 ? (Math.abs(sessionPnl) / dailyLossLimit > 0.8 ? "bg-red-500" : "bg-amber-400") : "bg-green-500"}`}
                  style={{ width: `${Math.min(100, (Math.abs(sessionPnl) / dailyLossLimit) * 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Rule Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(SETUP_LABELS).map(([key, cfg]) => (
          <Card key={key} className="border-l-4 border-l-primary/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Badge className={cfg.color}>{cfg.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
              {historyStats?.bySetup[key] && (
                <div className="mt-3 flex gap-4 text-xs">
                  <span className="text-green-600 font-medium">
                    {((historyStats.bySetup[key].wins / historyStats.bySetup[key].total) * 100).toFixed(0)}% WR
                  </span>
                  <span className={pnlColor(historyStats.bySetup[key].pnl)}>
                    ${historyStats.bySetup[key].pnl.toFixed(0)} total
                  </span>
                  <span className="text-muted-foreground">{historyStats.bySetup[key].total} trades</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Today / History */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="today">Today's Trades</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        {/* Today */}
        <TabsContent value="today" className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : !summary?.trades?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No trades logged today</p>
              <p className="text-sm mt-1">Use "Log Trade" to record your first trade of the session.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.trades.map((trade) => {
                const cfg = STATUS_CONFIG[trade.status as keyof typeof STATUS_CONFIG];
                const Icon = cfg.icon;
                const pnl = parseFloat(String(trade.pnl ?? "0"));
                return (
                  <Card key={trade.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-bold">{trade.ticker}</div>
                          <Badge className={SETUP_LABELS[trade.setupType].color}>
                            {trade.setupType === "GAP_GO" ? "Gap & Go" : trade.setupType === "VWAP_RECLAIM" ? "VWAP" : "ORB"}
                          </Badge>
                          <Badge variant={trade.direction === "LONG" ? "default" : "secondary"}>
                            {trade.direction === "LONG" ? "↑ Long" : "↓ Short"}
                          </Badge>
                          <Badge className={cfg.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          {trade.status !== "ACTIVE" && (
                            <span className={`font-bold ${pnlColor(pnl)}`}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </span>
                          )}
                          {trade.status === "ACTIVE" && (
                            <CloseTradeDialog trade={trade} onClosed={refresh} />
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        <span>Entry: ${parseFloat(String(trade.entryPrice)).toFixed(2)}</span>
                        <span>Stop: ${parseFloat(String(trade.stopPrice)).toFixed(2)}</span>
                        <span>Target: ${parseFloat(String(trade.targetPrice)).toFixed(2)}</span>
                        <span>{trade.shares} shares</span>
                        <span>Risk: ${parseFloat(String(trade.riskAmount)).toFixed(0)}</span>
                        <span>R:R {parseFloat(String(trade.rrRatio)).toFixed(1)}:1</span>
                      </div>
                      {trade.notes && (
                        <p className="mt-2 text-xs text-muted-foreground italic">{trade.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          {/* Perfect Trader Calculator */}
          {perfectTrader && perfectTrader.tradeCount > 0 && (
            <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🎯</span>
                <h3 className="font-semibold text-orange-900">Perfect Trader Calculator</h3>
                <span className="text-xs text-orange-600 ml-auto">Based on {perfectTrader.tradeCount} closed trades</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="bg-white rounded-lg p-3 text-center border border-orange-100">
                  <div className="text-xs text-muted-foreground">Actual P&L</div>
                  <div className={`text-lg font-bold ${perfectTrader.actualPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {perfectTrader.actualPnl >= 0 ? "+" : ""}${perfectTrader.actualPnl.toFixed(0)}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-orange-100">
                  <div className="text-xs text-muted-foreground">Ideal P&L</div>
                  <div className="text-lg font-bold text-blue-600">${perfectTrader.idealPnl.toFixed(0)}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-orange-100">
                  <div className="text-xs text-muted-foreground">Left on Table</div>
                  <div className="text-lg font-bold text-amber-600">${perfectTrader.leftOnTable.toFixed(0)}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-orange-100">
                  <div className="text-xs text-muted-foreground">Execution Score</div>
                  <div className={`text-lg font-bold ${
                    perfectTrader.overallExecutionScore >= 80 ? "text-green-600" :
                    perfectTrader.overallExecutionScore >= 60 ? "text-amber-600" : "text-red-600"
                  }`}>{perfectTrader.overallExecutionScore}%</div>
                </div>
              </div>
              <div className="text-xs text-orange-700 bg-orange-100 rounded-lg px-3 py-2">
                <span className="font-medium">What this means:</span> If you had entered at the OR high and exited at exactly 2× range every time, you would have made ${perfectTrader.idealPnl.toFixed(0)}. You actually made ${perfectTrader.actualPnl.toFixed(0)}. The ${perfectTrader.leftOnTable.toFixed(0)} gap is your execution cost.
              </div>
            </div>
          )}
          {!history?.length ? (
            <div className="text-center py-12 text-muted-foreground">No trade history yet.</div>
          ) : (
            <div className="space-y-2">
              {/* Stats summary */}
              {historyStats && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Card><CardContent className="pt-4 text-center">
                    <p className="text-xs text-muted-foreground">Total P&L</p>
                    <p className={`text-xl font-bold ${pnlColor(historyStats.totalPnl)}`}>
                      {historyStats.totalPnl >= 0 ? "+" : ""}${historyStats.totalPnl.toFixed(2)}
                    </p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4 text-center">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-bold text-green-600">{historyStats.winRate.toFixed(1)}%</p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Trades</p>
                    <p className="text-xl font-bold">{historyStats.total}</p>
                  </CardContent></Card>
                </div>
              )}
              {/* Trade rows */}
              {history.filter((t) => t.status !== "ACTIVE").map((trade) => {
                const cfg = STATUS_CONFIG[trade.status as keyof typeof STATUS_CONFIG];
                const Icon = cfg.icon;
                const pnl = parseFloat(String(trade.pnl ?? "0"));
                return (
                  <div key={trade.id} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-bold w-16">{trade.ticker}</span>
                      <span className="text-muted-foreground">{trade.date}</span>
                      <Badge className={SETUP_LABELS[trade.setupType].color} variant="outline">
                        {trade.setupType === "GAP_GO" ? "Gap & Go" : trade.setupType === "VWAP_RECLAIM" ? "VWAP" : "ORB"}
                      </Badge>
                      <Badge className={cfg.color}>
                        <Icon className="h-3 w-3 mr-1" />{cfg.label}
                      </Badge>
                    </div>
                    <span className={`font-bold ${pnlColor(pnl)}`}>
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Morning Session Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <h3 className="font-semibold text-base">Entry Rules</h3>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Never trade the first 5 minutes (9:30–9:35 AM) — wait for the OR to form</li>
                  <li>ORB: 15-min opening range. Enter on 5-min candle CLOSE above/below OR, not on touch</li>
                  <li>Volume confirmation required: breakout candle must be ≥1.5× the average of the 3 OR candles</li>
                  <li>Gap & Go: Gap ≥1.5% with a catalyst. Enter on first VWAP touch or OR high reclaim</li>
                  <li>VWAP Reclaim: Price dips below VWAP then reclaims with a green candle and volume surge</li>
                  <li>Minimum R:R = 2:1 before entry. If target doesn't give 2:1, skip the trade</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-base">Exit Rules</h3>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Hard stop: below OR low (long) or above OR high (short) — no exceptions</li>
                  <li>Time stop: all positions closed by 11:30 AM regardless of P&L</li>
                  <li>Partial exit at 1:1 (move stop to breakeven), let rest run to target</li>
                  <li>If price stalls at VWAP for 2+ candles after entry, exit — momentum is gone</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-base">Risk Rules (Rajan 33% Rule)</h3>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Max risk per trade: 1% of account (${(accountSize * 0.01).toFixed(0)})</li>
                  <li>Daily loss limit: 2% of account (${(accountSize * 0.02).toFixed(0)}) — stop immediately when hit</li>
                  <li>Max 3 trades per session — quality over quantity</li>
                  <li>VIX &gt;20: reduce size by 25%. VIX &gt;25: skip ORB, only Gap & Go with strong catalyst</li>
                  <li>After 2 consecutive losses: stop for the day, no exceptions</li>
                  <li>Never average down on a losing position</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-base">Avoid These</h3>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Earnings day (binary event — skip unless Gap & Go with clear direction)</li>
                  <li>VIX &gt;30 (too wide, stops get blown)</li>
                  <li>Tickers under $10 (wide spreads, low float manipulation)</li>
                  <li>Chasing: if you missed the entry, wait for the next setup — don't FOMO in</li>
                  <li>Revenge trading after a loss — walk away for 30 minutes</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
