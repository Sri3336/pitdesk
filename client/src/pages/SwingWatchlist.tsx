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
import {
  Plus, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, Minus,
  BookOpen, AlertTriangle, Eye
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

const SETUP_CONFIG: Record<string, { label: string; color: string; description: string; rules: string[] }> = {
  POST_EARNINGS: {
    label: "Post-Earnings",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    description: "Buy the dip after a strong earnings beat. Enter 1–3 days after report.",
    rules: [
      "Stock beat EPS and revenue estimates",
      "Gap-up held or only partially filled",
      "Enter on first pullback to 8 EMA or prior resistance-turned-support",
      "Hold 2–3 days max — earnings momentum fades fast",
      "Stop: below the earnings gap day low",
    ],
  },
  CATALYST_BREAKOUT: {
    label: "Catalyst Breakout",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Breakout from consolidation on news/upgrade/product catalyst.",
    rules: [
      "Clear catalyst: analyst upgrade, product launch, contract win, FDA approval",
      "Price breaking above multi-week resistance with 2× average volume",
      "Enter on the breakout candle or first pullback to breakout level",
      "Stop: below the breakout base",
      "Target: measured move (height of base added to breakout point)",
    ],
  },
  VCP: {
    label: "VCP",
    color: "bg-green-100 text-green-800 border-green-200",
    description: "Volatility Contraction Pattern — tight pivot breakout.",
    rules: [
      "3+ contractions in price and volume (each smaller than the last)",
      "Final contraction: price range ≤2%, volume dries up to multi-week low",
      "Enter on pivot breakout with volume surge ≥50% above 50-day avg",
      "Stop: below the pivot low (tight — 2–3%)",
      "Target: 10–20% in 2–5 days",
    ],
  },
  GAP_FILL: {
    label: "Gap Fill",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Mean reversion: stock gaps down, fill the gap over 2–3 days.",
    rules: [
      "Gap down ≥3% on no fundamental change (sector rotation, market sell-off)",
      "Stock is in a longer-term uptrend (above 50-day MA)",
      "Enter when price stabilizes and forms a reversal candle",
      "Stop: below the gap-down day low",
      "Target: top of the gap (prior close before gap)",
    ],
  },
};

const STATUS_CONFIG = {
  WATCHING: { label: "Watching", icon: Eye, color: "bg-gray-100 text-gray-600" },
  ACTIVE: { label: "Active", icon: Clock, color: "bg-blue-100 text-blue-700" },
  WIN: { label: "Win", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  LOSS: { label: "Loss", icon: XCircle, color: "bg-red-100 text-red-700" },
  SCRATCH: { label: "Scratch", icon: Minus, color: "bg-gray-100 text-gray-600" },
  EXPIRED: { label: "Expired", icon: AlertTriangle, color: "bg-amber-100 text-amber-700" },
};

const ACCOUNT_LABELS: Record<string, string> = {
  etrade_4723: "E*TRADE -4723",
  etrade_2738: "E*TRADE -2738",
  schwab: "Schwab",
};

function pnlColor(pnl: number) {
  if (pnl > 0) return "text-green-600";
  if (pnl < 0) return "text-red-600";
  return "text-gray-500";
}

function dayBadge(dayCount: number, status: string) {
  if (status !== "ACTIVE") return null;
  if (dayCount <= 1) return <Badge className="bg-green-100 text-green-700">D{dayCount}</Badge>;
  if (dayCount === 2) return <Badge className="bg-amber-100 text-amber-700">D2 ⚠</Badge>;
  return <Badge className="bg-red-100 text-red-700">D{dayCount} — Time Stop!</Badge>;
}

// ─── Add Setup Dialog ─────────────────────────────────────────────────────────

function AddSetupDialog({ onAdded, accountSize, swingRiskPct }: {
  onAdded: () => void;
  accountSize: number;
  swingRiskPct: number;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    setupType: "VCP" as "POST_EARNINGS" | "CATALYST_BREAKOUT" | "VCP" | "GAP_FILL",
    direction: "LONG" as "LONG" | "SHORT",
    entryPrice: "",
    stopPrice: "",
    targetPrice: "",
    accountId: "etrade_4723",
    notes: "",
  });

  const addSetup = trpc.swingWatchlist.addSetup.useMutation({
    onSuccess: () => {
      toast.success("Setup added to watchlist");
      setOpen(false);
      setForm({ ticker: "", setupType: "VCP", direction: "LONG", entryPrice: "", stopPrice: "", targetPrice: "", accountId: "etrade_4723", notes: "" });
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const entry = parseFloat(form.entryPrice) || 0;
  const stop = parseFloat(form.stopPrice) || 0;
  const target = parseFloat(form.targetPrice) || 0;
  const maxRisk = (accountSize * swingRiskPct) / 100;
  const riskPerShare = entry && stop ? Math.abs(entry - stop) : 0;
  const shares = riskPerShare > 0 ? Math.floor(maxRisk / riskPerShare) : 0;
  const rr = riskPerShare > 0 && target ? (Math.abs(target - entry) / riskPerShare).toFixed(2) : "—";
  const riskAmt = riskPerShare > 0 ? (riskPerShare * shares).toFixed(0) : "—";
  const positionValue = shares > 0 && entry > 0 ? (shares * entry).toFixed(0) : "—";

  const isValid = form.ticker && entry > 0 && stop > 0 && target > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Setup</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Swing Setup</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ticker</Label>
              <Input placeholder="NVDA" value={form.ticker}
                onChange={(e) => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} className="mt-1" />
            </div>
            <div>
              <Label>Setup Type</Label>
              <Select value={form.setupType} onValueChange={(v) => setForm(f => ({ ...f, setupType: v as any }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VCP">VCP</SelectItem>
                  <SelectItem value="CATALYST_BREAKOUT">Catalyst Breakout</SelectItem>
                  <SelectItem value="POST_EARNINGS">Post-Earnings</SelectItem>
                  <SelectItem value="GAP_FILL">Gap Fill</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {SETUP_CONFIG[form.setupType].description}
          </div>

          <div className="flex gap-2">
            <Button variant={form.direction === "LONG" ? "default" : "outline"} className="flex-1 gap-2"
              onClick={() => setForm(f => ({ ...f, direction: "LONG" }))}>
              <TrendingUp className="h-4 w-4" /> Long
            </Button>
            <Button variant={form.direction === "SHORT" ? "default" : "outline"} className="flex-1 gap-2"
              onClick={() => setForm(f => ({ ...f, direction: "SHORT" }))}>
              <TrendingDown className="h-4 w-4" /> Short
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Entry $</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.entryPrice}
                onChange={(e) => setForm(f => ({ ...f, entryPrice: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Stop $</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.stopPrice}
                onChange={(e) => setForm(f => ({ ...f, stopPrice: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Target $</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.targetPrice}
                onChange={(e) => setForm(f => ({ ...f, targetPrice: e.target.value }))} className="mt-1" />
            </div>
          </div>

          {entry > 0 && stop > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="grid grid-cols-4 gap-2 text-center">
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
                <div>
                  <div className="text-xs text-muted-foreground">Position</div>
                  <div className="font-bold text-lg">${positionValue}</div>
                </div>
              </div>
              {parseFloat(rr) < 2 && target > 0 && (
                <p className="mt-2 text-xs text-amber-600 text-center">⚠ R:R below 2:1 — adjust target</p>
              )}
            </div>
          )}

          <div>
            <Label>Account</Label>
            <Select value={form.accountId} onValueChange={(v) => setForm(f => ({ ...f, accountId: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="etrade_4723">E*TRADE -4723</SelectItem>
                <SelectItem value="etrade_2738">E*TRADE -2738</SelectItem>
                <SelectItem value="schwab">Schwab</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea placeholder="Catalyst, setup quality, why this ticker..." value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 h-20" />
          </div>

          <Button className="w-full" disabled={!isValid || addSetup.isPending}
            onClick={() => addSetup.mutate({
              ticker: form.ticker,
              setupType: form.setupType,
              direction: form.direction,
              entryPrice: entry,
              stopPrice: stop,
              targetPrice: target,
              accountId: form.accountId,
              notes: form.notes || undefined,
            })}>
            {addSetup.isPending ? "Adding..." : "Add to Watchlist"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close Setup Dialog ───────────────────────────────────────────────────────

function CloseSetupDialog({ entry: setup, onClosed }: { entry: any; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [notes, setNotes] = useState("");

  const closeSetup = trpc.swingWatchlist.closeSetup.useMutation({
    onSuccess: (data) => {
      toast.success(`Closed — P&L: $${data.pnl.toFixed(2)}`);
      setOpen(false);
      onClosed();
    },
    onError: (e) => toast.error(e.message),
  });

  const ep = parseFloat(exitPrice) || 0;
  const entryPrice = parseFloat(String(setup.entryPrice));
  const pnl = ep && entryPrice
    ? (setup.direction === "LONG" ? (ep - entryPrice) : (entryPrice - ep)) * setup.shares
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Close</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close {setup.ticker}</DialogTitle></DialogHeader>
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
            <Label>Notes</Label>
            <Textarea placeholder="Exit reason..." value={notes}
              onChange={(e) => setNotes(e.target.value)} className="mt-1 h-16" />
          </div>
          <Button className="w-full" disabled={!ep || closeSetup.isPending}
            onClick={() => closeSetup.mutate({ id: setup.id, exitPrice: ep, exitDate: today(), notes: notes || undefined })}>
            {closeSetup.isPending ? "Closing..." : "Confirm Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Activate Setup Dialog ────────────────────────────────────────────────────

function ActivateDialog({ entry: setup, onActivated }: { entry: any; onActivated: () => void }) {
  const [open, setOpen] = useState(false);
  const [entryPrice, setEntryPrice] = useState(String(setup.entryPrice));

  const activate = trpc.swingWatchlist.activateSetup.useMutation({
    onSuccess: () => {
      toast.success(`${setup.ticker} activated — Day 1 starts now`);
      setOpen(false);
      onActivated();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><TrendingUp className="h-3 w-3" /> Enter</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Enter {setup.ticker}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Actual Entry Price $</Label>
            <Input type="number" step="0.01" value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)} className="mt-1" />
          </div>
          <div className="rounded-lg bg-muted/30 p-3 text-sm text-center">
            <p className="text-muted-foreground">Day counter starts today. Exit by Day 3.</p>
          </div>
          <Button className="w-full" disabled={activate.isPending}
            onClick={() => activate.mutate({
              id: setup.id,
              entryDate: today(),
              entryPrice: parseFloat(entryPrice) || undefined,
            })}>
            {activate.isPending ? "Activating..." : "Confirm Entry"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Setup Card ───────────────────────────────────────────────────────────────

function SetupCard({ setup, onRefresh }: { setup: any; onRefresh: () => void }) {
  const cfg = STATUS_CONFIG[setup.status as keyof typeof STATUS_CONFIG];
  const Icon = cfg.icon;
  const setupCfg = SETUP_CONFIG[setup.setupType];
  const pnl = parseFloat(String(setup.pnl ?? "0"));
  const entryPrice = parseFloat(String(setup.entryPrice));
  const stopPrice = parseFloat(String(setup.stopPrice));
  const targetPrice = parseFloat(String(setup.targetPrice));
  const rr = parseFloat(String(setup.rrRatio));

  const expireSetup = trpc.swingWatchlist.expireSetup.useMutation({
    onSuccess: () => { toast.info(`${setup.ticker} expired`); onRefresh(); },
  });

  return (
    <Card className={setup.dayCount >= 3 && setup.status === "ACTIVE" ? "border-red-300" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-lg font-bold">{setup.ticker}</span>
            <Badge className={setupCfg.color}>{setupCfg.label}</Badge>
            <Badge variant={setup.direction === "LONG" ? "default" : "secondary"}>
              {setup.direction === "LONG" ? "↑ Long" : "↓ Short"}
            </Badge>
            <Badge className={cfg.color}><Icon className="h-3 w-3 mr-1" />{cfg.label}</Badge>
            {dayBadge(setup.dayCount, setup.status)}
            {setup.accountId && (
              <Badge variant="outline" className="text-xs">{ACCOUNT_LABELS[setup.accountId] ?? setup.accountId}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {setup.status === "WATCHING" && <ActivateDialog entry={setup} onActivated={onRefresh} />}
            {setup.status === "ACTIVE" && (
              <>
                <CloseSetupDialog entry={setup} onClosed={onRefresh} />
                {setup.dayCount >= 3 && (
                  <Button size="sm" variant="ghost" className="text-amber-600"
                    onClick={() => expireSetup.mutate({ id: setup.id })}>
                    Expire
                  </Button>
                )}
              </>
            )}
            {["WIN", "LOSS", "SCRATCH", "EXPIRED"].includes(setup.status) && (
              <span className={`font-bold ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Entry: ${entryPrice.toFixed(2)}</span>
          <span>Stop: ${stopPrice.toFixed(2)}</span>
          <span>Target: ${targetPrice.toFixed(2)}</span>
          <span>{setup.shares} shares</span>
          <span>Risk: ${parseFloat(String(setup.riskAmount)).toFixed(0)}</span>
          <span className={rr >= 2 ? "text-green-600 font-medium" : "text-amber-600"}>R:R {rr.toFixed(1)}:1</span>
          {setup.entryDate && <span>Entered: {setup.entryDate}</span>}
        </div>

        {setup.notes && (
          <p className="mt-2 text-xs text-muted-foreground italic">{setup.notes}</p>
        )}

        {setup.dayCount >= 3 && setup.status === "ACTIVE" && (
          <div className="mt-2 rounded bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-700">
            ⏰ Day 3 time stop — exit today regardless of P&L
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SwingWatchlist() {
  const [tab, setTab] = useState("active");
  const [filterSetup, setFilterSetup] = useState("ALL");

  const utils = trpc.useUtils();
  const { data: watchlist, isLoading } = trpc.swingWatchlist.getWatchlist.useQuery();
  const { data: history } = trpc.swingWatchlist.getHistory.useQuery();
  const { data: stats } = trpc.swingWatchlist.getStats.useQuery();
  const { data: settings } = trpc.morningSession.getSettings.useQuery();

  const refresh = () => {
    utils.swingWatchlist.getWatchlist.invalidate();
    utils.swingWatchlist.getHistory.invalidate();
    utils.swingWatchlist.getStats.invalidate();
  };

  const accountSize = parseFloat(String(settings?.accountSize ?? "350000"));
  const swingRiskPct = parseFloat(String(settings?.swingRiskPerTradePct ?? "1.5"));

  const activeSetups = useMemo(
    () => (watchlist ?? []).filter((e) => e.status === "ACTIVE"),
    [watchlist]
  );
  const watchingSetups = useMemo(
    () => (watchlist ?? []).filter((e) => e.status === "WATCHING"),
    [watchlist]
  );
  const closedHistory = useMemo(
    () => (history ?? []).filter((e) => ["WIN", "LOSS", "SCRATCH", "EXPIRED"].includes(e.status)),
    [history]
  );

  const filteredHistory = useMemo(
    () => filterSetup === "ALL" ? closedHistory : closedHistory.filter((e) => e.setupType === filterSetup),
    [closedHistory, filterSetup]
  );

  const maxConcurrent = settings?.maxConcurrentSwings ?? 3;
  const isMaxHit = activeSetups.length >= maxConcurrent;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Swing Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-1">2–3 Day Swings · Post-Earnings · Catalyst · VCP · Gap Fill</p>
        </div>
        {!isMaxHit && (
          <AddSetupDialog onAdded={refresh} accountSize={accountSize} swingRiskPct={swingRiskPct} />
        )}
      </div>

      {/* Max concurrent warning */}
      {isMaxHit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Max Concurrent Swings Reached ({maxConcurrent})</p>
            <p className="text-sm text-amber-700">Close an existing position before adding a new setup.</p>
          </div>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-blue-600">{stats.activeCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Watching</p>
            <p className="text-2xl font-bold">{stats.watchingCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Closed</p>
            <p className="text-2xl font-bold">{stats.closedCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Total P&L</p>
            <p className={`text-2xl font-bold ${pnlColor(stats.totalPnl)}`}>
              {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(0)}
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            {stats.closedCount > 0 ? (
              <p className="text-2xl font-bold text-green-600">
                {((Object.values(stats.byType).reduce((s, t) => s + t.wins, 0) / stats.closedCount) * 100).toFixed(0)}%
              </p>
            ) : <p className="text-2xl font-bold text-muted-foreground">—</p>}
          </CardContent></Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active ({activeSetups.length})</TabsTrigger>
          <TabsTrigger value="watching">Watching ({watchingSetups.length})</TabsTrigger>
          <TabsTrigger value="history">History ({closedHistory.length})</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        {/* Active */}
        <TabsContent value="active" className="mt-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : !activeSetups.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No active swing trades</p>
              <p className="text-sm mt-1">Add a setup to the watchlist, then activate it when you enter.</p>
            </div>
          ) : (
            activeSetups.map((s) => <SetupCard key={s.id} setup={s} onRefresh={refresh} />)
          )}
        </TabsContent>

        {/* Watching */}
        <TabsContent value="watching" className="mt-4 space-y-3">
          {!watchingSetups.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Eye className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No setups on watchlist</p>
              <p className="text-sm mt-1">Add setups you're monitoring. Activate when you enter the trade.</p>
            </div>
          ) : (
            watchingSetups.map((s) => <SetupCard key={s.id} setup={s} onRefresh={refresh} />)
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          {/* Filter by setup type */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {["ALL", "VCP", "CATALYST_BREAKOUT", "POST_EARNINGS", "GAP_FILL"].map((type) => (
              <Button key={type} size="sm"
                variant={filterSetup === type ? "default" : "outline"}
                onClick={() => setFilterSetup(type)}>
                {type === "ALL" ? "All" : SETUP_CONFIG[type]?.label ?? type}
              </Button>
            ))}
          </div>

          {/* Per-type stats */}
          {stats && filterSetup !== "ALL" && stats.byType[filterSetup] && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-xl font-bold text-green-600">
                  {((stats.byType[filterSetup].wins / stats.byType[filterSetup].count) * 100).toFixed(0)}%
                </p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Total P&L</p>
                <p className={`text-xl font-bold ${pnlColor(stats.byType[filterSetup].totalPnl)}`}>
                  ${stats.byType[filterSetup].totalPnl.toFixed(0)}
                </p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Trades</p>
                <p className="text-xl font-bold">{stats.byType[filterSetup].count}</p>
              </CardContent></Card>
            </div>
          )}

          {!filteredHistory.length ? (
            <div className="text-center py-12 text-muted-foreground">No closed trades yet.</div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((s) => {
                const cfg = STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG];
                const Icon = cfg.icon;
                const pnl = parseFloat(String(s.pnl ?? "0"));
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold w-16">{s.ticker}</span>
                      <span className="text-muted-foreground">{s.entryDate ?? s.createdAt?.toString().split("T")[0]}</span>
                      <Badge className={SETUP_CONFIG[s.setupType].color}>{SETUP_CONFIG[s.setupType].label}</Badge>
                      <Badge className={cfg.color}><Icon className="h-3 w-3 mr-1" />{cfg.label}</Badge>
                      {s.exitDate && <span className="text-muted-foreground">→ {s.exitDate}</span>}
                    </div>
                    <span className={`font-bold ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(SETUP_CONFIG).map(([key, cfg]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4" />
                    <Badge className={cfg.color}>{cfg.label}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{cfg.description}</p>
                  <ul className="space-y-1.5 text-sm">
                    {cfg.rules.map((rule, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                        <span className="text-muted-foreground">{rule}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Universal swing rules */}
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Universal Swing Rules</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
                <li>Max 3 concurrent swing positions — focus beats diversification at this size</li>
                <li>Risk 1.5% of account per trade (${(accountSize * 0.015).toFixed(0)})</li>
                <li>Day 3 time stop: exit by end of Day 3 regardless of P&L — do not hold hoping for recovery</li>
                <li>If the stock hasn't moved toward target by Day 2, exit — the setup failed</li>
                <li>Never hold through earnings unless the setup IS the earnings play</li>
                <li>Minimum R:R 2:1 before entry — if target doesn't give 2:1, skip</li>
                <li>Partial exit at 1:1 (move stop to breakeven), let rest run to full target</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
