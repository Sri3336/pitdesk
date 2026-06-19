import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Minus, Trash2, RefreshCw,
  Download, Search, Filter, CheckSquare, Square, BarChart3,
  Target, Clock, DollarSign, Percent, StickyNote, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Rec = {
  id: number;
  userId?: number | null;
  userName?: string | null;
  userEmail?: string | null;
  ticker: string;
  strategy: string;
  targetDte: number;
  entryDate: Date;
  expiryDate: Date;
  entryPrice: string;
  netCredit: string;
  maxProfit: string | null;
  maxLoss: string | null;
  compositeScore: string;
  pop: string;
  bpRequired: string;
  status: "open" | "resolved" | "expired";
  exitPrice: string | null;
  actualPnl: string | null;
  actualPnlPct: string | null;
  outcome: "win" | "loss" | "breakeven" | null;
  resolvedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  "Iron Condor": "#f59e0b",
  "Short Strangle": "#8b5cf6",
  "Naked Put": "#10b981",
  "Naked Call": "#ef4444",
  "Bull Put Spread": "#22c55e",
  "Bear Call Spread": "#f97316",
  "Bull Call Spread": "#3b82f6",
  "Bear Put Spread": "#ec4899",
  "Long Straddle": "#06b6d4",
  "Long Strangle": "#a78bfa",
  "Cash-Secured Put": "#84cc16",
  "Covered Call": "#fb923c",
  "Butterfly Spread": "#e879f9",
};

function fmt(v: string | null | undefined, decimals = 2) {
  if (v == null) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : n.toFixed(decimals);
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <Badge variant="outline" className="text-slate-500">Open</Badge>;
  if (outcome === "win") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Win</Badge>;
  if (outcome === "loss") return <Badge className="bg-red-100 text-red-700 border-red-200">Loss</Badge>;
  return <Badge className="bg-slate-100 text-slate-600 border-slate-200">B/E</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Open</Badge>;
  if (status === "resolved") return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Resolved</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Expired</Badge>;
}

// ─── Stats Summary ────────────────────────────────────────────────────────────

