import { useState, useMemo } from "react";
import React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Target, BookOpen, Plus, CheckCircle, XCircle, AlertTriangle, DollarSign, BarChart3, Shield, Settings, Copy, RefreshCw, Key } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { id: "schwab_764", label: "Schwab ...764", color: "bg-blue-500" },
  { id: "etrade_4723", label: "E*TRADE -4723", color: "bg-purple-500" },
  { id: "etrade_2738", label: "E*TRADE -2738", color: "bg-orange-500" },
];

const STRATEGIES = [
  { value: "iron_condor", label: "Iron Condor", icon: "🦅", desc: "Defined risk, 4 legs, range-bound" },
  { value: "strangle", label: "Strangle", icon: "🔀", desc: "Naked, 2 legs, high IV crush" },
  { value: "naked_put", label: "Naked Put", icon: "📉", desc: "Bullish, want to own at lower price" },
  { value: "naked_call", label: "Naked Call", icon: "📈", desc: "Bearish, stock capped at resistance" },
  { value: "other", label: "Other", icon: "📋", desc: "Custom structure" },
];

const TICKERS = ["WDC", "TSLA", "NVDA", "LITE", "SMCI", "META", "AMZN", "PLTR", "OTHER"];

const TICKER_UNIVERSE = [
  { ticker: "WDC",  sector: "Storage / HDD",        catalyst: "Storage cycle, NAND pricing",          ivProfile: "80–100%", role: "core",   note: "You know it well — high IV, liquid" },
  { ticker: "TSLA", sector: "EV / Consumer",         catalyst: "Deliveries, Elon news, energy",        ivProfile: "80–120%", role: "core",   note: "Independent catalyst from hardware" },
  { ticker: "NVDA", sector: "AI / GPU",              catalyst: "AI capex, data center, earnings",      ivProfile: "60–90%",  role: "core",   note: "Highest options liquidity on earth" },
  { ticker: "LITE", sector: "Photonics / Telecom",   catalyst: "Optical interconnects, telecom capex", ivProfile: "70–100%", role: "core",   note: "Telecom cycle — not storage or GPU" },
  { ticker: "SMCI", sector: "AI Servers",            catalyst: "AI buildout, audit/accounting news",   ivProfile: "80–130%", role: "core",   note: "High IV, different from storage cycle" },
  { ticker: "META", sector: "Social / Ad-Tech",      catalyst: "Ad revenue, regulation, AI spend",     ivProfile: "50–80%",  role: "addon",  note: "Low correlation to hardware names" },
  { ticker: "AMZN", sector: "Cloud / Retail",        catalyst: "AWS, consumer spending, logistics",    ivProfile: "45–75%",  role: "addon",  note: "Multi-catalyst, very liquid options" },
  { ticker: "PLTR", sector: "Defense AI",            catalyst: "Gov contracts, earnings",              ivProfile: "70–100%", role: "addon",  note: "Completely uncorrelated to tech hardware" },
];

const PLAYBOOK_RULES = [
  {
    strategy: "Iron Condor",
    icon: "🦅",
    color: "border-blue-500/40 bg-blue-500/5",
    when: "IV Rank > 40, no major catalyst, range-bound stock",
    setup: "Sell 20-delta call + buy wing 1-2 strikes higher. Sell 20-delta put + buy wing 1-2 strikes lower. Target 40–50% of spread width as credit.",
    entry: "IV Rank > 40. Minimum 10 days to expiry.",
    exit: "Take profit at 50% of credit. Close if loss = 2× credit. Roll one side out 1 week if threatened with 5+ days left.",
    size: "Max $10k risk per trade. 5–7 contracts on $200k account.",
    best: "Boring weeks, post-earnings, range-bound stocks",
  },
  {
    strategy: "Strangle",
    icon: "🔀",
    color: "border-green-500/40 bg-green-500/5",
    when: "IV Rank > 60, high conviction stock won't move far, Level 3 access",
    setup: "Sell OTM call at ~15–20 delta. Sell OTM put at ~15–20 delta. No wings — collect full premium.",
    entry: "IV Rank > 60. No binary events in next 10 days. Minimum 10 days to expiry.",
    exit: "Take profit at 50% of credit. Close if loss = 2× credit on either leg. Roll threatened leg out 1 week. Hard stop: if stock closes beyond short strike, close next morning.",
    size: "Max 2–3 contracts. Naked = unlimited risk, sizing is your only protection.",
    best: "Post-big-move stocks, high IV crush plays (like WDC after +10% day)",
  },
  {
    strategy: "Naked Put / Call",
    icon: "🎯",
    color: "border-amber-500/40 bg-amber-500/5",
    when: "Directional conviction + want to get paid to wait",
    setup: "Naked Put: sell put at price you'd be happy buying the stock. Naked Call: sell call above clear resistance level.",
    entry: "Only when you have directional conviction. IV Rank > 40.",
    exit: "Take profit at 75% of credit (let them decay more). Close if option doubles in value against you. If assigned on put: you now own the stock — have a plan.",
    size: "Max $10k risk per trade.",
    best: "Stocks you're bullish on (put), stocks with clear overhead resistance (call)",
  },
];

