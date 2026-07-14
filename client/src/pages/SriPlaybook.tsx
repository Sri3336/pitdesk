import { useState, useMemo, useEffect } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Target, BookOpen, Plus, CheckCircle, XCircle,
  AlertTriangle, DollarSign, BarChart3, Shield, Settings, Copy, RefreshCw,
  Key, ArrowDownCircle, ArrowUpCircle, Camera, Wallet, TrendingUp as TrendUp,
  Trash2, Activity, Zap, Link2Off, ExternalLink, RefreshCcw,
  Sparkles, Search, Star, Loader2,
} from "lucide-react";

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
    entry: "IV Rank > 40. Minimum 10 days to expiry. Enter between 10:00–11:00 AM EST only.",
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
    entry: "IV Rank > 60. No binary events in next 10 days. Minimum 10 days to expiry. Enter between 10:00–11:00 AM EST only.",
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
    entry: "Only when you have directional conviction. IV Rank > 40. Enter between 10:00–11:00 AM EST only.",
    exit: "Take profit at 75% of credit (let them decay more). Close if option doubles in value against you. If assigned on put: you now own the stock — have a plan.",
    size: "Max $10k risk per trade.",
    best: "Stocks you're bullish on (put), stocks with clear overhead resistance (call)",
  },
];

const TRANSFER_TYPES = [
  { value: "deposit",      label: "Deposit",      sign: +1, color: "text-green-400" },
  { value: "withdrawal",   label: "Withdrawal",   sign: -1, color: "text-red-400"   },
  { value: "transfer_in",  label: "Transfer In",  sign: +1, color: "text-blue-400"  },
  { value: "transfer_out", label: "Transfer Out", sign: -1, color: "text-orange-400"},
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

function fmt$(n: number, opts?: { sign?: boolean; decimals?: number }) {
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-US", { maximumFractionDigits: opts?.decimals ?? 0 });
  if (opts?.sign) return (n >= 0 ? "+" : "-") + "$" + str;
  return (n < 0 ? "-" : "") + "$" + str;
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

  // Sector concentration check
  const sectorCheck = trpc.decisionBench.checkSectorConcentration.useQuery(
    { ticker: form.ticker },
    { enabled: open && form.ticker.length >= 1 },
  );

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
        {/* Sector concentration warning */}
        {sectorCheck.data?.warning && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-md px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <span>{sectorCheck.data.message}</span>
          </div>
        )}
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

// ─── EOD Snapshot Dialog (manual entry) ──────────────────────────────────────

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

// ─── Add Transfer Dialog ──────────────────────────────────────────────────────

function AddTransferDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    accountId: "schwab_764",
    transferDate: today,
    amount: "",
    transferType: "deposit" as string,
    notes: "",
  });

  const addMutation = trpc.playbook.addTransfer.useMutation({
    onSuccess: () => {
      toast.success("Transfer logged");
      setOpen(false);
      onAdded();
      setForm(f => ({ ...f, amount: "", notes: "" }));
    },
    onError: (e) => toast.error(e.message),
  });

  const accountLabel = ACCOUNTS.find(a => a.id === form.accountId)?.label ?? form.accountId;
  const typeInfo = TRANSFER_TYPES.find(t => t.value === form.transferType);

  function handleSubmit() {
    const rawAmount = parseFloat(form.amount);
    if (!rawAmount || isNaN(rawAmount)) {
      toast.error("Enter a valid amount");
      return;
    }
    // Deposits/transfer_in are positive; withdrawals/transfer_out are negative
    const sign = (form.transferType === "deposit" || form.transferType === "transfer_in") ? 1 : -1;
    addMutation.mutate({
      accountId: form.accountId,
      accountLabel,
      transferDate: form.transferDate,
      amount: Math.abs(rawAmount) * sign,
      transferType: form.transferType as any,
      notes: form.notes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-1" /> Log Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Cash Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            Transfers adjust your true P&L. Deposits/transfers-in reduce P&L (capital added, not earned). Withdrawals/transfers-out increase P&L (capital removed, not lost).
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Date</Label>
              <Input type="date" value={form.transferDate} onChange={e => setForm(f => ({ ...f, transferDate: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.transferType} onValueChange={v => setForm(f => ({ ...f, transferType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSFER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount ($)</Label>
              <Input
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="5000"
                type="number"
                min="0"
              />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Monthly contribution, IRA transfer..." />
          </div>
          {form.amount && (
            <div className={`text-sm font-medium ${typeInfo?.color}`}>
              This will be recorded as {typeInfo?.label}: {typeInfo?.sign === 1 ? "+" : "-"}${Math.abs(parseFloat(form.amount) || 0).toLocaleString()} to {accountLabel}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {addMutation.isPending ? "Saving..." : "Log Transfer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SriPlaybook() {
  const utils = trpc.useUtils();
  const [analyzePos, setAnalyzePos] = useState<any | null>(null);
  const [manualEodOpen, setManualEodOpen] = useState(false);
  const [manualSchwab, setManualSchwab] = useState("");
  const [manualEt4723, setManualEt4723] = useState("");
  const [manualEt2738, setManualEt2738] = useState("");

  const { data: snapshots = [] } = trpc.playbook.getLatestSnapshots.useQuery();
  const { data: openPositions = [], refetch: refetchOpen } = trpc.playbook.getOpenPositions.useQuery();
  const { data: allPositions = [] } = trpc.playbook.getAllPositions.useQuery();
  const { data: monthlyData = [] } = trpc.playbook.getMonthlyPnl.useQuery();
  const { data: transfers = [], refetch: refetchTransfers } = trpc.playbook.getTransfers.useQuery();
  const { data: eodHistory = [], refetch: refetchEod } = trpc.playbook.getEodHistory.useQuery();
  const { data: tickerSignals = [], isLoading: signalsLoading } = trpc.playbook.getTickerSetupSignals.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 } // cache 5 min — Tradier has rate limits
  );

  // MTD adjusted P&L
  const currentMonth = new Date().toISOString().slice(0, 7);
  const mtdFrom = `${currentMonth}-01`;
  const mtdTo = new Date().toISOString().split("T")[0];
  const { data: adjustedPnl, refetch: refetchAdjPnl } = trpc.playbook.getAdjustedPnl.useQuery({
    fromDate: mtdFrom,
    toDate: mtdTo,
  });

  const captureEodMutation = trpc.playbook.captureEodSnapshot.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      const schwabNote = d.schwabSource === "api"
        ? ` | Schwab: ${fmt$(d.schwabVal)} ✔ live API`
        : d.schwabSource === "manual"
          ? ` | Schwab: ${fmt$(d.schwabVal)} ✔ manual`
          : d.schwabSource === "extension_fallback"
            ? ` | Schwab: ${fmt$(d.schwabVal)} (extension)`
            : d.schwabVal > 0
              ? ` | Schwab: ${fmt$(d.schwabVal)}`
              : " | Schwab: missing ⚠️";
      toast.success(`EOD captured — Total: ${fmt$(data.totalValue)}${schwabNote} | Adj P&L: ${data.adjustedPnl !== null ? fmt$(data.adjustedPnl, { sign: true }) : "N/A (first snapshot)"}`);
      refetchEod();
      refetchAdjPnl();
      utils.playbook.getLatestSnapshots.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTransferMutation = trpc.playbook.deleteTransfer.useMutation({
    onSuccess: () => {
      toast.success("Transfer deleted");
      refetchTransfers();
      refetchAdjPnl();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.playbook.deletePosition.useMutation({
    onSuccess: () => {
      toast.success("Position removed");
      utils.playbook.getOpenPositions.invalidate();
      utils.playbook.getAllPositions.invalidate();
    },
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

  // ── Locked month-start capital ──────────────────────────────────────────────
  // monthStartCapital is locked on the FIRST EOD snapshot of each calendar month.
  // The 3% monthly target is always computed from this frozen value — it never
  // moves with daily P&L. Falls back to current totalCapital if no snapshot yet.
  const monthStartCapital = adjustedPnl?.monthStartCapital ?? null;
  const targetBase = monthStartCapital ?? totalCapital; // locked if available, else live
  const hasLockedBaseline = monthStartCapital != null && monthStartCapital > 0;

  const monthlyTarget = targetBase * 0.03;
  const currentMonthData = monthlyData.find(m => m.month === currentMonth);
  const monthlyActual = currentMonthData ? parseFloat(currentMonthData.actualPnl as string) : 0;

  // Only use EOD-based adjusted P&L when a valid baseline snapshot exists for the period.
  // If baselineValue is 0 and baselineDate is null, it means no snapshot was captured before
  // the start of the month, so we fall back to closed-trade P&L (monthlyActual).
  const hasValidBaseline = adjustedPnl?.baselineDate != null && (adjustedPnl?.baselineValue ?? 0) > 0;
  const adjPnlValue = hasValidBaseline ? (adjustedPnl?.adjustedPnl ?? monthlyActual) : monthlyActual;
  const monthlyProgress = monthlyTarget > 0 ? Math.min(100, (adjPnlValue / monthlyTarget) * 100) : 0;

  const closedThisMonth = allPositions.filter(p =>
    p.status === "closed" && p.closeDate?.startsWith(currentMonth)
  );
  const wonThisMonth = closedThisMonth.filter(p => parseFloat(p.closedPnl as string || "0") > 0).length;
  const lostThisMonth = closedThisMonth.filter(p => parseFloat(p.closedPnl as string || "0") <= 0).length;
  const winRate = closedThisMonth.length > 0 ? Math.round((wonThisMonth / closedThisMonth.length) * 100) : 0;

  // Total net transfers
  const totalNetTransfers = useMemo(() =>
    transfers.reduce((sum, t) => sum + parseFloat(t.amount as string), 0),
    [transfers]
  );

  const refetchAll = () => {
    utils.playbook.getLatestSnapshots.invalidate();
    utils.playbook.getOpenPositions.invalidate();
    utils.playbook.getAllPositions.invalidate();
    utils.playbook.getMonthlyPnl.invalidate();
    refetchTransfers();
    refetchEod();
    refetchAdjPnl();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sri's Playbook</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Premium income strategy — Iron Condor · Strangle · Naked Put/Call</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Capture EOD — auto or manual override */}
          <div className="flex">
            <Button
              size="sm"
              variant="outline"
              onClick={() => captureEodMutation.mutate({})}
              disabled={captureEodMutation.isPending}
              className="border-green-500/40 text-green-400 hover:bg-green-500/10 rounded-r-none border-r-0"
              title="Auto-capture EOD from Schwab API + extension data"
            >
              <Camera className="w-4 h-4 mr-1" />
              {captureEodMutation.isPending ? "Capturing..." : "Capture EOD"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setManualEodOpen(true)}
              className="border-green-500/40 text-green-400 hover:bg-green-500/10 rounded-l-none px-2"
              title="Enter account values manually (use when Schwab API is unavailable)"
            >
              <Settings className="w-3 h-3" />
            </Button>
          </div>
          {/* Manual EOD Override Dialog */}
          <Dialog open={manualEodOpen} onOpenChange={setManualEodOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Manual EOD Override</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <p className="text-xs text-muted-foreground">Enter account values manually when Schwab API is unavailable. Leave blank to use extension sync data.</p>
                {[
                  { label: "Schwab ...764", val: manualSchwab, set: setManualSchwab },
                  { label: "E*TRADE -4723", val: manualEt4723, set: setManualEt4723 },
                  { label: "E*TRADE -2738", val: manualEt2738, set: setManualEt2738 },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <Label className="text-xs">{label} Total Value</Label>
                    <Input
                      className="h-8 text-sm"
                      value={val}
                      onChange={e => set(e.target.value)}
                      placeholder="e.g. 222208"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={() => setManualEodOpen(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={captureEodMutation.isPending}
                  onClick={() => {
                    captureEodMutation.mutate({
                      manualSchwabValue: parseFloat(manualSchwab) || undefined,
                      manualEt4723Value: parseFloat(manualEt4723) || undefined,
                      manualEt2738Value: parseFloat(manualEt2738) || undefined,
                    });
                    setManualEodOpen(false);
                    setManualSchwab("");
                    setManualEt4723("");
                    setManualEt2738("");
                  }}
                >
                  {captureEodMutation.isPending ? "Capturing..." : "Capture with Overrides"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <EodSnapshotDialog onSaved={refetchAll} />
          <AddPositionDialog onAdded={refetchAll} />
        </div>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Capital */}
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Capital</div>
            <div className="text-2xl font-bold text-green-400 mt-1">
              {totalCapital > 0 ? fmt$(totalCapital) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">3 accounts combined</div>
          </CardContent>
        </Card>

        {/* Monthly Target */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Target (3%)</div>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {monthlyTarget > 0 ? fmt$(monthlyTarget) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {hasLockedBaseline
                ? <span className="text-blue-300/70">
                    Base: {fmt$(monthStartCapital!)} · locked
                  </span>
                : hasValidBaseline && adjPnlValue !== 0
                ? <span className={adjPnlValue >= 0 ? "text-green-400" : "text-red-400"}>
                    Adj P&L: {fmt$(adjPnlValue, { sign: true })}
                  </span>
                : <span className="text-amber-400 text-xs">Capture EOD to lock baseline</span>}
            </div>
          </CardContent>
        </Card>

        {/* Today's P&L */}
        <Card className={totalDayPnl >= 0 ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Today's P&L</div>
            <div className={`text-2xl font-bold mt-1 ${totalDayPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {totalDayPnl !== 0 ? fmt$(totalDayPnl, { sign: true }) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalCapital > 0 && totalDayPnl !== 0
                ? `${((totalDayPnl / totalCapital) * 100).toFixed(2)}% of capital`
                : "Sync extension to update"}
            </div>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Win Rate (This Month)</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {closedThisMonth.length > 0 ? `${winRate}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {closedThisMonth.length > 0
                ? `${wonThisMonth}W / ${lostThisMonth}L of ${closedThisMonth.length} trades`
                : "No closed trades yet"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Progress Bar */}
      {totalCapital > 0 && (
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {new Date().toLocaleString("default", { month: "long", year: "numeric" })} — 3% Target Progress
                </span>
                {hasLockedBaseline && (
                  <span className="text-xs bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                    Base locked @ {fmt$(monthStartCapital!)} on {adjustedPnl?.monthStartCapitalDate ?? "first EOD"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {hasValidBaseline && adjustedPnl && (
                  <span className="text-xs text-muted-foreground">
                    Raw: {fmt$(adjustedPnl.rawPnl, { sign: true })} | Transfers: {fmt$(adjustedPnl.netTransfers, { sign: true })}
                  </span>
                )}
                <span className="font-medium">
                  {fmt$(adjPnlValue, { sign: true })} / {fmt$(monthlyTarget)} target
                </span>
              </div>
            </div>
            {/* Drawdown vs locked baseline */}
            {hasLockedBaseline && monthStartCapital && totalCapital > 0 && (() => {
              const drawdown = totalCapital - monthStartCapital;
              const drawdownPct = (drawdown / monthStartCapital) * 100;
              return drawdown < 0 ? (
                <div className="mb-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5 flex items-center justify-between">
                  <span>⚠️ Drawdown vs month-start: {fmt$(drawdown, { sign: true })} ({drawdownPct.toFixed(2)}%)</span>
                  <span className="text-muted-foreground">Current: {fmt$(totalCapital)} vs Locked: {fmt$(monthStartCapital)}</span>
                </div>
              ) : drawdown > 0 ? (
                <div className="mb-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded px-3 py-1.5 flex items-center justify-between">
                  <span>↑ Up vs month-start: {fmt$(drawdown, { sign: true })} ({drawdownPct.toFixed(2)}%)</span>
                  <span className="text-muted-foreground">Current: {fmt$(totalCapital)} vs Locked: {fmt$(monthStartCapital)}</span>
                </div>
              ) : null;
            })()}
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  monthlyProgress >= 100 ? "bg-green-500" : monthlyProgress >= 50 ? "bg-blue-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, monthlyProgress))}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0%</span>
              <span className={monthlyProgress >= 100 ? "text-green-400 font-semibold" : ""}>
                {monthlyProgress.toFixed(1)}% complete
                {adjustedPnl?.netTransfers ? " (transfer-adjusted)" : ""}
              </span>
              <span>3% = {fmt$(monthlyTarget)} {hasLockedBaseline ? "(fixed)" : "(live)"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Account Breakdown */}
      {snapshots.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {ACCOUNTS.map(acct => {
            const snap = snapshots.find(s => {
              if (s.accountId === acct.id) return true;
              if (acct.id === "schwab_764" && String(s.accountId).startsWith("schwab_")) return true;
              if (acct.id === "etrade_4723" && String(s.accountId).includes("4723")) return true;
              if (acct.id === "etrade_2738" && String(s.accountId).includes("2738")) return true;
              return false;
            });
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
                  <div className="text-xl font-bold">{fmt$(val)}</div>
                  <div className="flex gap-3 mt-1">
                    <span className={`text-xs ${dayPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      Day: {fmt$(dayPnl, { sign: true })}
                    </span>
                    <span className={`text-xs ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      Total: {fmt$(totalPnl, { sign: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="positions">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="positions">
            <Shield className="w-4 h-4 mr-1" />
            Open Positions ({openPositions.length})
          </TabsTrigger>
          <TabsTrigger value="capital">
            <Activity className="w-4 h-4 mr-1" />
            EOD Capital
          </TabsTrigger>
          <TabsTrigger value="transfers">
            <Wallet className="w-4 h-4 mr-1" />
            Transfers ({transfers.length})
          </TabsTrigger>
          <TabsTrigger value="playbook">
            <BookOpen className="w-4 h-4 mr-1" />
            Playbook Rules
          </TabsTrigger>
          <TabsTrigger value="history">
            <BarChart3 className="w-4 h-4 mr-1" />
            Trade History
          </TabsTrigger>
          <TabsTrigger value="schwab">
            <Zap className="w-4 h-4 mr-1" />
            Schwab Live
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-1" />
            Extension
          </TabsTrigger>
          <TabsTrigger value="weekly-picks">
            <Sparkles className="w-4 h-4 mr-1" />
            Weekly Picks
          </TabsTrigger>
          <TabsTrigger value="voice-journal">
            <Activity className="w-4 h-4 mr-1" />
            Voice Journal
          </TabsTrigger>
          <TabsTrigger value="my-system">
            <Star className="w-4 h-4 mr-1" />
            My System
          </TabsTrigger>
          <TabsTrigger value="trader-journal">
            <BookOpen className="w-4 h-4 mr-1" />
            Trader Journal
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 border-green-500/40 text-green-400 hover:bg-green-500/10"
                            onClick={() => setAnalyzePos(pos)}
                          >
                            <Search className="w-3 h-3 mr-1" /> Analyze
                          </Button>
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
                          <div className="font-medium text-green-400">{fmt$(credit)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">50% Profit Target</div>
                          <div className="font-medium text-blue-400">{fmt$(profitTarget)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">2× Loss Stop</div>
                          <div className="font-medium text-red-400">-{fmt$(lossStop)}</div>
                        </div>
                      </div>
                      {(pos.shortCallStrike || pos.shortPutStrike) && (
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          {pos.shortCallStrike && <span>Short Call: <span className="text-foreground font-medium">${pos.shortCallStrike}</span></span>}
                          {pos.shortPutStrike && <span>Short Put: <span className="text-foreground font-medium">${pos.shortPutStrike}</span></span>}
                          {pos.maxRisk && <span>Max Risk: <span className="text-red-400 font-medium">{fmt$(parseFloat(pos.maxRisk as string))}</span></span>}
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

        {/* ── EOD Capital Tab ── */}
        <TabsContent value="capital" className="mt-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Latest EOD Total</div>
                <div className="text-xl font-bold text-green-400 mt-1">
                  {eodHistory[0] ? fmt$(parseFloat(eodHistory[0].totalValue as string)) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{eodHistory[0]?.snapshotDate ?? "No snapshots yet"}</div>
              </CardContent>
            </Card>
            <Card className={`border-${(adjustedPnl?.adjustedPnl ?? 0) >= 0 ? "green" : "red"}-500/20 bg-${(adjustedPnl?.adjustedPnl ?? 0) >= 0 ? "green" : "red"}-500/5`}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">MTD Adj P&L</div>
                <div className={`text-xl font-bold mt-1 ${(adjustedPnl?.adjustedPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {adjustedPnl ? fmt$(adjustedPnl.adjustedPnl, { sign: true }) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {adjustedPnl ? `Raw: ${fmt$(adjustedPnl.rawPnl, { sign: true })}` : "Capture EOD to start"}
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Net Transfers (MTD)</div>
                <div className="text-xl font-bold text-blue-400 mt-1">
                  {adjustedPnl ? fmt$(adjustedPnl.netTransfers, { sign: true }) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Deposits minus withdrawals</div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">EOD Snapshots</div>
                <div className="text-xl font-bold text-amber-400 mt-1">{eodHistory.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {eodHistory.length > 0
                    ? `${eodHistory[eodHistory.length - 1].snapshotDate} → ${eodHistory[0].snapshotDate}`
                    : "Click Capture EOD to start"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Formula explanation */}
          <Card className="border-border">
            <CardContent className="pt-4 pb-3">
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                <TrendUp className="w-4 h-4 text-green-400" />
                Transfer-Adjusted P&L Formula
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">
                  True P&L = (Ending Capital − Beginning Capital) − Net Transfers In
                </span>
                <div className="mt-2 text-xs space-y-1">
                  <div>• <strong>Deposits/Transfers In</strong> are subtracted — you added capital, not earned it</div>
                  <div>• <strong>Withdrawals/Transfers Out</strong> are added back — you removed capital, not lost it</div>
                  <div>• Click <strong>"Capture EOD"</strong> after the extension syncs to lock in today's snapshot</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EOD History Table */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">EOD Capital History</CardTitle>
                <div className="flex">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => captureEodMutation.mutate({})}
                    disabled={captureEodMutation.isPending}
                    className="border-green-500/40 text-green-400 hover:bg-green-500/10 rounded-r-none border-r-0"
                  >
                    <Camera className="w-4 h-4 mr-1" />
                    {captureEodMutation.isPending ? "Capturing..." : "Capture Today's EOD"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManualEodOpen(true)}
                    className="border-green-500/40 text-green-400 hover:bg-green-500/10 rounded-l-none px-2"
                    title="Enter values manually"
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {eodHistory.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <div className="font-semibold">No EOD snapshots yet</div>
                  <div className="text-sm mt-1">
                    After the extension syncs your accounts, click "Capture EOD" to lock in today's total capital.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total Capital</TableHead>
                        <TableHead className="text-right">Day P&L</TableHead>
                        <TableHead className="text-right">Schwab ...764</TableHead>
                        <TableHead className="text-right">E*TRADE -4723</TableHead>
                        <TableHead className="text-right">E*TRADE -2738</TableHead>
                        <TableHead className="text-right">Net Transfers</TableHead>
                        <TableHead className="text-right">Adj P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eodHistory.map((row, i) => {
                        const adjPnlRow = row.adjustedPnl !== null ? parseFloat(row.adjustedPnl as string) : null;
                        const netT = parseFloat(row.netTransfersSinceLastSnapshot as string ?? "0");
                        const isFirst = i === eodHistory.length - 1;
                        // Day P&L = current total − previous row's total (eodHistory is newest-first)
                        const prevRow = eodHistory[i + 1];
                        const dayPnl = prevRow
                          ? parseFloat(row.totalValue as string) - parseFloat(prevRow.totalValue as string)
                          : null;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.snapshotDate}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {fmt$(parseFloat(row.totalValue as string))}
                            </TableCell>
                            <TableCell className="text-right">
                              {isFirst ? (
                                <span className="text-muted-foreground text-xs">Baseline</span>
                              ) : dayPnl !== null ? (
                                <span className={dayPnl >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                                  {fmt$(dayPnl, { sign: true })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {row.schwab764Value ? fmt$(parseFloat(row.schwab764Value as string)) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {row.etrade4723Value ? fmt$(parseFloat(row.etrade4723Value as string)) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {row.etrade2738Value ? fmt$(parseFloat(row.etrade2738Value as string)) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {netT !== 0
                                ? <span className={netT > 0 ? "text-blue-400" : "text-orange-400"}>{fmt$(netT, { sign: true })}</span>
                                : <span className="text-muted-foreground">—</span>
                              }
                            </TableCell>
                            <TableCell className="text-right">
                              {isFirst ? (
                                <span className="text-muted-foreground text-xs">Baseline</span>
                              ) : adjPnlRow !== null ? (
                                <span className={adjPnlRow >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                                  {fmt$(adjPnlRow, { sign: true })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Transfers Tab ── */}
        <TabsContent value="transfers" className="mt-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Deposits</div>
                <div className="text-xl font-bold text-green-400 mt-1">
                  {fmt$(transfers.filter(t => parseFloat(t.amount as string) > 0).reduce((s, t) => s + parseFloat(t.amount as string), 0))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Withdrawals</div>
                <div className="text-xl font-bold text-red-400 mt-1">
                  {fmt$(Math.abs(transfers.filter(t => parseFloat(t.amount as string) < 0).reduce((s, t) => s + parseFloat(t.amount as string), 0)))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Net Transfers (All Time)</div>
                <div className={`text-xl font-bold mt-1 ${totalNetTransfers >= 0 ? "text-blue-400" : "text-orange-400"}`}>
                  {fmt$(totalNetTransfers, { sign: true })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transfer Log */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Transfer Log</CardTitle>
                <AddTransferDialog onAdded={() => { refetchTransfers(); refetchAdjPnl(); }} />
              </div>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <div className="font-semibold">No transfers logged</div>
                  <div className="text-sm mt-1">Log deposits and withdrawals to get accurate transfer-adjusted P&L</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map(t => {
                        const amount = parseFloat(t.amount as string);
                        const typeInfo = TRANSFER_TYPES.find(tt => tt.value === t.transferType);
                        const acct = ACCOUNTS.find(a => a.id === t.accountId);
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">{t.transferDate}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${acct?.color ?? "bg-slate-500"}`} />
                                <span className="text-sm">{t.accountLabel}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm font-medium ${typeInfo?.color ?? ""}`}>
                                {amount > 0
                                  ? <ArrowDownCircle className="w-3 h-3 inline mr-1 text-green-400" />
                                  : <ArrowUpCircle className="w-3 h-3 inline mr-1 text-red-400" />
                                }
                                {typeInfo?.label ?? t.transferType}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`font-semibold ${amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {fmt$(amount, { sign: true })}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                              {t.notes ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => {
                                  if (confirm("Delete this transfer?")) {
                                    deleteTransferMutation.mutate({ id: t.id });
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Playbook Rules Tab ── */}
        <TabsContent value="playbook" className="mt-4">
          <div className="space-y-4">
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

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  Sri's Ticker Universe — 8 Names, 0 Overlap
                  {signalsLoading && <span className="ml-auto text-xs text-muted-foreground animate-pulse">Loading signals...</span>}
                  {!signalsLoading && tickerSignals.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      🟢 {tickerSignals.filter(s => s.status === "green").length} ready
                      {" · "}
                      🟡 {tickerSignals.filter(s => s.status === "yellow").length} watch
                      {" · "}
                      🔴 {tickerSignals.filter(s => s.status === "red").length} skip
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Live IV Rank signals — <span className="text-green-400 font-semibold">Green ≥ 40 IVR</span> (sell premium now) · <span className="text-amber-400 font-semibold">Yellow 20–39</span> (watch) · <span className="text-red-400 font-semibold">Red &lt; 20</span> (skip)
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Core 5 — Always on the radar</div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
                    {TICKER_UNIVERSE.filter(t => t.role === "core").map(t => {
                      const sig = tickerSignals.find(s => s.ticker === t.ticker);
                      const borderColor = sig?.status === "green" ? "border-green-500/60 bg-green-500/10"
                        : sig?.status === "yellow" ? "border-amber-500/60 bg-amber-500/10"
                        : sig?.status === "red" ? "border-red-500/40 bg-red-500/5"
                        : "border-green-500/30 bg-green-500/5";
                      return (
                        <div key={t.ticker} className={`border rounded-lg p-3 ${borderColor}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-bold text-base text-green-400">{t.ticker}</div>
                            {sig && sig.status !== "gray" ? (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                sig.status === "green" ? "bg-green-500/20 text-green-400" :
                                sig.status === "yellow" ? "bg-amber-500/20 text-amber-400" :
                                "bg-red-500/20 text-red-400"
                              }`}>
                                {sig.status === "green" ? "✓ READY" : sig.status === "yellow" ? "◐ WATCH" : "✗ SKIP"}
                              </span>
                            ) : signalsLoading ? (
                              <span className="text-xs text-muted-foreground">...</span>
                            ) : null}
                          </div>
                          {sig && sig.ivRank !== null && (
                            <div className="text-xs mb-1">
                              <span className={sig.status === "green" ? "text-green-400" : sig.status === "yellow" ? "text-amber-400" : "text-red-400"}>
                                IVR {sig.ivRank}
                              </span>
                              {sig.iv !== null && <span className="text-muted-foreground"> · IV {sig.iv}%</span>}
                              {sig.change !== null && (
                                <span className={sig.change >= 0 ? "text-green-400" : "text-red-400"}>
                                  {" "}{sig.change >= 0 ? "+" : ""}{sig.change.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">{t.sector}</div>
                          <div className="text-xs text-muted-foreground mt-1">{t.catalyst}</div>
                          <div className="text-xs text-amber-400 mt-1">Typical IV: {t.ivProfile}</div>
                          <div className="text-xs text-slate-400 mt-1 italic">{t.note}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Add-ons — Rotate in when IV is elevated</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    {TICKER_UNIVERSE.filter(t => t.role === "addon").map(t => {
                      const sig = tickerSignals.find(s => s.ticker === t.ticker);
                      const borderColor = sig?.status === "green" ? "border-green-500/60 bg-green-500/10"
                        : sig?.status === "yellow" ? "border-amber-500/60 bg-amber-500/10"
                        : sig?.status === "red" ? "border-red-500/40 bg-red-500/5"
                        : "border-blue-500/30 bg-blue-500/5";
                      return (
                        <div key={t.ticker} className={`border rounded-lg p-3 ${borderColor}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-bold text-base text-blue-400">{t.ticker}</div>
                            {sig && sig.status !== "gray" ? (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                sig.status === "green" ? "bg-green-500/20 text-green-400" :
                                sig.status === "yellow" ? "bg-amber-500/20 text-amber-400" :
                                "bg-red-500/20 text-red-400"
                              }`}>
                                {sig.status === "green" ? "✓ READY" : sig.status === "yellow" ? "◐ WATCH" : "✗ SKIP"}
                              </span>
                            ) : signalsLoading ? (
                              <span className="text-xs text-muted-foreground">...</span>
                            ) : null}
                          </div>
                          {sig && sig.ivRank !== null && (
                            <div className="text-xs mb-1">
                              <span className={sig.status === "green" ? "text-green-400" : sig.status === "yellow" ? "text-amber-400" : "text-red-400"}>
                                IVR {sig.ivRank}
                              </span>
                              {sig.iv !== null && <span className="text-muted-foreground"> · IV {sig.iv}%</span>}
                              {sig.change !== null && (
                                <span className={sig.change >= 0 ? "text-green-400" : "text-red-400"}>
                                  {" "}{sig.change >= 0 ? "+" : ""}{sig.change.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">{t.sector}</div>
                          <div className="text-xs text-muted-foreground mt-1">{t.catalyst}</div>
                          <div className="text-xs text-amber-400 mt-1">Typical IV: {t.ivProfile}</div>
                          <div className="text-xs text-slate-400 mt-1 italic">{t.note}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-amber-400 mb-1">🔄 Rotation Rule</div>
                  <div className="text-muted-foreground">Run <span className="text-white font-semibold">3 active positions max</span> at a time. Each Monday, pick the 3 tickers with the highest IV Rank from this universe — not the same 3 every week. No two names from the same sector simultaneously. No WDC + SNDK (storage overlap). No crypto.</div>
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
                          <Badge className="bg-slate-500/20 text-slate-400">{pos.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{pos.entryDate} → {pos.closeDate}</div>
                        <div className="ml-auto flex items-center gap-3">
                          {pnl >= 0
                            ? <span className="text-green-400 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {fmt$(pnl, { sign: true })}</span>
                            : <span className="text-red-400 font-semibold flex items-center gap-1"><XCircle className="w-3 h-3" /> {fmt$(pnl, { sign: true })}</span>
                          }
                          <span className="text-xs text-muted-foreground">of {fmt$(credit)} credit</span>
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

        {/* ── Schwab Live Tab ── */}
        <TabsContent value="schwab" className="mt-4">
          <SchwabLiveTab />
        </TabsContent>

        {/* ── Extension Settings Tab ── */}
        <TabsContent value="settings" className="mt-4">
          <ExtensionSettingsTab />
        </TabsContent>
        {/* ── Weekly Picks Tab ── */}
        <TabsContent value="weekly-picks" className="mt-4">
          <WeeklyPicksTab />
        </TabsContent>

        {/* ── Voice Journal Tab ── */}
        <TabsContent value="voice-journal" className="mt-4">
          <VoiceJournalTab />
        </TabsContent>

        {/* ── My System Tab ── */}
        <TabsContent value="my-system" className="mt-4">
          <MySystemTab />
        </TabsContent>

        {/* ── Trader Journal Tab ── */}
        <TabsContent value="trader-journal" className="mt-4">
          <TraderJournalTab />
        </TabsContent>
      </Tabs>

      {/* ── Trade Analysis Modal ── */}
      <TradeAnalysisModal
        open={analyzePos !== null}
        onClose={() => setAnalyzePos(null)}
        position={analyzePos ? {
          ticker: analyzePos.ticker,
          strategy: analyzePos.strategy,
          expiry: analyzePos.expiry,
          creditCollected: parseFloat(analyzePos.creditCollected as string),
          contracts: analyzePos.contracts,
          shortCallStrike: analyzePos.shortCallStrike ? parseFloat(analyzePos.shortCallStrike as string) : undefined,
          shortPutStrike: analyzePos.shortPutStrike ? parseFloat(analyzePos.shortPutStrike as string) : undefined,
          maxRisk: analyzePos.maxRisk ? parseFloat(analyzePos.maxRisk as string) : undefined,
          entryDate: analyzePos.entryDate,
          notes: analyzePos.notes ?? undefined,
        } : null}
      />
    </div>
  );
}

// ─── Extension Settings Tab Component ────────────────────────────────────────

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
                    <Input value={fullToken} readOnly className="font-mono text-xs" />
                    <Button size="sm" variant="outline" onClick={() => handleCopy(fullToken)}>
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

// ─── Schwab Live Tab Component ────────────────────────────────────────────────

function SchwabLiveTab() {
  const statusQuery = trpc.schwab.getStatus.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every minute
  });
  const accountsQuery = trpc.schwab.getAccounts.useQuery(undefined, {
    enabled: statusQuery.data?.connected === true,
    refetchInterval: 5 * 60_000, // refresh every 5 min
  });
  const disconnectMutation = trpc.schwab.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Schwab disconnected");
      statusQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Handle OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("schwab_connected") === "1") {
      toast.success("Schwab connected successfully!");
      statusQuery.refetch();
      window.history.replaceState({}, "", window.location.pathname);
    }
    const err = params.get("schwab_error");
    if (err) {
      toast.error(`Schwab connection failed: ${err}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const status = statusQuery.data;
  const accounts = accountsQuery.data;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Connection Status Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Schwab API Connection
            </div>
            {status?.connected && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 border-red-500/30 hover:bg-red-500/10 text-xs"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Link2Off className="w-3 h-3 mr-1" />
                Disconnect
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="text-sm text-muted-foreground animate-pulse">Checking connection...</div>
          ) : status?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Connected to Schwab</p>
                  <p className="text-xs text-muted-foreground">
                    Refresh token expires in <strong>{status.daysUntilExpiry} day{status.daysUntilExpiry !== 1 ? "s" : ""}</strong>
                    {status.daysUntilExpiry !== undefined && status.daysUntilExpiry <= 2 && (
                      <span className="ml-2 text-amber-500 font-semibold">⚠ Re-authorize soon!</span>
                    )}
                  </p>
                  {status.lastSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Last sync: {new Date(status.lastSyncAt).toLocaleString()}
                      {status.lastSyncStatus && (
                        <span className={`ml-2 ${status.lastSyncStatus === "ok" ? "text-green-500" : "text-red-500"}`}>
                          ({status.lastSyncStatus})
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => accountsQuery.refetch()}
                  disabled={accountsQuery.isFetching}
                >
                  <RefreshCcw className={`w-3 h-3 mr-1 ${accountsQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              {/* Account numbers */}
              {status.accountNumbers && status.accountNumbers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(status.accountNumbers as Array<{ accountNumber: string; hashValue: string }>).map((a) => (
                    <Badge key={a.accountNumber} variant="outline" className="text-xs font-mono">
                      ...{a.accountNumber.slice(-4)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {status?.reason === "refresh_token_expired"
                      ? "Schwab token expired — re-authorization required"
                      : "Schwab not connected"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Connect to pull live balances and positions directly from Schwab API
                  </p>
                </div>
              </div>
              <a href="/api/schwab/connect">
                <Button className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {status?.reason === "refresh_token_expired" ? "Re-authorize Schwab" : "Connect Schwab Account"}
                </Button>
              </a>
              <p className="text-xs text-muted-foreground">
                You'll be redirected to Schwab's login page. After authorizing, you'll return here automatically.
                The connection lasts 7 days before requiring re-authorization.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Live Account Data ── */}
      {status?.connected && (
        <>
          {accountsQuery.isLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground animate-pulse">
                Loading live account data from Schwab...
              </CardContent>
            </Card>
          ) : accountsQuery.error ? (
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center gap-2 text-red-500">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">{accountsQuery.error.message}</span>
                </div>
                {accountsQuery.error.message.includes("expired") && (
                  <a href="/api/schwab/connect" className="mt-3 block">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                      Re-authorize Schwab
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ) : accounts ? (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Total Portfolio Value</p>
                    <p className="text-2xl font-bold text-green-500">{fmt$(accounts.summary.totalValue)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Accounts Linked</p>
                    <p className="text-2xl font-bold">{accounts.summary.accountCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Last Synced</p>
                    <p className="text-sm font-medium">{new Date(accounts.summary.syncedAt).toLocaleTimeString()}</p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Total Positions</p>
                    <p className="text-2xl font-bold">
                      {accounts.accounts.reduce((s, a) => s + a.positions.length, 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-account cards */}
              {accounts.accounts.map((acct) => (
                <Card key={acct.accountNumber} className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        Schwab ...{acct.accountNumber.slice(-4)}
                        <Badge variant="outline" className="text-xs">{acct.accountType}</Badge>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold">{fmt$(acct.totalValue)}</span>
                        <span className="text-xs text-muted-foreground ml-2">total value</span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Balance summary */}
                    <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Cash Balance</p>
                        <p className="font-semibold">{fmt$(acct.cashBalance)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Buying Power</p>
                        <p className="font-semibold">{fmt$(acct.buyingPower)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Positions</p>
                        <p className="font-semibold">{acct.positions.length}</p>
                      </div>
                    </div>

                    {/* Positions table */}
                    {acct.positions.length > 0 ? (
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="text-xs py-2">Symbol</TableHead>
                              <TableHead className="text-xs py-2">Type</TableHead>
                              <TableHead className="text-xs py-2 text-right">Qty</TableHead>
                              <TableHead className="text-xs py-2 text-right">Avg Price</TableHead>
                              <TableHead className="text-xs py-2 text-right">Market Value</TableHead>
                              <TableHead className="text-xs py-2 text-right">Unrealized P&L</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {acct.positions.map((pos, idx) => (
                              <TableRow key={idx} className="hover:bg-muted/20">
                                <TableCell className="py-2 font-mono font-semibold text-sm">{pos.symbol}</TableCell>
                                <TableCell className="py-2">
                                  <Badge variant="outline" className="text-xs">{pos.assetType}</Badge>
                                </TableCell>
                                <TableCell className="py-2 text-right text-sm">{pos.quantity}</TableCell>
                                <TableCell className="py-2 text-right text-sm">{fmt$(pos.averagePrice, { decimals: 2 })}</TableCell>
                                <TableCell className="py-2 text-right text-sm font-medium">{fmt$(pos.marketValue)}</TableCell>
                                <TableCell className={`py-2 text-right text-sm font-semibold ${pos.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                                  {fmt$(pos.unrealizedPnl, { sign: true })}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No open positions</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Weekly Picks Tab Component ───────────────────────────────────────────────
function WeeklyPicksTab() {
  const { data: picks = [], isLoading, error, refetch } = trpc.weeklyPicks.getWeeklyTopTickers.useQuery(
    undefined,
    { staleTime: 4 * 60 * 60 * 1000 } // 4 hours — matches server cache
  );
  const refreshMutation = trpc.weeklyPicks.refreshCache.useMutation({
    onSuccess: () => {
      toast.success("Cache cleared — fetching fresh data...");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function ivStatusColor(status: string) {
    if (status === "green") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "yellow") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (status === "red") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }

  function ivStatusLabel(status: string, ivRank: number | null) {
    if (status === "green") return `IVR ${ivRank ?? "—"} 🟢 READY`;
    if (status === "yellow") return `IVR ${ivRank ?? "—"} 🟡 WATCH`;
    if (status === "red") return `IVR ${ivRank ?? "—"} 🔴 SKIP`;
    return "IVR — ⚪ N/A";
  }

  function fmtVol(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            This Week's Opportunities
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Top 10 premium-selling candidates from the S&P 500 universe — scored by IV Rank + options liquidity.
            Cached for 4 hours. These are <strong>not</strong> your core 8 tickers — they're expansion opportunities.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending || isLoading}
          className="shrink-0"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Fetching IV data for 50 tickers... (this takes ~30 seconds)
        </div>
      )}

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-6 text-center text-red-400">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            <div className="font-medium">Failed to load weekly picks</div>
            <div className="text-sm mt-1">{(error as any).message}</div>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && picks.length === 0 && (
        <Card className="border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div className="font-semibold">No picks available</div>
            <div className="text-sm mt-1">Click Refresh to fetch this week's top opportunities</div>
          </CardContent>
        </Card>
      )}

      {!isLoading && picks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {picks.map((pick, idx) => (
            <Card key={pick.ticker} className={`border-border hover:border-green-500/30 transition-colors ${idx === 0 ? "border-yellow-500/40 bg-yellow-500/5" : ""}`}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {idx === 0 && <Star className="w-4 h-4 text-yellow-400 shrink-0" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{pick.ticker}</span>
                        <Badge variant="outline" className="text-xs text-muted-foreground">{pick.sector}</Badge>
                      </div>
                      {pick.price && (
                        <div className="text-sm text-muted-foreground">
                          ${pick.price.toFixed(2)}
                          {pick.change !== null && (
                            <span className={`ml-2 ${pick.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {pick.change >= 0 ? "+" : ""}{pick.change.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={`text-xs ${ivStatusColor(pick.ivStatus)}`}>
                      {ivStatusLabel(pick.ivStatus, pick.ivRank)}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      Score: <span className="font-semibold text-foreground">{pick.score}</span>/100
                    </div>
                  </div>
                </div>

                {/* Liquidity row */}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Vol: <span className="text-foreground font-medium">{fmtVol(pick.optionsVolume)}</span></span>
                  <span>OI: <span className="text-foreground font-medium">{fmtVol(pick.openInterest)}</span></span>
                  {pick.iv !== null && (
                    <span>IV: <span className="text-foreground font-medium">{(pick.iv * 100).toFixed(0)}%</span></span>
                  )}
                </div>

                {/* AI fundamental note */}
                {pick.fundamentalNote && (
                  <div className="mt-2 text-xs text-muted-foreground italic border-t border-border pt-2">
                    <Sparkles className="w-3 h-3 inline mr-1 text-yellow-400" />
                    {pick.fundamentalNote}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/20">
        <strong>Note:</strong> These picks are scored purely on IV Rank and options liquidity. They are NOT buy/sell recommendations.
        Always check earnings dates, news catalysts, and your own conviction before entering any trade.
        Entry window: <strong>10:00–11:00 AM EST only</strong>.
      </div>
    </div>
  );
}

// ─── Trade Analysis Modal ─────────────────────────────────────────────────────
interface AnalysisResult {
  summary: string;
  maxProfit: number;
  maxLoss: number;
  breakeven: string;
  whatNeedsToHappen: string;
  playbookFit: {
    pass: boolean;
    score: number;
    reason: string;
    warnings: string[];
  };
  risks: string[];
  tradingBuddyTake: string;
  adjustmentStrategy?: {
    needed: boolean;
    headline: string;
    steps: string[];
    hedgeOption: string;
    doNothing: string;
  };
}

export function TradeAnalysisModal({
  open,
  onClose,
  position,
}: {
  open: boolean;
  onClose: () => void;
  position: {
    ticker: string;
    strategy: string;
    expiry: string;
    creditCollected: number;
    contracts: number;
    shortCallStrike?: number;
    shortPutStrike?: number;
    maxRisk?: number;
    entryDate: string;
    notes?: string;
  } | null;
}) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const analyzeMutation = trpc.playbook.analyzePosition.useMutation({
    onSuccess: (data) => {
      setAnalysis(data.analysis as AnalysisResult);
    },
    onError: (e) => toast.error(`Analysis failed: ${e.message}`),
  });

  // Auto-run analysis when modal opens with a position
  useEffect(() => {
    if (open && position && !hasRun) {
      setHasRun(true);
      analyzeMutation.mutate({
        ticker: position.ticker,
        strategy: position.strategy as any,
        expiry: position.expiry,
        creditCollected: position.creditCollected,
        contracts: position.contracts,
        shortCallStrike: position.shortCallStrike,
        shortPutStrike: position.shortPutStrike,
        maxRisk: position.maxRisk,
        entryDate: position.entryDate,
        notes: position.notes,
      });
    }
    if (!open) {
      setAnalysis(null);
      setHasRun(false);
    }
  }, [open, position]);

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-green-400" />
            Trade Analysis — {position.ticker}
          </DialogTitle>
        </DialogHeader>

        {analyzeMutation.isPending && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Pit Advisor is analyzing your trade...
          </div>
        )}

        {analysis && (
          <div className="space-y-4 mt-2">
            {/* Summary */}
            <div className="p-3 rounded-md bg-muted/30 border border-border">
              <p className="text-sm font-medium">{analysis.summary}</p>
            </div>

            {/* Key Numbers */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-md bg-green-500/10 border border-green-500/20">
                <div className="text-xs text-muted-foreground mb-1">Max Profit</div>
                <div className="font-bold text-green-400">{fmt$(analysis.maxProfit)}</div>
              </div>
              <div className="text-center p-3 rounded-md bg-red-500/10 border border-red-500/20">
                <div className="text-xs text-muted-foreground mb-1">Max Loss</div>
                <div className="font-bold text-red-400">-{fmt$(analysis.maxLoss)}</div>
              </div>
              <div className="text-center p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                <div className="text-xs text-muted-foreground mb-1">Breakeven</div>
                <div className="font-bold text-blue-400 text-sm">{analysis.breakeven}</div>
              </div>
            </div>

            {/* What needs to happen */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">To Win This Trade</div>
              <p className="text-sm">{analysis.whatNeedsToHappen}</p>
            </div>

            {/* Playbook Fit */}
            <div className={`p-3 rounded-md border ${analysis.playbookFit.pass ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
              <div className="flex items-center gap-2 mb-1">
                {analysis.playbookFit.pass
                  ? <CheckCircle className="w-4 h-4 text-green-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />
                }
                <span className="font-semibold text-sm">
                  Playbook Fit: {analysis.playbookFit.pass ? "✅ PASS" : "❌ FAIL"} ({analysis.playbookFit.score}/100)
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.playbookFit.reason}</p>
              {analysis.playbookFit.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {analysis.playbookFit.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-400 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Key Risks */}
            {analysis.risks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Key Risks</div>
                <ul className="space-y-1">
                  {analysis.risks.map((r, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Adjustment Strategy */}
            {analysis.adjustmentStrategy && (
              <div className={`p-3 rounded-md border ${
                analysis.adjustmentStrategy.needed
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-muted/20 border-border"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${
                    analysis.adjustmentStrategy.needed ? "text-amber-400" : "text-muted-foreground"
                  }`} />
                  <span className={`font-semibold text-sm ${
                    analysis.adjustmentStrategy.needed ? "text-amber-300" : "text-muted-foreground"
                  }`}>
                    Adjustment Strategy{analysis.adjustmentStrategy.needed ? " — Action Recommended" : " — Holding is Fine"}
                  </span>
                </div>

                {/* Headline action */}
                {analysis.adjustmentStrategy.headline && (
                  <p className="text-sm font-medium mb-2">{analysis.adjustmentStrategy.headline}</p>
                )}

                {/* Step-by-step roll/hedge plan */}
                {analysis.adjustmentStrategy.steps.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Step-by-Step Plan</div>
                    <ol className="space-y-1">
                      {analysis.adjustmentStrategy.steps.map((step, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Hedge alternative */}
                {analysis.adjustmentStrategy.hedgeOption && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Alternative Hedge</div>
                    <p className="text-sm text-muted-foreground">{analysis.adjustmentStrategy.hedgeOption}</p>
                  </div>
                )}

                {/* Do-nothing condition */}
                {analysis.adjustmentStrategy.doNothing && (
                  <div className="pt-2 border-t border-border/50">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">When to Do Nothing</div>
                    <p className="text-sm text-muted-foreground italic">{analysis.adjustmentStrategy.doNothing}</p>
                  </div>
                )}
              </div>
            )}

            {/* Trading Buddy Take */}
            {analysis.tradingBuddyTake && (
              <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Pit Advisor's Take
                </div>
                <p className="text-sm">{analysis.tradingBuddyTake}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
          {analysis && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAnalysis(null);
                setHasRun(false);
                analyzeMutation.mutate({
                  ticker: position.ticker,
                  strategy: position.strategy as any,
                  expiry: position.expiry,
                  creditCollected: position.creditCollected,
                  contracts: position.contracts,
                  shortCallStrike: position.shortCallStrike,
                  shortPutStrike: position.shortPutStrike,
                  maxRisk: position.maxRisk,
                  entryDate: position.entryDate,
                  notes: position.notes,
                });
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Re-analyze
            </Button>
          )}
          <Button onClick={onClose} className="ml-auto">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Voice Trade Journal Tab ──────────────────────────────────────────────────

function VoiceJournalTab() {
  const [ticker, setTicker] = React.useState("");
  const [strategy, setStrategy] = React.useState("");
  const [manualNote, setManualNote] = React.useState("");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [isRecording, setIsRecording] = React.useState(false);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<{
    transcript: string;
    aiRationale: string;
    aiRisksIdentified: string;
    aiSentiment: string;
  } | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const utils = trpc.useUtils();

  const { data: journals, isLoading: journalsLoading } = trpc.decisionBench.getVoiceJournals.useQuery(
    { limit: 20 },
  );

  const transcribeMutation = trpc.decisionBench.uploadAudioAndTranscribe.useMutation({
    onSuccess: (data: { transcript: string; aiRationale: string; aiRisksIdentified: string; aiSentiment: string; audioUrl: string }) => {
      setLastResult({
        transcript: data.transcript,
        aiRationale: data.aiRationale,
        aiRisksIdentified: data.aiRisksIdentified,
        aiSentiment: data.aiSentiment,
      });
      utils.decisionBench.getVoiceJournals.invalidate();
      toast.success("Voice note transcribed and saved!");
      setAudioBlob(null);
      setAudioUrl(null);
      setTicker("");
      setStrategy("");
      setManualNote("");
      setEntryPrice("");
    },
    onError: (e: { message: string }) => toast.error(`Transcription failed: ${e.message}`),
  });

  const saveTextMutation = trpc.decisionBench.saveVoiceJournal.useMutation({
    onSuccess: () => {
      utils.decisionBench.getVoiceJournals.invalidate();
      toast.success("Journal entry saved!");
      setManualNote("");
      setTicker("");
      setStrategy("");
      setEntryPrice("");
    },
    onError: (e) => toast.error(e.message),
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err) {
      toast.error("Microphone access denied. Please allow mic access in your browser.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function submitVoice() {
    if (!audioBlob) return;
    if (!ticker.trim()) { toast.error("Enter a ticker"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      transcribeMutation.mutate({
        audioDataUrl: dataUrl,
        ticker: ticker.toUpperCase(),
        strategy: strategy || undefined,
        entryPrice: entryPrice ? parseFloat(entryPrice) : undefined,
      });
    };
    reader.readAsDataURL(audioBlob);
  }

  function submitText() {
    if (!ticker.trim()) { toast.error("Enter a ticker"); return; }
    if (!manualNote.trim()) { toast.error("Enter a note"); return; }
    saveTextMutation.mutate({
      ticker: ticker.toUpperCase(),
      strategy: strategy || undefined,
      manualNote: manualNote,
      entryPrice: entryPrice ? parseFloat(entryPrice) : undefined,
    });
  }

  const sentimentColor = (s: string) => {
    if (s === "confident") return "bg-green-100 text-green-800 border-green-200";
    if (s === "hedged") return "bg-blue-100 text-blue-800 border-blue-200";
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Record / Type form */}
      <Card className="border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-600" />
            New Voice Journal Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Ticker + strategy + price */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Ticker</Label>
              <Input
                placeholder="e.g. WDC"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                className="uppercase mt-1"
                maxLength={10}
              />
            </div>
            <div>
              <Label className="text-xs">Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Entry Price (optional)</Label>
              <Input
                placeholder="e.g. 42.50"
                value={entryPrice}
                onChange={e => setEntryPrice(e.target.value)}
                type="number"
                step="0.01"
                className="mt-1"
              />
            </div>
          </div>

          {/* Voice recording */}
          <div className="border border-dashed border-green-300 rounded-lg p-4 space-y-3 bg-green-50/20">
            <div className="flex items-center gap-3">
              {!isRecording && !audioBlob && (
                <Button
                  onClick={startRecording}
                  className="bg-red-500 hover:bg-red-600 text-white"
                  size="sm"
                >
                  <span className="w-2 h-2 rounded-full bg-white mr-2" />
                  Start Recording
                </Button>
              )}
              {isRecording && (
                <Button
                  onClick={stopRecording}
                  className="bg-gray-700 hover:bg-gray-800 text-white animate-pulse"
                  size="sm"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400 mr-2" />
                  Stop Recording
                </Button>
              )}
              {audioBlob && audioUrl && (
                <>
                  <audio src={audioUrl} controls className="h-8 flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitVoice}
                    disabled={transcribeMutation.isPending || !ticker.trim()}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {transcribeMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-1" />Transcribing...</>
                    ) : (
                      "Transcribe & Save"
                    )}
                  </Button>
                </>
              )}
              {!audioBlob && !isRecording && (
                <span className="text-xs text-muted-foreground">Click to record your trade rationale</span>
              )}
            </div>
          </div>

          {/* Manual text note */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Or type a note instead</Label>
            <Textarea
              placeholder="Why are you entering this trade? What's the setup? What could go wrong?"
              value={manualNote}
              onChange={e => setManualNote(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              onClick={submitText}
              disabled={saveTextMutation.isPending || !ticker.trim() || !manualNote.trim()}
              variant="outline"
            >
              {saveTextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Text Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last transcription result */}
      {lastResult && (
        <Card className="border border-green-300 bg-green-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-green-800">Last Transcription Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-xs font-medium text-muted-foreground">Transcript</span>
              <p className="mt-0.5 italic text-muted-foreground">"{lastResult.transcript}"</p>
            </div>
            {lastResult.aiRationale && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">AI Rationale</span>
                <p className="mt-0.5">{lastResult.aiRationale}</p>
              </div>
            )}
            {lastResult.aiRisksIdentified && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">Risks Identified</span>
                <p className="mt-0.5 text-amber-700">{lastResult.aiRisksIdentified}</p>
              </div>
            )}
            <Badge variant="outline" className={`text-xs ${sentimentColor(lastResult.aiSentiment)}`}>
              Sentiment: {lastResult.aiSentiment}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Journal history */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Journal History</h3>
        {journalsLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-green-500" />
          </div>
        ) : !journals || journals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No journal entries yet. Record your first trade note above.
          </div>
        ) : (
          <div className="space-y-2">
            {journals.map((entry: any) => (
              <Card key={entry.id} className="border border-border">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{entry.ticker}</span>
                        {entry.strategy && (
                          <Badge variant="outline" className="text-xs">{entry.strategy.replace("_", " ")}</Badge>
                        )}
                        {entry.aiSentiment && (
                          <Badge variant="outline" className={`text-xs ${sentimentColor(entry.aiSentiment)}`}>
                            {entry.aiSentiment}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(entry.recordedAt).toLocaleString()}
                        </span>
                      </div>
                      {entry.aiRationale && (
                        <p className="text-xs mt-1 text-foreground">{entry.aiRationale}</p>
                      )}
                      {entry.manualNote && (
                        <p className="text-xs mt-1 text-muted-foreground italic">"{entry.manualNote}"</p>
                      )}
                      {entry.audioTranscript && !entry.aiRationale && (
                        <p className="text-xs mt-1 text-muted-foreground italic">"{entry.audioTranscript}"</p>
                      )}
                      {entry.aiRisksIdentified && (
                        <p className="text-xs mt-1 text-amber-700">⚠ {entry.aiRisksIdentified}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── My System Tab ────────────────────────────────────────────────────────────

const ADOPT_COLORS: Record<string, string> = {
  adopt: "bg-green-500/20 text-green-700 border-green-500/30",
  partial: "bg-blue-500/20 text-blue-700 border-blue-500/30",
  skip: "bg-slate-500/20 text-slate-500 border-slate-500/30",
  studying: "bg-amber-500/20 text-amber-700 border-amber-500/30",
};

const GATE_RULES = [
  {
    id: "iv",
    label: "Gate 1: IV Rank > 50",
    icon: "📊",
    description: "IVR must be above 50 — you're selling elevated premium, not cheap options",
    failNote: "If IVR < 50, the premium isn't fat enough. Wait for IV to expand.",
    color: "border-blue-500/40",
  },
  {
    id: "regime",
    label: "Gate 2: QQQ Regime Bullish",
    icon: "📈",
    description: "QQQ 10-day MA must be above 20-day MA — don't sell naked puts in a downtrend",
    failNote: "If QQQ is bearish, switch to spreads only. No naked puts.",
    color: "border-green-500/40",
  },
  {
    id: "range",
    label: "Gate 3: Clear Support/Resistance",
    icon: "🎯",
    description: "You must be able to define the range. If you can't draw the box, don't trade it.",
    failNote: "If range is unclear (trending hard, no structure), pass. Wait for consolidation.",
    color: "border-amber-500/40",
  },
  {
    id: "catalyst",
    label: "Gate 4: No Binary Event",
    icon: "📅",
    description: "No earnings, FDA, FOMC, or open-ended geopolitical event in the next 10 days",
    failNote: "Binary events are gap risk. Sell premium AFTER the event, not before.",
    color: "border-red-500/40",
  },
];

const SIZING_RULES = [
  { grade: "A+", gates: "All 4 pass", size: "15–20% of portfolio notional", color: "bg-green-500/20 text-green-700 border-green-500/30" },
  { grade: "A", gates: "3 of 4 pass", size: "8–12% of portfolio notional", color: "bg-blue-500/20 text-blue-700 border-blue-500/30" },
  { grade: "B", gates: "2 of 4 pass", size: "Don't take it", color: "bg-amber-500/20 text-amber-700 border-amber-500/30" },
  { grade: "Skip", gates: "0–1 pass", size: "Hard pass — FOMO is not a strategy", color: "bg-slate-500/20 text-slate-500 border-slate-500/30" },
];

const EXIT_RULES = [
  { rule: "Take Profit", detail: "Close at 50% of credit collected. Don't get greedy — theta decay accelerates after 50%." },
  { rule: "Stop Loss", detail: "Close if loss = 2× credit collected. No exceptions. No hoping." },
  { rule: "Roll Rule", detail: "If one leg is threatened with 5+ DTE remaining, roll that leg out 1 week for a credit or flat." },
  { rule: "Hard Stop", detail: "If stock closes beyond your short strike, close the position next morning at open. No overnight hope." },
  { rule: "Regime Stop", detail: "If QQQ 10-day crosses below 20-day, close all naked puts immediately. Switch to spreads only." },
  { rule: "Time Stop", detail: "With < 5 DTE and position not at 50% profit, close it. Gamma risk accelerates — not worth the last few dollars." },
];

const TICKER_UNIVERSE_PLAYBOOK = [
  { ticker: "WDC",  role: "Core",   ivProfile: "80–100%", why: "High IV, liquid options, you know the business well" },
  { ticker: "TSLA", role: "Core",   ivProfile: "80–120%", why: "Independent catalyst from hardware cycle, very liquid" },
  { ticker: "NVDA", role: "Core",   ivProfile: "60–90%",  why: "Highest options liquidity on earth, AI capex driver" },
  { ticker: "LITE", role: "Core",   ivProfile: "70–100%", why: "Telecom/optical cycle — uncorrelated to storage" },
  { ticker: "SMCI", role: "Core",   ivProfile: "80–130%", why: "High IV, AI server play, different from storage cycle" },
  { ticker: "ASML", role: "Core",   ivProfile: "50–80%",  why: "EUV monopoly, earnings-driven IV spikes" },
  { ticker: "META", role: "Add-on", ivProfile: "50–80%",  why: "Low correlation to hardware names, ad-tech cycle" },
  { ticker: "AMZN", role: "Add-on", ivProfile: "45–75%",  why: "AWS + retail, multi-catalyst, very liquid" },
  { ticker: "PLTR", role: "Add-on", ivProfile: "70–100%", why: "Defense AI, completely uncorrelated to tech hardware" },
];

function MySystemTab() {
  const regimeQuery = trpc.sriPlaybook.getQQQRegime.useQuery();
  const gateChecks = trpc.sriPlaybook.getGateChecks.useQuery();
  const saveGateMutation = trpc.sriPlaybook.saveGateCheck.useMutation({
    onSuccess: (data) => {
      toast.success(`Gate check saved — Grade: ${data.grade} (${data.gatesPassed}/4 gates)`);
      gateChecks.refetch();
      setGateForm({ ticker: "", strategy: "strangle", ivGatePass: false, ivRank: "", regimeGatePass: false, rangeGatePass: false, catalystGatePass: false, decision: "pending", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const [gateForm, setGateForm] = useState({
    ticker: "",
    strategy: "strangle",
    ivGatePass: false,
    ivRank: "",
    regimeGatePass: false,
    rangeGatePass: false,
    catalystGatePass: false,
    decision: "pending" as "entered" | "skipped" | "watching" | "pending",
    notes: "",
  });

  const gatesPassed = [gateForm.ivGatePass, gateForm.regimeGatePass, gateForm.rangeGatePass, gateForm.catalystGatePass].filter(Boolean).length;
  const liveGrade = gatesPassed === 4 ? "A+" : gatesPassed === 3 ? "A" : gatesPassed === 2 ? "B" : "Skip";
  const liveGradeColor = liveGrade === "A+" ? "text-green-600 bg-green-50 border-green-300" : liveGrade === "A" ? "text-blue-600 bg-blue-50 border-blue-300" : liveGrade === "B" ? "text-amber-600 bg-amber-50 border-amber-300" : "text-slate-500 bg-slate-50 border-slate-300";

  function handleSaveGate() {
    if (!gateForm.ticker) { toast.error("Enter a ticker"); return; }
    saveGateMutation.mutate({
      ticker: gateForm.ticker,
      strategy: gateForm.strategy,
      checkDate: new Date().toISOString().split("T")[0],
      ivGatePass: gateForm.ivGatePass,
      ivRank: gateForm.ivRank ? parseFloat(gateForm.ivRank) : undefined,
      regimeGatePass: gateForm.regimeGatePass,
      qqqRegimeNote: regimeQuery.data?.note,
      rangeGatePass: gateForm.rangeGatePass,
      catalystGatePass: gateForm.catalystGatePass,
      decision: gateForm.decision,
      notes: gateForm.notes || undefined,
    });
  }

  const regime = regimeQuery.data;

  return (
    <div className="space-y-6">
      {/* QQQ Regime Banner */}
      <Card className={`border-2 ${regime?.regime === "bullish" ? "border-green-500/50 bg-green-50" : regime?.regime === "bearish" ? "border-red-500/50 bg-red-50" : "border-amber-500/50 bg-amber-50"}`}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className={`text-2xl font-bold ${regime?.regime === "bullish" ? "text-green-700" : regime?.regime === "bearish" ? "text-red-700" : "text-amber-700"}`}>
              {regime?.regime === "bullish" ? "🟢" : regime?.regime === "bearish" ? "🔴" : "🟡"}
            </div>
            <div>
              <div className="font-semibold text-sm">
                QQQ Regime: {regime?.regime?.toUpperCase() ?? "Loading..."}
                {regime?.ma10 && regime?.ma20 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    10d MA ${regime.ma10.toFixed(2)} vs 20d MA ${regime.ma20.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{regime?.note ?? "Fetching QQQ data..."}</div>
            </div>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => regimeQuery.refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* The 4 Gates */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-600" /> The 4 Pre-Trade Gates
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {GATE_RULES.map(gate => (
            <Card key={gate.id} className={`border ${gate.color}`}>
              <CardContent className="py-3 px-4">
                <div className="font-semibold text-sm">{gate.icon} {gate.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{gate.description}</div>
                <div className="text-xs text-red-600 mt-1 italic">If fail: {gate.failNote}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pre-Trade Gate Checker */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" /> Pre-Trade Gate Checker
            <Badge className={`ml-auto border ${liveGradeColor} text-sm font-bold px-3`}>{liveGrade}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ticker</Label>
              <Input value={gateForm.ticker} onChange={e => setGateForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} placeholder="NVDA" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Strategy</Label>
              <Select value={gateForm.strategy} onValueChange={v => setGateForm(f => ({ ...f, strategy: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strangle">Strangle</SelectItem>
                  <SelectItem value="iron_condor">Iron Condor</SelectItem>
                  <SelectItem value="naked_put">Naked Put</SelectItem>
                  <SelectItem value="naked_call">Naked Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "ivGatePass", label: "Gate 1: IVR > 50", extra: <Input value={gateForm.ivRank} onChange={e => setGateForm(f => ({ ...f, ivRank: e.target.value }))} placeholder="IVR value" className="h-7 text-xs mt-1" /> },
              { key: "regimeGatePass", label: `Gate 2: QQQ Bullish (${regime?.regime ?? "..."})` },
              { key: "rangeGatePass", label: "Gate 3: Clear Range Defined" },
              { key: "catalystGatePass", label: "Gate 4: No Binary Event" },
            ].map(({ key, label, extra }) => (
              <div key={key} className={`rounded-lg border p-3 cursor-pointer transition-colors ${(gateForm as any)[key] ? "border-green-500 bg-green-50" : "border-border bg-muted/30"}`}
                onClick={() => setGateForm(f => ({ ...f, [key]: !(f as any)[key] }))}>
                <div className="flex items-center gap-2">
                  {(gateForm as any)[key] ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-xs font-medium">{label}</span>
                </div>
                {extra}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Decision</Label>
              <Select value={gateForm.decision} onValueChange={v => setGateForm(f => ({ ...f, decision: v as any }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entered">Entered Trade</SelectItem>
                  <SelectItem value="skipped">Skipped — Discipline</SelectItem>
                  <SelectItem value="watching">Watching</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={gateForm.notes} onChange={e => setGateForm(f => ({ ...f, notes: e.target.value }))} placeholder="Why skip / key level..." className="h-8 text-sm" />
            </div>
          </div>
          <Button onClick={handleSaveGate} disabled={saveGateMutation.isPending} size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white">
            {saveGateMutation.isPending ? "Saving..." : `Save Gate Check — ${liveGrade}`}
          </Button>
        </CardContent>
      </Card>

      {/* Position Sizing */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" /> Position Sizing by Grade
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SIZING_RULES.map(r => (
            <Card key={r.grade} className="border-border">
              <CardContent className="py-3 px-4 text-center">
                <Badge className={`border ${r.color} text-base font-bold px-3 mb-2`}>{r.grade}</Badge>
                <div className="text-xs text-muted-foreground">{r.gates}</div>
                <div className="text-sm font-semibold mt-1">{r.size}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Exit Rules */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-600" /> Exit Rules — Non-Negotiable
        </h3>
        <div className="space-y-2">
          {EXIT_RULES.map(r => (
            <div key={r.rule} className="flex gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <div className="font-semibold text-sm w-32 shrink-0 text-foreground">{r.rule}</div>
              <div className="text-sm text-muted-foreground">{r.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ticker Universe */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" /> Approved Ticker Universe
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>IV Profile</TableHead>
                <TableHead>Why It's In</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TICKER_UNIVERSE_PLAYBOOK.map(t => (
                <TableRow key={t.ticker}>
                  <TableCell className="font-mono font-bold">{t.ticker}</TableCell>
                  <TableCell><Badge className={t.role === "Core" ? "bg-green-500/20 text-green-700 border-green-500/30" : "bg-blue-500/20 text-blue-700 border-blue-500/30"}>{t.role}</Badge></TableCell>
                  <TableCell className="text-sm">{t.ivProfile}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.why}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Gate Check History */}
      {(gateChecks.data?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-600" /> Gate Check History
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Gates</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateChecks.data?.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.checkDate}</TableCell>
                    <TableCell className="font-mono font-bold">{c.ticker}</TableCell>
                    <TableCell className="text-xs">{c.strategy}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {[c.ivGatePass, c.regimeGatePass, c.rangeGatePass, c.catalystGatePass].map((p, i) => (
                          <span key={i}>{p ? "✅" : "❌"}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><Badge className={`border ${ADOPT_COLORS[c.overallGrade === "A+" ? "adopt" : c.overallGrade === "A" ? "partial" : "skip"] ?? ""}`}>{c.overallGrade}</Badge></TableCell>
                    <TableCell className="text-xs capitalize">{c.decision}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trader Journal Tab ───────────────────────────────────────────────────────

function TraderJournalTab() {
  const lessonsQuery = trpc.sriPlaybook.getLessons.useQuery();
  const addMutation = trpc.sriPlaybook.addLesson.useMutation({
    onSuccess: () => {
      toast.success("Lesson saved to your journal");
      setShowAdd(false);
      setForm({ traderName: "", sourceUrl: "", sourceType: "youtube", title: "", keyInsight: "", adoptDecision: "studying", adoptReason: "", applicableStrategies: "", tags: "" });
      lessonsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.sriPlaybook.updateLesson.useMutation({
    onSuccess: () => { toast.success("Updated"); lessonsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.sriPlaybook.deleteLesson.useMutation({
    onSuccess: () => { toast.success("Deleted"); lessonsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [filterAdopt, setFilterAdopt] = useState<string>("all");
  const [form, setForm] = useState({
    traderName: "",
    sourceUrl: "",
    sourceType: "youtube" as "youtube" | "article" | "book" | "podcast" | "other",
    title: "",
    keyInsight: "",
    adoptDecision: "studying" as "adopt" | "partial" | "skip" | "studying",
    adoptReason: "",
    applicableStrategies: "",
    tags: "",
  });

  const lessons = lessonsQuery.data ?? [];
  const filtered = filterAdopt === "all" ? lessons : lessons.filter(l => l.adoptDecision === filterAdopt);

  // Pre-populate with the two traders we've already studied
  const SEED_LESSONS = [
    {
      traderName: "Nour",
      sourceUrl: "https://youtu.be/_CWL-TWTuBo",
      sourceType: "youtube" as const,
      title: "IV Compression + Consolidation Breakout Strategy",
      keyInsight: "Wait for IV to compress during consolidation (options get cheap), then buy the breakout when volume surges 2.5×+ and tape confirms (buyers hitting ask). For premium sellers: this is the OPPOSITE signal — sell premium DURING consolidation when IV is compressed, close before the breakout.",
      adoptDecision: "partial" as const,
      adoptReason: "Nour buys options; we sell them. But the IV compression observation is directly useful — consolidation = cheap premium to sell, breakout = close position before IV spikes against us.",
      applicableStrategies: "strangle,iron_condor",
      tags: "iv_compression,consolidation,tape_reading,volume",
    },
    {
      traderName: "Qullamaggie / Lance",
      sourceUrl: "https://youtu.be/H01JbbEY7ac",
      sourceType: "youtube" as const,
      title: "Stair-Step Breakout + MA Trailing System",
      keyInsight: "Stocks make stair-step moves: big volume move up, then consolidation near 20-day MA, then next breakout. QQQ 10-day vs 20-day MA is the market regime filter — if 10d below 20d, stop buying breakouts. Lance exits immediately on MA break; Qullamaggie waits for daily close below MA.",
      adoptDecision: "adopt" as const,
      adoptReason: "QQQ regime filter (10d vs 20d MA) is now Gate 2 of our pre-trade system. Stair-step pattern tells us when a stock is in a healthy uptrend — good backdrop for selling puts (trend is our friend on the short put side). Exhaustion gap far above 20d MA = good call-selling setup.",
      applicableStrategies: "naked_put,naked_call,strangle",
      tags: "qqqregime,ma_filter,stair_step,trend,exhaustion_gap",
    },
  ];

  function handleSeedLessons() {
    SEED_LESSONS.forEach(l => addMutation.mutate(l));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-600" /> Trader Lessons Journal
          <Badge variant="outline">{lessons.length} entries</Badge>
        </h3>
        <div className="ml-auto flex gap-2 flex-wrap">
          {["all", "adopt", "partial", "studying", "skip"].map(f => (
            <Button key={f} size="sm" variant={filterAdopt === f ? "default" : "outline"} onClick={() => setFilterAdopt(f)} className="capitalize text-xs h-7">
              {f}
            </Button>
          ))}
          {lessons.length === 0 && (
            <Button size="sm" variant="outline" onClick={handleSeedLessons} className="text-xs h-7 border-blue-300 text-blue-600">
              <Sparkles className="w-3 h-3 mr-1" /> Seed from studied traders
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(v => !v)} className="bg-green-600 hover:bg-green-700 text-white h-7">
            <Plus className="w-3 h-3 mr-1" /> Add Lesson
          </Button>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <Card className="border-green-500/30 bg-green-50/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Trader Name</Label>
                <Input value={form.traderName} onChange={e => setForm(f => ({ ...f, traderName: e.target.value }))} placeholder="e.g. Nour, Qullamaggie" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Source Type</Label>
                <Select value={form.sourceType} onValueChange={v => setForm(f => ({ ...f, sourceType: v as any }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="podcast">Podcast</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Source URL (optional)</Label>
                <Input value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://youtube.com/..." className="h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Title / Topic</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. IV Compression + Breakout Strategy" className="h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Key Insight (what did you learn?)</Label>
                <Textarea value={form.keyInsight} onChange={e => setForm(f => ({ ...f, keyInsight: e.target.value }))} placeholder="The core lesson in your own words..." rows={3} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Adopt Decision</Label>
                <Select value={form.adoptDecision} onValueChange={v => setForm(f => ({ ...f, adoptDecision: v as any }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adopt">✅ Adopt — adding to my system</SelectItem>
                    <SelectItem value="partial">🔵 Partial — adapt for my style</SelectItem>
                    <SelectItem value="studying">🟡 Still studying</SelectItem>
                    <SelectItem value="skip">⬜ Skip — not for me</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Applicable Strategies (comma-sep)</Label>
                <Input value={form.applicableStrategies} onChange={e => setForm(f => ({ ...f, applicableStrategies: e.target.value }))} placeholder="strangle, naked_put" className="h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Why adopt / skip?</Label>
                <Textarea value={form.adoptReason} onChange={e => setForm(f => ({ ...f, adoptReason: e.target.value }))} placeholder="Reason for your decision..." rows={2} className="text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={() => addMutation.mutate(form)} disabled={addMutation.isPending || !form.traderName || !form.title || !form.keyInsight} className="bg-green-600 hover:bg-green-700 text-white">
                {addMutation.isPending ? "Saving..." : "Save Lesson"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lessons List */}
      {lessonsQuery.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading lessons...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div className="font-semibold">No lessons yet</div>
            <div className="text-sm mt-1">Click "Seed from studied traders" to add Nour + Qullamaggie lessons, or add your own.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(lesson => (
            <Card key={lesson.id} className="border-border">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{lesson.traderName}</span>
                      <Badge className={`border text-xs ${ADOPT_COLORS[lesson.adoptDecision] ?? ""}`}>
                        {lesson.adoptDecision === "adopt" ? "✅ Adopted" : lesson.adoptDecision === "partial" ? "🔵 Partial" : lesson.adoptDecision === "studying" ? "🟡 Studying" : "⬜ Skipped"}
                      </Badge>
                      {lesson.sourceUrl && (
                        <a href={lesson.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Source
                        </a>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="font-medium text-sm mt-1">{lesson.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{lesson.keyInsight}</div>
                    {lesson.adoptReason && (
                      <div className="text-xs text-foreground mt-1 italic border-l-2 border-green-500/50 pl-2">
                        {lesson.adoptReason}
                      </div>
                    )}
                    {lesson.applicableStrategies && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {lesson.applicableStrategies.split(",").map(s => (
                          <Badge key={s} variant="outline" className="text-xs">{s.trim()}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(["adopt", "partial", "studying", "skip"] as const).map(d => (
                      <Button key={d} size="sm" variant="ghost" className={`h-6 w-6 p-0 text-xs ${lesson.adoptDecision === d ? "bg-muted" : ""}`}
                        onClick={() => updateMutation.mutate({ id: lesson.id, adoptDecision: d })}>
                        {d === "adopt" ? "✅" : d === "partial" ? "🔵" : d === "studying" ? "🟡" : "⬜"}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      onClick={() => deleteMutation.mutate({ id: lesson.id })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