function StatsSummary({ recs }: { recs: Rec[] }) {
  const resolved = recs.filter(r => r.status === "resolved" && r.outcome);
  const wins = resolved.filter(r => r.outcome === "win").length;
  const losses = resolved.filter(r => r.outcome === "loss").length;
  const winRate = resolved.length > 0 ? (wins / resolved.length) * 100 : 0;
  const totalPnl = resolved.reduce((sum, r) => sum + (parseFloat(r.actualPnl ?? "0") * 100), 0);
  const avgPnlPct = resolved.length > 0
    ? resolved.reduce((sum, r) => sum + parseFloat(r.actualPnlPct ?? "0"), 0) / resolved.length
    : 0;
  const open = recs.filter(r => r.status === "open").length;

  // Strategy breakdown for pie chart
  const stratBreakdown = Object.entries(
    resolved.reduce((acc, r) => {
      acc[r.strategy] = (acc[r.strategy] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, count]) => ({ name, count, color: STRATEGY_COLORS[name] ?? "#94a3b8" }));

  // Monthly P&L bar chart
  const monthlyPnl = Object.entries(
    resolved.reduce((acc, r) => {
      const key = new Date(r.resolvedAt ?? r.expiryDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      acc[key] = (acc[key] ?? 0) + parseFloat(r.actualPnl ?? "0") * 100;
      return acc;
    }, {} as Record<string, number>)
  ).map(([month, pnl]) => ({ month, pnl })).slice(-12);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Win Rate</span>
            </div>
            <div className={`text-2xl font-bold font-mono ${winRate >= 60 ? "text-emerald-600" : winRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
              {resolved.length > 0 ? `${winRate.toFixed(0)}%` : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">{wins}W / {losses}L of {resolved.length} resolved</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Total P&L</span>
            </div>
            <div className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {resolved.length > 0 ? `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)}` : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">across all resolved trades</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Avg Return</span>
            </div>
            <div className={`text-2xl font-bold font-mono ${avgPnlPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {resolved.length > 0 ? `${avgPnlPct >= 0 ? "+" : ""}${avgPnlPct.toFixed(1)}%` : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">% of BP required</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Open Trades</span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-600">{open}</div>
            <div className="text-xs text-slate-400 mt-1">awaiting expiry</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Total Tracked</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-700">{recs.length}</div>
            <div className="text-xs text-slate-400 mt-1">all time</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      {resolved.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly P&L bar chart */}
          {monthlyPnl.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-slate-700">Monthly P&L ($)</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={monthlyPnl} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={v => `$${v}`} />
                    <RechartTooltip formatter={(v: number) => [`$${v.toFixed(0)}`, "P&L"]} />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                      {monthlyPnl.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Strategy breakdown pie */}
          {stratBreakdown.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-slate-700">Strategy Mix (resolved)</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={stratBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {stratBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Row component ────────────────────────────────────────────────────────────

function RecRow({
  rec, selected, onSelect, onResolve, onDelete, onNotesSave, resolving, isAdmin,
}: {
  rec: Rec;
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onResolve: (id: number) => void;
  onDelete: (id: number) => void;
  onNotesSave: (id: number, notes: string) => void;
  resolving: boolean;
  isAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(rec.notes ?? "");
  const pnl = rec.actualPnl != null ? parseFloat(rec.actualPnl) * 100 : null;
  const pnlPct = rec.actualPnlPct != null ? parseFloat(rec.actualPnlPct) : null;
  const isExpired = new Date(rec.expiryDate) < new Date();

  return (
    <div className={`border rounded-lg transition-all ${selected ? "border-blue-300 bg-blue-50/30" : "border-slate-200 bg-white"}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelect(rec.id, !!v)}
          className="shrink-0"
        />

        {/* Ticker + strategy */}
        <div className="w-28 shrink-0">
          <div className="font-bold text-slate-800 font-mono text-sm">{rec.ticker}</div>
          <div className="text-xs text-slate-500 truncate">{rec.strategy}</div>
          {isAdmin && rec.userName && (
            <div className="text-xs text-amber-600 truncate mt-0.5">{rec.userName}</div>
          )}
        </div>

        {/* Dates */}
        <div className="hidden md:block w-24 shrink-0">
          <div className="text-xs text-slate-500">Entry</div>
          <div className="text-xs font-medium text-slate-700">{fmtDate(rec.entryDate)}</div>
          <div className="text-xs text-slate-400">{rec.targetDte}d DTE</div>
        </div>

        <div className="hidden lg:block w-24 shrink-0">
          <div className="text-xs text-slate-500">Expiry</div>
          <div className={`text-xs font-medium ${isExpired && rec.status === "open" ? "text-amber-600" : "text-slate-700"}`}>
            {fmtDate(rec.expiryDate)}
          </div>
          {isExpired && rec.status === "open" && <div className="text-xs text-amber-500">Past expiry</div>}
        </div>

        {/* Entry details */}
        <div className="hidden xl:block w-20 shrink-0">
          <div className="text-xs text-slate-500">Entry $</div>
          <div className="text-xs font-mono font-medium text-slate-700">${fmt(rec.entryPrice)}</div>
        </div>

        <div className="hidden xl:block w-20 shrink-0">
          <div className="text-xs text-slate-500">Credit</div>
          <div className="text-xs font-mono font-medium text-emerald-700">+${fmt(rec.netCredit)}</div>
        </div>

        {/* Score + POP */}
        <div className="hidden lg:block w-16 shrink-0 text-center">
          <div className="text-xs text-slate-500">Score</div>
          <div className="text-xs font-mono font-bold text-amber-600">{fmt(rec.compositeScore, 1)}</div>
        </div>

        {/* Status + outcome */}
        <div className="w-20 shrink-0">
          <StatusBadge status={rec.status} />
        </div>

        {/* P&L */}
        <div className="w-24 shrink-0">
          {pnl != null ? (
            <div className={`text-sm font-bold font-mono ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
              <div className="text-xs font-normal">
                {pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : ""}
              </div>
            </div>
          ) : (
            <OutcomeBadge outcome={rec.outcome} />
          )}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {rec.status === "open" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onResolve(rec.id)}
              disabled={resolving}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${resolving ? "animate-spin" : ""}`} />
              Resolve
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500">
                <Trash2 className="w-3 h-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete recommendation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the tracked recommendation for {rec.ticker} ({rec.strategy}) entered on {fmtDate(rec.entryDate)}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => onDelete(rec.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 bg-slate-50/50 rounded-b-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs mb-3">
            <div>
              <div className="text-slate-400 mb-0.5">Entry Price</div>
              <div className="font-mono font-medium">${fmt(rec.entryPrice)}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">Net Credit</div>
              <div className="font-mono font-medium text-emerald-700">+${fmt(rec.netCredit)}/sh</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">Max Profit</div>
              <div className="font-mono font-medium">{rec.maxProfit ? `$${fmt(rec.maxProfit)}` : "Unlimited"}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">Max Loss</div>
              <div className="font-mono font-medium text-red-600">{rec.maxLoss ? `$${fmt(rec.maxLoss)}` : "Unlimited"}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">POP</div>
              <div className="font-mono font-medium">{(parseFloat(rec.pop) * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">BP Required</div>
              <div className="font-mono font-medium">${parseFloat(rec.bpRequired).toLocaleString()}</div>
            </div>
            {rec.exitPrice && (
              <div>
                <div className="text-slate-400 mb-0.5">Exit Price</div>
                <div className="font-mono font-medium">${fmt(rec.exitPrice)}</div>
              </div>
            )}
            {rec.resolvedAt && (
              <div>
                <div className="text-slate-400 mb-0.5">Resolved</div>
                <div className="font-medium">{fmtDate(rec.resolvedAt)}</div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1">
              <StickyNote className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Notes</span>
              {!editingNotes && (
                <Button size="sm" variant="ghost" className="h-5 px-1 text-xs text-slate-400" onClick={() => setEditingNotes(true)}>
                  Edit
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="flex gap-2">
                <Textarea
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  className="text-xs h-16 resize-none"
                  placeholder="Add notes about this trade..."
                />
                <div className="flex flex-col gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => { onNotesSave(rec.id, notesText); setEditingNotes(false); }}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingNotes(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">{rec.notes || "No notes yet."}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Performance() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data: recs = [], isLoading } = trpc.recommendations.list.useQuery();

  const deleteMutation = trpc.recommendations.delete.useMutation({
    onSuccess: () => { utils.recommendations.list.invalidate(); toast.success("Recommendation deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMutation = trpc.recommendations.deleteMany.useMutation({
    onSuccess: (_, vars) => { utils.recommendations.list.invalidate(); toast.success(`Deleted ${vars.ids.length} recommendations`); setSelected([]); },
    onError: (e) => toast.error(e.message),
  });
  const resolveMutation = trpc.recommendations.resolve.useMutation({
    onSuccess: (data) => {
      utils.recommendations.list.invalidate();
      if ((data as any).alreadyResolved) {
        toast.info("Already resolved");
      } else {
        const d = data as any;
        toast.success(`Resolved: ${d.outcome === "win" ? "✓ Win" : d.outcome === "loss" ? "✗ Loss" : "≈ Breakeven"} — Exit $${parseFloat(d.exitPrice).toFixed(2)}, P&L ${d.pnlPerShare >= 0 ? "+" : ""}$${(d.pnlPerShare * 100).toFixed(0)}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const updateNotesMutation = trpc.recommendations.updateNotes.useMutation({
    onSuccess: () => { utils.recommendations.list.invalidate(); toast.success("Notes saved"); },
  });

  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved" | "expired">("all");
  const [filterStrategy, setFilterStrategy] = useState("all");
  const [filterOutcome, setFilterOutcome] = useState<"all" | "win" | "loss" | "breakeven">("all");
  const [sortBy, setSortBy] = useState<"date" | "pnl" | "score">("date");
  const [dateFrom, setDateFrom] = useState(""); // ISO date string YYYY-MM-DD
  const [dateTo, setDateTo] = useState("");   // ISO date string YYYY-MM-DD
  const [filterUser, setFilterUser] = useState("all");

  const strategies = useMemo(() => {
    const s = new Set((recs as Rec[]).map(r => r.strategy));
    return ["all", ...Array.from(s).sort()];
  }, [recs]);

  // Build unique user list for admin filter
  const userOptions = useMemo(() => {
    if (!isAdmin || !recs) return [];
    const seen = new Map<string, string>();
    for (const r of recs as Rec[]) {
      if (r.userId != null) {
        const key = String(r.userId);
        if (!seen.has(key)) seen.set(key, r.userName ?? r.userEmail ?? `User ${r.userId}`);
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [recs, isAdmin]);

  const filtered = useMemo(() => {
    let rows = recs as Rec[];
    // Admin user filter
    if (isAdmin && filterUser !== "all") rows = rows.filter(r => String(r.userId) === filterUser);
    if (search) rows = rows.filter(r => r.ticker.toLowerCase().includes(search.toLowerCase()) || r.strategy.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus !== "all") rows = rows.filter(r => r.status === filterStatus);
    if (filterStrategy !== "all") rows = rows.filter(r => r.strategy === filterStrategy);
    if (filterOutcome !== "all") rows = rows.filter(r => r.outcome === filterOutcome);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      rows = rows.filter(r => new Date(r.entryDate).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // inclusive end of day
      rows = rows.filter(r => new Date(r.entryDate).getTime() <= to);
    }
    if (sortBy === "pnl") rows = [...rows].sort((a, b) => parseFloat(b.actualPnl ?? "0") - parseFloat(a.actualPnl ?? "0"));
    else if (sortBy === "score") rows = [...rows].sort((a, b) => parseFloat(b.compositeScore) - parseFloat(a.compositeScore));
    else rows = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }, [recs, search, filterStatus, filterStrategy, filterOutcome, sortBy, dateFrom, dateTo]);

  function toggleSelect(id: number, checked: boolean) {
    setSelected(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  }

  function toggleSelectAll() {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map(r => r.id));
  }

  function exportCsv() {
    const headers = ["ID", "Ticker", "Strategy", "Entry Date", "Expiry Date", "Entry Price", "Net Credit", "Max Profit", "Max Loss", "POP", "BP Required", "Score", "Status", "Exit Price", "P&L ($)", "P&L (%)", "Outcome", "Notes"];
    const rows = filtered.map(r => [
      r.id, r.ticker, r.strategy,
      fmtDate(r.entryDate), fmtDate(r.expiryDate),
      fmt(r.entryPrice), fmt(r.netCredit),
      r.maxProfit ? fmt(r.maxProfit) : "Unlimited",
      r.maxLoss ? fmt(r.maxLoss) : "Unlimited",
      (parseFloat(r.pop) * 100).toFixed(1) + "%",
      parseFloat(r.bpRequired).toFixed(0),
      fmt(r.compositeScore, 1),
      r.status,
      r.exitPrice ? fmt(r.exitPrice) : "",
      r.actualPnl ? (parseFloat(r.actualPnl) * 100).toFixed(0) : "",
      r.actualPnlPct ? parseFloat(r.actualPnlPct).toFixed(2) + "%" : "",
      r.outcome ?? "",
      (r.notes ?? "").replace(/,/g, ";"),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "performance_tracker.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  const resolveAllOpen = async () => {
    const openIds = filtered.filter(r => r.status === "open").map(r => r.id);
    if (!openIds.length) { toast.info("No open recommendations to resolve"); return; }
    toast.info(`Resolving ${openIds.length} open recommendations...`);
    for (const id of openIds) {
      await resolveMutation.mutateAsync({ id });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Admin banner */}
      {isAdmin && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
          <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="font-medium">Admin view</span> — showing all users' tracked recommendations.
          {userOptions.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-amber-600">Filter by user:</span>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="h-7 text-xs w-44 bg-white border-amber-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {userOptions.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Performance Tracker</h1>
          <p className="text-sm text-slate-500 mt-0.5">{isAdmin ? "All users' tracked recommendations and outcomes." : "Track every recommendation against actual market outcomes"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resolveAllOpen} disabled={resolveMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${resolveMutation.isPending ? "animate-spin" : ""}`} />
            Resolve All Open
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && (recs as Rec[]).length > 0 && <StatsSummary recs={recs as Rec[]} />}

      {/* Filters */}
      <Card className="border-slate-200">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Search ticker or strategy..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm w-48"
              />
            </div>
            <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
              <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStrategy} onValueChange={setFilterStrategy}>
              <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {strategies.map(s => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All Strategies" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterOutcome} onValueChange={(v: any) => setFilterOutcome(v)}>
              <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="win">Wins</SelectItem>
                <SelectItem value="loss">Losses</SelectItem>
                <SelectItem value="breakeven">Breakeven</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort: Date</SelectItem>
                <SelectItem value="pnl">Sort: P&L</SelectItem>
                <SelectItem value="score">Sort: Score</SelectItem>
              </SelectContent>
            </Select>
            {/* Date range filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 shrink-0">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <span className="text-xs text-slate-400 shrink-0">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-slate-400" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                  ✕
                </Button>
              )}
            </div>
            <div className="ml-auto text-xs text-slate-400">{filtered.length} of {(recs as Rec[]).length} records</div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm text-blue-700 font-medium">{selected.length} selected</span>
          {/* Bulk Resolve Selected (only open ones) */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            disabled={resolveMutation.isPending}
            onClick={async () => {
              const openSelected = selected.filter(id => {
                const rec = (recs as Rec[]).find(r => r.id === id);
                return rec?.status === "open";
              });
              if (!openSelected.length) { toast.info("No open recommendations in selection"); return; }
              toast.info(`Resolving ${openSelected.length} selected open recommendations...`);
              for (const id of openSelected) {
                await resolveMutation.mutateAsync({ id });
              }
              setSelected([]);
            }}
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${resolveMutation.isPending ? "animate-spin" : ""}`} />
            Resolve Selected
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" className="h-7 text-xs">
                <Trash2 className="w-3 h-3 mr-1" /> Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.length} recommendations?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove {selected.length} tracked recommendations. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteManyMutation.mutate({ ids: selected })}>
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table header */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1 text-xs text-slate-400 font-medium">
          <Checkbox
            checked={selected.length === filtered.length && filtered.length > 0}
            onCheckedChange={toggleSelectAll}
            className="shrink-0"
          />
          <span className="w-28 shrink-0">Ticker / Strategy</span>
          <span className="hidden md:block w-24 shrink-0">Entry</span>
          <span className="hidden lg:block w-24 shrink-0">Expiry</span>
          <span className="hidden xl:block w-20 shrink-0">Entry $</span>
          <span className="hidden xl:block w-20 shrink-0">Credit</span>
          <span className="hidden lg:block w-16 shrink-0 text-center">Score</span>
          <span className="w-20 shrink-0">Status</span>
          <span className="w-24 shrink-0">P&L / Outcome</span>
        </div>
      )}

      {/* Rows */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading recommendations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <div className="font-medium text-slate-500 mb-1">No recommendations tracked yet</div>
          <div className="text-sm">Every time you run an analysis, the top recommendation is automatically saved here for backtesting.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(rec => (
            <RecRow
              key={rec.id}
              rec={rec}
              selected={selected.includes(rec.id)}
              onSelect={toggleSelect}
              onResolve={(id) => resolveMutation.mutate({ id })}
              onDelete={(id) => deleteMutation.mutate({ id })}
              onNotesSave={(id, notes) => updateNotesMutation.mutate({ id, notes })}
              resolving={resolveMutation.isPending}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