// ─── Helper Functions ─────────────────────────────────────────────────────────

function daysToExpiry(expiry: string): number {
  const now = new Date();
  const exp = new Date(expiry);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusBadge(dte: number) {
  if (dte <= 2) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">⚠️ Expires in {dte}d</Badge>;
  if (dte <= 5) return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Watch — {dte}d left</Badge>;
  return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{dte}d left</Badge>;
}

function strategyBadge(strategy: string) {
  const map: Record<string, string> = {
    iron_condor: "bg-blue-500/20 text-blue-400",
    strangle: "bg-green-500/20 text-green-400",
    naked_put: "bg-amber-500/20 text-amber-400",
    naked_call: "bg-purple-500/20 text-purple-400",
    other: "bg-slate-500/20 text-slate-400",
  };
  const labels: Record<string, string> = {
    iron_condor: "Iron Condor",
    strangle: "Strangle",
    naked_put: "Naked Put",
    naked_call: "Naked Call",
    other: "Other",
  };
  return <Badge className={map[strategy] || ""}>{labels[strategy] || strategy}</Badge>;
}

// ─── Add Position Dialog ──────────────────────────────────────────────────────

function AddPositionDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    accountId: "schwab_764",
    ticker: "WDC",
    strategy: "strangle" as string,
    expiry: "",
    creditCollected: "",
    maxRisk: "",
    contracts: "2",
    shortCallStrike: "",
    shortPutStrike: "",
    entryDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const addMutation = trpc.playbook.addPosition.useMutation({
    onSuccess: () => {
      toast.success("Position added to playbook");
      setOpen(false);
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const accountLabel = ACCOUNTS.find(a => a.id === form.accountId)?.label ?? form.accountId;
  const strategyLabel = STRATEGIES.find(s => s.value === form.strategy)?.label ?? form.strategy;

  function handleSubmit() {
    if (!form.expiry || !form.creditCollected || !form.contracts) {
      toast.error("Fill in expiry, credit, and contracts");
      return;
    }
    addMutation.mutate({
      accountId: form.accountId,
      accountLabel,
      ticker: form.ticker,
      strategy: form.strategy as any,
      legs: [],
      expiry: form.expiry,
      creditCollected: parseFloat(form.creditCollected),
      maxRisk: form.maxRisk ? parseFloat(form.maxRisk) : undefined,
      contracts: parseInt(form.contracts),
      shortCallStrike: form.shortCallStrike ? parseFloat(form.shortCallStrike) : undefined,
      shortPutStrike: form.shortPutStrike ? parseFloat(form.shortPutStrike) : undefined,
      entryDate: form.entryDate,
      notes: form.notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4 mr-1" /> Add Position
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Position to Playbook</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label>Account</Label>
            <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNTS.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ticker</Label>
            <Select value={form.ticker} onValueChange={v => setForm(f => ({ ...f, ticker: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Strategy</Label>
            <Select value={form.strategy} onValueChange={v => setForm(f => ({ ...f, strategy: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map(s => <SelectItem key={s.value} value={s.value}>{s.icon} {s.label} — {s.desc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Expiry (YYYY-MM-DD)</Label>
            <Input value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} placeholder="2026-07-10" />
          </div>
          <div>
            <Label>Entry Date</Label>
            <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
          </div>
          <div>
            <Label>Credit Collected (per share)</Label>
            <Input value={form.creditCollected} onChange={e => setForm(f => ({ ...f, creditCollected: e.target.value }))} placeholder="18.20" />
          </div>
          <div>
            <Label>Contracts</Label>
            <Input value={form.contracts} onChange={e => setForm(f => ({ ...f, contracts: e.target.value }))} placeholder="2" />
          </div>
          <div>
            <Label>Short Call Strike</Label>
            <Input value={form.shortCallStrike} onChange={e => setForm(f => ({ ...f, shortCallStrike: e.target.value }))} placeholder="800" />
          </div>
          <div>
            <Label>Short Put Strike</Label>
            <Input value={form.shortPutStrike} onChange={e => setForm(f => ({ ...f, shortPutStrike: e.target.value }))} placeholder="560" />
          </div>
          <div>
            <Label>Max Risk (optional, iron condor)</Label>
            <Input value={form.maxRisk} onChange={e => setForm(f => ({ ...f, maxRisk: e.target.value }))} placeholder="16530" />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Entry thesis, key levels..." rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
            {addMutation.isPending ? "Adding..." : "Add Position"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close Position Dialog ────────────────────────────────────────────────────

function ClosePositionDialog({ position, onClosed }: { position: any; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [pnl, setPnl] = useState("");
  const [reason, setReason] = useState("50% profit");

  const closeMutation = trpc.playbook.closePosition.useMutation({
    onSuccess: () => {
      toast.success("Position closed");
      setOpen(false);
      onClosed();
    },
    onError: (e) => toast.error(e.message),
  });

  const credit = parseFloat(position.creditCollected) * position.contracts * 100;
  const halfCredit = credit / 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs h-7">Close</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Position — {position.ticker}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="text-sm text-muted-foreground">
            Credit collected: <span className="text-green-400 font-semibold">${credit.toFixed(0)}</span> | 50% target: <span className="text-green-400">${halfCredit.toFixed(0)}</span>
          </div>
          <div>
            <Label>Realized P&L ($)</Label>
            <Input value={pnl} onChange={e => setPnl(e.target.value)} placeholder={String(halfCredit.toFixed(0))} />
          </div>
          <div>
            <Label>Close Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="50% profit">50% profit target hit</SelectItem>
                <SelectItem value="2x loss">2× loss stop hit</SelectItem>
                <SelectItem value="expired">Expired worthless</SelectItem>
                <SelectItem value="rolled">Rolled to next expiry</SelectItem>
                <SelectItem value="threatened">Strike threatened — closed early</SelectItem>
                <SelectItem value="manual">Manual close</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => closeMutation.mutate({
            id: position.id,
            closedPnl: parseFloat(pnl) || 0,
            closeReason: reason,
            closeDate: new Date().toISOString().split("T")[0],
          })} disabled={closeMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
            Confirm Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EOD Snapshot Dialog ──────────────────────────────────────────────────────

function EodSnapshotDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [accounts, setAccounts] = useState([
    { accountId: "schwab_764", accountLabel: "Schwab ...764", totalValue: "", cashValue: "", marketValue: "", dayPnl: "", totalPnl: "" },
    { accountId: "etrade_4723", accountLabel: "E*TRADE -4723", totalValue: "", cashValue: "", marketValue: "", dayPnl: "", totalPnl: "" },
    { accountId: "etrade_2738", accountLabel: "E*TRADE -2738", totalValue: "", cashValue: "", marketValue: "", dayPnl: "", totalPnl: "" },
  ]);

  const saveMutation = trpc.playbook.saveSnapshot.useMutation({
    onSuccess: () => {
      toast.success("EOD snapshot saved");
      setOpen(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  function updateAccount(idx: number, field: string, value: string) {
    setAccounts(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  }

  function handleSave() {
    const parsed = accounts.map(a => ({
      accountId: a.accountId,
      accountLabel: a.accountLabel,
      totalValue: parseFloat(a.totalValue) || 0,
      cashValue: parseFloat(a.cashValue) || 0,
      marketValue: parseFloat(a.marketValue) || 0,
      dayPnl: parseFloat(a.dayPnl) || 0,
      totalPnl: parseFloat(a.totalPnl) || 0,
    }));
    saveMutation.mutate({ snapshotDate: date, accounts: parsed });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">📸 Log EOD Snapshot</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log End-of-Day Account Snapshot</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="w-40">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {accounts.map((acct, idx) => (
            <div key={acct.accountId} className="border border-border rounded-lg p-3">
              <div className="font-semibold text-sm mb-2">{acct.accountLabel}</div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { field: "totalValue", label: "Total Value" },
                  { field: "cashValue", label: "Cash" },
                  { field: "marketValue", label: "Mkt Value" },
                  { field: "dayPnl", label: "Day P&L" },
                  { field: "totalPnl", label: "Total G/L" },
                ].map(({ field, label }) => (
                  <div key={field}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      className="h-8 text-xs"
                      value={(acct as any)[field]}
                      onChange={e => updateAccount(idx, field, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
            {saveMutation.isPending ? "Saving..." : "Save Snapshot"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SriPlaybook() {
  const utils = trpc.useUtils();

  const { data: snapshots = [] } = trpc.playbook.getLatestSnapshots.useQuery();
  const { data: openPositions = [], refetch: refetchOpen } = trpc.playbook.getOpenPositions.useQuery();
  const { data: allPositions = [] } = trpc.playbook.getAllPositions.useQuery();
  const { data: monthlyData = [] } = trpc.playbook.getMonthlyPnl.useQuery();

  const deleteMutation = trpc.playbook.deletePosition.useMutation({
    onSuccess: () => { toast.success("Position removed"); utils.playbook.getOpenPositions.invalidate(); utils.playbook.getAllPositions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Computed Stats ──────────────────────────────────────────────────────────

  const totalCapital = useMemo(() =>
    snapshots.reduce((sum, s) => sum + parseFloat(s.totalValue as string), 0),
    [snapshots]
  );

  const totalDayPnl = useMemo(() =>
    snapshots.reduce((sum, s) => sum + parseFloat(s.dayPnl as string), 0),
    [snapshots]
  );

  const totalTotalPnl = useMemo(() =>
    snapshots.reduce((sum, s) => sum + parseFloat(s.totalPnl as string), 0),
    [snapshots]
  );

  const monthlyTarget = totalCapital * 0.03;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthData = monthlyData.find(m => m.month === currentMonth);
  const monthlyActual = currentMonthData ? parseFloat(currentMonthData.actualPnl as string) : 0;
  const monthlyProgress = monthlyTarget > 0 ? Math.min(100, (monthlyActual / monthlyTarget) * 100) : 0;

  // Closed positions this month
  const closedThisMonth = allPositions.filter(p =>
    p.status === "closed" && p.closeDate?.startsWith(currentMonth)
  );
  const wonThisMonth = closedThisMonth.filter(p => parseFloat(p.closedPnl as string || "0") > 0).length;
  const lostThisMonth = closedThisMonth.filter(p => parseFloat(p.closedPnl as string || "0") <= 0).length;
  const winRate = closedThisMonth.length > 0 ? Math.round((wonThisMonth / closedThisMonth.length) * 100) : 0;

  const refetchAll = () => {
    utils.playbook.getLatestSnapshots.invalidate();
    utils.playbook.getOpenPositions.invalidate();
    utils.playbook.getAllPositions.invalidate();
    utils.playbook.getMonthlyPnl.invalidate();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sri's Playbook</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Premium income strategy — Iron Condor · Strangle · Naked Put/Call</p>
        </div>
        <div className="flex gap-2">
          <EodSnapshotDialog onSaved={refetchAll} />
          <AddPositionDialog onAdded={refetchAll} />
        </div>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Capital */}
        <Card className="col-span-1 border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Capital</div>
            <div className="text-2xl font-bold text-green-400 mt-1">
              ${totalCapital > 0 ? totalCapital.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">3 accounts combined</div>
          </CardContent>
        </Card>

        {/* Monthly Target */}
        <Card className="col-span-1 border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Target (3%)</div>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              ${monthlyTarget > 0 ? monthlyTarget.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {monthlyActual !== 0 ? `Actual: $${monthlyActual.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "No data yet"}
            </div>
          </CardContent>
        </Card>

        {/* Today's P&L */}
        <Card className={`col-span-1 ${totalDayPnl >= 0 ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Today's P&L</div>
            <div className={`text-2xl font-bold mt-1 ${totalDayPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {totalDayPnl >= 0 ? "+" : ""}${totalDayPnl !== 0 ? totalDayPnl.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalCapital > 0 && totalDayPnl !== 0 ? `${((totalDayPnl / totalCapital) * 100).toFixed(2)}% of capital` : "Log EOD snapshot"}
            </div>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card className="col-span-1 border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Win Rate (This Month)</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {closedThisMonth.length > 0 ? `${winRate}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {closedThisMonth.length > 0 ? `${wonThisMonth}W / ${lostThisMonth}L of ${closedThisMonth.length} trades` : "No closed trades yet"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Progress Bar */}
      {totalCapital > 0 && (
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">June 2026 Progress toward 3% Target</div>
              <div className="text-sm text-muted-foreground">
                ${monthlyActual.toLocaleString()} / ${monthlyTarget.toLocaleString("en-US", { maximumFractionDigits: 0 })} target
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${monthlyProgress >= 100 ? "bg-green-500" : monthlyProgress >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                style={{ width: `${Math.min(100, monthlyProgress)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0%</span>
              <span className={monthlyProgress >= 100 ? "text-green-400 font-semibold" : ""}>{monthlyProgress.toFixed(1)}% complete</span>
              <span>3% = ${monthlyTarget.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Account Breakdown */}
      {snapshots.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {ACCOUNTS.map(acct => {
            const snap = snapshots.find(s => s.accountId === acct.id);
            if (!snap) return (
              <Card key={acct.id} className="border-border opacity-50">
                <CardContent className="pt-4 pb-3">
                  <div className="text-sm font-semibold">{acct.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">No snapshot yet</div>
                </CardContent>
              </Card>
            );
            const val = parseFloat(snap.totalValue as string);
            const dayPnl = parseFloat(snap.dayPnl as string);
            const totalPnl = parseFloat(snap.totalPnl as string);
            return (
              <Card key={acct.id} className="border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${acct.color}`} />
                    <div className="text-sm font-semibold">{acct.label}</div>
                    <div className="text-xs text-muted-foreground ml-auto">{snap.snapshotDate}</div>
                  </div>
                  <div className="text-xl font-bold">${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                  <div className="flex gap-3 mt-1">
                    <span className={`text-xs ${dayPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      Day: {dayPnl >= 0 ? "+" : ""}${dayPnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                    <span className={`text-xs ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      Total: {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs: Positions | Playbook Rules | History */}
      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">
            <Shield className="w-4 h-4 mr-1" />
            Open Positions ({openPositions.length})
          </TabsTrigger>
          <TabsTrigger value="playbook">
            <BookOpen className="w-4 h-4 mr-1" />
            Playbook Rules
          </TabsTrigger>
          <TabsTrigger value="history">
            <BarChart3 className="w-4 h-4 mr-1" />
            Trade History
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-1" />
            Extension
          </TabsTrigger>
        </TabsList>

        {/* ── Open Positions Tab ── */}
        <TabsContent value="positions" className="mt-4">
          {openPositions.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <div className="font-semibold">No open positions</div>
                <div className="text-sm mt-1">Click "Add Position" to log your first trade</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {openPositions.map(pos => {
                const dte = daysToExpiry(pos.expiry);
                const credit = parseFloat(pos.creditCollected as string) * pos.contracts * 100;
                const profitTarget = credit * 0.5;
                const lossStop = credit * 2;
                const acct = ACCOUNTS.find(a => a.id === pos.accountId);
                return (
                  <Card key={pos.id} className={`border-border ${dte <= 2 ? "border-red-500/40" : dte <= 5 ? "border-amber-500/30" : ""}`}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${acct?.color ?? "bg-slate-500"}`} />
                          <span className="font-bold text-lg">{pos.ticker}</span>
                          {strategyBadge(pos.strategy)}
                          {statusBadge(dte)}
                        </div>
                        <div className="text-xs text-muted-foreground">{acct?.label}</div>
                        <div className="ml-auto flex items-center gap-2">
                          <ClosePositionDialog position={pos} onClosed={refetchAll} />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-red-400 hover:text-red-300"
                            onClick={() => { if (confirm("Delete this position?")) deleteMutation.mutate({ id: pos.id }); }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Expiry</div>
                          <div className="font-medium">{pos.expiry}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Contracts</div>
                          <div className="font-medium">{pos.contracts}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Credit Collected</div>
                          <div className="font-medium text-green-400">${credit.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">50% Profit Target</div>
                          <div className="font-medium text-blue-400">${profitTarget.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">2× Loss Stop</div>
                          <div className="font-medium text-red-400">-${lossStop.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                        </div>
                      </div>
                      {(pos.shortCallStrike || pos.shortPutStrike) && (
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          {pos.shortCallStrike && <span>Short Call: <span className="text-foreground font-medium">${pos.shortCallStrike}</span></span>}
                          {pos.shortPutStrike && <span>Short Put: <span className="text-foreground font-medium">${pos.shortPutStrike}</span></span>}
                          {pos.maxRisk && <span>Max Risk: <span className="text-red-400 font-medium">${parseFloat(pos.maxRisk as string).toLocaleString()}</span></span>}
                        </div>
                      )}
                      {pos.notes && <div className="text-xs text-muted-foreground mt-2 italic">{pos.notes}</div>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Playbook Rules Tab ── */}
        <TabsContent value="playbook" className="mt-4">
          <div className="space-y-4">
            {/* Decision Tree */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-green-400" />
                  Weekly Decision Tree (5 Minutes Every Monday)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="border border-border rounded-lg p-3">
                    <div className="font-semibold text-green-400 mb-1">Step 1: Check IV Rank</div>
                    <div className="text-muted-foreground space-y-1">
                      <div>IV Rank &gt; 60 → <span className="text-green-400">Strangle</span></div>
                      <div>IV Rank 40–60 → <span className="text-blue-400">Iron Condor</span></div>
                      <div>IV Rank &lt; 40 → <span className="text-muted-foreground">Skip this week</span></div>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-3">
                    <div className="font-semibold text-amber-400 mb-1">Step 2: Check Catalysts</div>
                    <div className="text-muted-foreground space-y-1">
                      <div>Earnings in 10 days? → <span className="text-amber-400">Iron Condor only</span></div>
                      <div>No catalyst → <span className="text-green-400">Proceed</span></div>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-3">
                    <div className="font-semibold text-blue-400 mb-1">Step 3: Size & Enter</div>
                    <div className="text-muted-foreground space-y-1">
                      <div>Expiry: 10–21 days out</div>
                      <div>Max risk: $10k per trade</div>
                      <div>Max 4 open positions</div>
                      <div>Set GTC limit at mid</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strategy Cards */}
            {PLAYBOOK_RULES.map(rule => (
              <Card key={rule.strategy} className={`border ${rule.color}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{rule.icon} {rule.strategy}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">When to Use</div>
                      <div>{rule.when}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Setup</div>
                      <div>{rule.setup}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Entry Rule</div>
                      <div>{rule.entry}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Exit Rules</div>
                      <div className="text-green-400">{rule.exit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Position Size</div>
                      <div className="text-amber-400">{rule.size}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Best For</div>
                      <div className="text-blue-400">{rule.best}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Ticker Universe */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  Sri's Ticker Universe — 8 Names, 0 Overlap
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Core 5 */}
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Core 5 — Always on the radar</div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
                    {TICKER_UNIVERSE.filter(t => t.role === "core").map(t => (
                      <div key={t.ticker} className="border border-green-500/30 bg-green-500/5 rounded-lg p-3">
                        <div className="font-bold text-base text-green-400">{t.ticker}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.sector}</div>
                        <div className="text-xs text-muted-foreground mt-1">{t.catalyst}</div>
                        <div className="text-xs text-amber-400 mt-1">IV: {t.ivProfile}</div>
                        <div className="text-xs text-slate-400 mt-1 italic">{t.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Add-ons */}
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Add-ons — Rotate in when IV is elevated</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    {TICKER_UNIVERSE.filter(t => t.role === "addon").map(t => (
                      <div key={t.ticker} className="border border-blue-500/30 bg-blue-500/5 rounded-lg p-3">
                        <div className="font-bold text-base text-blue-400">{t.ticker}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.sector}</div>
                        <div className="text-xs text-muted-foreground mt-1">{t.catalyst}</div>
                        <div className="text-xs text-amber-400 mt-1">IV: {t.ivProfile}</div>
                        <div className="text-xs text-slate-400 mt-1 italic">{t.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Rotation Rule */}
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-amber-400 mb-1">🔄 Rotation Rule</div>
                  <div className="text-muted-foreground">Run <span className="text-white font-semibold">3 active positions max</span> at a time. Each Monday, pick the 3 tickers with the highest IV Rank from this universe — not the same 3 every week. <span className="text-amber-400">No two tickers from the same sector simultaneously.</span> When one closes, rotate in the next highest IV name.</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Trade History Tab ── */}
        <TabsContent value="history" className="mt-4">
          {allPositions.filter(p => p.status !== "open").length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <div className="font-semibold">No closed trades yet</div>
                <div className="text-sm mt-1">Closed positions will appear here with P&L tracking</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {allPositions.filter(p => p.status !== "open").map(pos => {
                const pnl = parseFloat(pos.closedPnl as string || "0");
                const credit = parseFloat(pos.creditCollected as string) * pos.contracts * 100;
                const acct = ACCOUNTS.find(a => a.id === pos.accountId);
                return (
                  <Card key={pos.id} className="border-border">
                    <CardContent className="py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${acct?.color ?? "bg-slate-500"}`} />
                          <span className="font-bold">{pos.ticker}</span>
                          {strategyBadge(pos.strategy)}
                          <Badge className={pos.status === "expired" ? "bg-slate-500/20 text-slate-400" : "bg-slate-500/20 text-slate-400"}>
                            {pos.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{pos.entryDate} → {pos.closeDate}</div>
                        <div className="ml-auto flex items-center gap-3">
                          {pnl >= 0
                            ? <span className="text-green-400 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> +${pnl.toLocaleString()}</span>
                            : <span className="text-red-400 font-semibold flex items-center gap-1"><XCircle className="w-3 h-3" /> -${Math.abs(pnl).toLocaleString()}</span>
                          }
                          <span className="text-xs text-muted-foreground">of ${credit.toLocaleString()} credit</span>
                        </div>
                      </div>
                      {pos.closeReason && <div className="text-xs text-muted-foreground mt-1">Reason: {pos.closeReason}</div>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Extension Settings Tab ── */}
        <TabsContent value="settings" className="mt-4">
          <ExtensionSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExtensionSettingsTab() {
  const [copied, setCopied] = React.useState(false);
  const [fullToken, setFullToken] = React.useState<string | null>(null);
  const tokenQuery = trpc.playbook.getExtensionToken.useQuery();
  const generateMutation = trpc.playbook.generateExtensionToken.useMutation({
    onSuccess: (data) => {
      setFullToken(data.token);
      tokenQuery.refetch();
      toast.success("New sync token generated — copy it now, it won't be shown again.");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Token copied to clipboard");
  };

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-4 h-4 text-green-500" />
            Chrome Extension Sync Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The Chrome extension uses a personal sync token to authenticate with PitDesk.
            Generate a token here, then paste it into the extension's Settings field.
          </p>

          {tokenQuery.data?.hasToken ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Token active</p>
                  <p className="text-xs text-muted-foreground font-mono">{tokenQuery.data.maskedToken}</p>
                  {tokenQuery.data.lastUsedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last used: {new Date(tokenQuery.data.lastUsedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {fullToken && (
                <div className="space-y-2">
                  <Label className="text-xs text-amber-600 font-semibold">⚠ Copy this token now — it won't be shown again</Label>
                  <div className="flex gap-2">
                    <Input
                      value={fullToken}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(fullToken)}
                    >
                      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {generateMutation.isPending ? "Regenerating..." : "Regenerate Token"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">No token yet — generate one to enable extension sync.</p>
              </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="w-full bg-green-500 hover:bg-green-600 text-white"
              >
                <Key className="w-4 h-4 mr-2" />
                {generateMutation.isPending ? "Generating..." : "Generate Sync Token"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to use the token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-2">
            <li>Click <strong>Generate Sync Token</strong> above</li>
            <li>Copy the full token that appears</li>
            <li>Open the PitDesk extension popup in Chrome (click the extension icon)</li>
            <li>Scroll to <strong>Settings → Sync Token</strong> and paste it</li>
            <li>Click <strong>Save Settings</strong></li>
            <li>Open E*TRADE or Schwab Positions page — sync should show green ✓</li>
          </ol>
          <p className="text-xs pt-2 border-t">
            The token is stored only in your browser's local storage and never transmitted except to PitDesk.
            Regenerating creates a new token and invalidates the old one.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
