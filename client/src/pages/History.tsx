import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, History as HistoryIcon, TrendingUp, GitCompare, X,
  ShieldCheck, Trash2, Filter, FilterX,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const STRATEGY_BADGES: Record<string, string> = {
  "Naked Put": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Cash-Secured Put": "bg-green-50 text-green-700 border-green-200",
  "Covered Call": "bg-orange-50 text-orange-700 border-orange-200",
  "Bull Put Spread": "bg-teal-50 text-teal-700 border-teal-200",
  "Bear Call Spread": "bg-rose-50 text-rose-700 border-rose-200",
  "Short Strangle": "bg-purple-50 text-purple-700 border-purple-200",
  "Iron Condor": "bg-amber-50 text-amber-700 border-amber-200",
  "Naked Call": "bg-red-50 text-red-700 border-red-200",
  "Bull Call Spread": "bg-blue-50 text-blue-700 border-blue-200",
  "Bear Put Spread": "bg-pink-50 text-pink-700 border-pink-200",
  "Long Straddle": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Long Strangle": "bg-sky-50 text-sky-700 border-sky-200",
  "Butterfly Spread": "bg-violet-50 text-violet-700 border-violet-200",
};

const BIAS_COLORS: Record<string, string> = {
  Bullish: "text-emerald-700",
  Bearish: "text-red-700",
  Neutral: "text-amber-700",
};

const CREDIT_STRATEGIES = [
  "Naked Put", "Naked Call", "Short Strangle", "Iron Condor",
  "Bull Put Spread", "Bear Call Spread", "Cash-Secured Put", "Covered Call",
];
const DEBIT_STRATEGIES = [
  "Bull Call Spread", "Bear Put Spread", "Long Straddle", "Long Strangle", "Butterfly Spread",
];

type Run = {
  id: number;
  userId?: number | null;
  ticker: string;
  createdAt: number;
  recommendation: string | null;
  compositeScore: string | number | null;
  lastPrice: string | number | null;
  ivRvRatio: string | number | null;
  directionalBias: string | null;
  rsi: string | number | null;
  targetDte: number;
  accountSize: number;
  userName?: string | null;
  userEmail?: string | null;
};

function fmt(val: string | number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return parseFloat(String(val)).toFixed(decimals);
}

function DiffCell({
  labelA, labelB, a, b,
  format = (v: string | number | null) => fmt(v),
  higherIsBetter,
}: {
  labelA: string; labelB: string;
  a: string | number | null; b: string | number | null;
  format?: (v: string | number | null) => string;
  higherIsBetter?: boolean;
}) {
  const aNum = a != null ? parseFloat(String(a)) : null;
  const bNum = b != null ? parseFloat(String(b)) : null;
  let aClass = "text-slate-800";
  let bClass = "text-slate-800";
  if (aNum != null && bNum != null && aNum !== bNum) {
    const aWins = higherIsBetter ? aNum > bNum : aNum < bNum;
    aClass = aWins ? "text-emerald-700 font-semibold" : "text-red-600";
    bClass = aWins ? "text-red-600" : "text-emerald-700 font-semibold";
  }
  return (
    <div className="grid grid-cols-2 gap-2 text-sm py-2 border-b border-slate-100 last:border-0">
      <div>
        <span className="text-xs text-slate-400 block">{labelA}</span>
        <span className={aClass}>{format(a)}</span>
      </div>
      <div>
        <span className="text-xs text-slate-400 block">{labelB}</span>
        <span className={bClass}>{format(b)}</span>
      </div>
    </div>
  );
}

function ComparePanel({ runA, runB, onClose }: { runA: Run; runB: Run; onClose: () => void }) {
  const dateA = new Date(runA.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dateB = new Date(runB.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <Card className="border-primary/30 bg-primary/5 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-primary">
            <GitCompare className="h-4 w-4" />Comparison
          </CardTitle>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-400">Run A</p>
            <p className="font-bold text-slate-800 font-mono">{runA.ticker}</p>
            <p className="text-xs text-slate-500">{dateA}</p>
          </div>
          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-400">Run B</p>
            <p className="font-bold text-slate-800 font-mono">{runB.ticker}</p>
            <p className="text-xs text-slate-500">{dateB}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="grid grid-cols-2 gap-2 text-sm py-2 border-b border-slate-100">
          <div>
            <span className="text-xs text-slate-400 block">Strategy (A)</span>
            {runA.recommendation ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${STRATEGY_BADGES[runA.recommendation] ?? "bg-muted text-muted-foreground"}`}>{runA.recommendation}</span>
            ) : <span className="text-slate-400">—</span>}
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Strategy (B)</span>
            {runB.recommendation ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${STRATEGY_BADGES[runB.recommendation] ?? "bg-muted text-muted-foreground"}`}>{runB.recommendation}</span>
            ) : <span className="text-slate-400">—</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm py-2 border-b border-slate-100">
          <div>
            <span className="text-xs text-slate-400 block">Bias (A)</span>
            <span className={`font-medium ${BIAS_COLORS[runA.directionalBias ?? ""] ?? "text-slate-500"}`}>{runA.directionalBias ?? "—"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Bias (B)</span>
            <span className={`font-medium ${BIAS_COLORS[runB.directionalBias ?? ""] ?? "text-slate-500"}`}>{runB.directionalBias ?? "—"}</span>
          </div>
        </div>
        <DiffCell labelA="Score (A)" labelB="Score (B)" a={runA.compositeScore} b={runB.compositeScore} higherIsBetter />
        <DiffCell labelA="Last Price (A)" labelB="Last Price (B)" a={runA.lastPrice} b={runB.lastPrice} format={(v) => v != null ? `$${fmt(v)}` : "—"} />
        <DiffCell labelA="IV/RV (A)" labelB="IV/RV (B)" a={runA.ivRvRatio} b={runB.ivRvRatio} higherIsBetter />
        <DiffCell labelA="RSI (A)" labelB="RSI (B)" a={runA.rsi} b={runB.rsi} format={(v) => fmt(v, 1)} />
        <div className="grid grid-cols-2 gap-2 text-sm py-2">
          <div><span className="text-xs text-slate-400 block">DTE (A)</span><span className="text-slate-800">{runA.targetDte}d</span></div>
          <div><span className="text-xs text-slate-400 block">DTE (B)</span><span className="text-slate-800">{runB.targetDte}d</span></div>
        </div>
        <p className="text-xs text-slate-400 pt-2">
          <span className="text-emerald-700 font-semibold">Green</span> = better value for that metric.
        </p>
      </CardContent>
    </Card>
  );
}

export default function History() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data: runs, isLoading, error } = trpc.analysis.history.useQuery();

  // ── Compare state ──────────────────────────────────────────────────────────
  const [compareIds, setCompareIds] = useState<number[]>([]);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterTicker, setFilterTicker] = useState("");
  const [filterType, setFilterType] = useState<"all" | "credit" | "debit">("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterUser, setFilterUser] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Selection state ────────────────────────────────────────────────────────
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  // ── Delete dialog state ────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ type: "single"; id: number } | { type: "bulk"; ids: number[] } | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteOneMutation = trpc.analysis.deleteOne.useMutation({
    onSuccess: () => {
      utils.analysis.history.invalidate();
      toast.success("Analysis run deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMutation = trpc.analysis.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.analysis.history.invalidate();
      setCheckedIds(new Set());
      toast.success(`${data.deleted} run${data.deleted !== 1 ? "s" : ""} deleted.`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Build user options for admin filter ───────────────────────────────────
  const userOptions = useMemo(() => {
    if (!isAdmin || !runs) return [];
    const seen = new Map<string, string>();
    for (const r of (runs as unknown as Run[])) {
      if (r.userId != null) {
        const key = String(r.userId);
        if (!seen.has(key)) seen.set(key, r.userName ?? r.userEmail ?? `User ${r.userId}`);
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [runs, isAdmin]);

  // ── Apply filters ──────────────────────────────────────────────────────────
  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    let list = runs as unknown as Run[];

    if (isAdmin && filterUser !== "all") {
      list = list.filter(r => String(r.userId) === filterUser);
    }
    if (filterTicker.trim()) {
      const t = filterTicker.trim().toUpperCase();
      list = list.filter(r => r.ticker.toUpperCase().includes(t));
    }
    if (filterType === "credit") {
      list = list.filter(r => r.recommendation && CREDIT_STRATEGIES.includes(r.recommendation));
    } else if (filterType === "debit") {
      list = list.filter(r => r.recommendation && DEBIT_STRATEGIES.includes(r.recommendation));
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime();
      list = list.filter(r => r.createdAt >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(r => r.createdAt <= to.getTime());
    }
    return list;
  }, [runs, isAdmin, filterUser, filterTicker, filterType, filterDateFrom, filterDateTo]);

  const hasActiveFilters = filterTicker.trim() || filterType !== "all" || filterDateFrom || filterDateTo;

  function clearFilters() {
    setFilterTicker("");
    setFilterType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  // ── Compare selection ──────────────────────────────────────────────────────
  function toggleCompare(id: number) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const runA = filteredRuns.find(r => r.id === compareIds[0]) as Run | undefined;
  const runB = filteredRuns.find(r => r.id === compareIds[1]) as Run | undefined;
  const compareReady = !!runA && !!runB;

  // ── Bulk checkbox helpers ──────────────────────────────────────────────────
  const allFilteredIds = filteredRuns.map(r => r.id);
  const allChecked = allFilteredIds.length > 0 && allFilteredIds.every(id => checkedIds.has(id));
  const someChecked = allFilteredIds.some(id => checkedIds.has(id));

  function toggleAll() {
    if (allChecked) {
      setCheckedIds(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setCheckedIds(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function toggleCheck(id: number) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const checkedInView = allFilteredIds.filter(id => checkedIds.has(id));

  // ── Confirm delete ─────────────────────────────────────────────────────────
  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "single") {
      deleteOneMutation.mutate({ id: deleteTarget.id });
    } else {
      bulkDeleteMutation.mutate({ ids: deleteTarget.ids });
    }
    setDeleteTarget(null);
  }

  const deleteDialogCount = deleteTarget?.type === "single" ? 1 : (deleteTarget?.ids.length ?? 0);

  return (
    <div className="min-h-screen p-6 max-w-[1200px] mx-auto space-y-6">

      {/* Admin banner */}
      {isAdmin && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
          <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="font-medium">Admin view</span> — showing all users' analysis history.
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

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-gold">Analysis History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "All users' strategy analyses, most recent first." : "Past strategy analyses run under your account, most recent first."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filteredRuns.length >= 2 && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <GitCompare className="h-3.5 w-3.5 text-primary" />
              Select two rows to compare
              {compareIds.length > 0 && (
                <Button size="sm" variant="ghost" className="h-5 px-1 text-xs text-slate-400" onClick={() => setCompareIds([])}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          )}
          <Button
            size="sm"
            variant={filtersOpen ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => setFiltersOpen(v => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && <span className="ml-0.5 bg-primary/20 text-primary rounded-full px-1.5 py-0 text-[10px] font-bold">●</span>}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {filtersOpen && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Ticker</Label>
                <Input
                  placeholder="e.g. AAPL"
                  value={filterTicker}
                  onChange={e => setFilterTicker(e.target.value)}
                  className="h-8 text-sm uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Strategy Type</Label>
                <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="credit">Credit Only</SelectItem>
                    <SelectItem value="debit">Debit Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Date From</Label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Date To</Label>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{filteredRuns.length}</span> of <span className="font-semibold text-foreground">{(runs as unknown as Run[])?.length ?? 0}</span> runs
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
                  <FilterX className="h-3 w-3" /> Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {checkedInView.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-red-800">
            {checkedInView.length} run{checkedInView.length !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5 ml-auto"
            onClick={() => setDeleteTarget({ type: "bulk", ids: checkedInView })}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            onClick={() => setCheckedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Comparison panel */}
      {compareReady && (
        <ComparePanel runA={runA} runB={runB} onClose={() => setCompareIds([])} />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      )}

      {filteredRuns.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <HistoryIcon className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">
              {hasActiveFilters ? "No runs match your filters" : "No analyses yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters
                ? "Try adjusting or clearing the filters above."
                : "Run your first analysis from the Analyzer page to see results here."}
            </p>
          </div>
        </div>
      )}

      {filteredRuns.length > 0 && (
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-primary" />
              {filteredRuns.length} Run{filteredRuns.length !== 1 ? "s" : ""}
              {compareIds.length > 0 && (
                <span className="ml-2 text-xs font-normal text-primary">
                  {compareIds.length}/2 selected for compare
                  {compareIds.length === 2 && <span className="ml-1 text-emerald-600">— comparison ready ↑</span>}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    {/* Select-all checkbox */}
                    <th className="px-4 py-2.5 w-8">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                        className={someChecked && !allChecked ? "opacity-50" : ""}
                      />
                    </th>
                    {/* Compare dot */}
                    <th className="px-2 py-2.5 w-6"></th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Date</th>
                    {isAdmin && <th className="text-left px-4 py-2.5 font-semibold text-amber-700">User</th>}
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Ticker</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Recommendation</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Score</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Last Price</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">IV/RV</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Bias</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">RSI</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">DTE</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Account</th>
                    <th className="px-4 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map(run => {
                    const isCompared = compareIds.includes(run.id);
                    const compIdx = compareIds.indexOf(run.id);
                    const isChecked = checkedIds.has(run.id);
                    return (
                      <tr
                        key={run.id}
                        className={`border-b border-border/30 transition-colors ${isChecked ? "bg-red-50/40" : isCompared ? "bg-primary/8 border-primary/20" : "hover:bg-muted/20"}`}
                      >
                        {/* Row checkbox */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleCheck(run.id)}
                            aria-label={`Select run ${run.id}`}
                          />
                        </td>
                        {/* Compare dot */}
                        <td className="px-2 py-3 cursor-pointer" onClick={() => toggleCompare(run.id)}>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${isCompared ? "bg-primary border-primary text-white" : "border-slate-300 text-transparent"}`}>
                            {isCompared ? (compIdx === 0 ? "A" : "B") : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground num">
                          {new Date(run.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="text-xs">
                              <div className="font-medium text-slate-700">{run.userName ?? "—"}</div>
                              <div className="text-slate-400">{run.userEmail ?? ""}</div>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="font-bold num text-foreground tracking-wider">{run.ticker}</span>
                        </td>
                        <td className="px-4 py-3">
                          {run.recommendation ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${STRATEGY_BADGES[run.recommendation] ?? "bg-muted text-muted-foreground"}`}>
                              {run.recommendation}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right num font-bold text-primary">
                          {run.compositeScore != null ? parseFloat(String(run.compositeScore)).toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right num text-foreground">
                          {run.lastPrice != null ? `$${parseFloat(String(run.lastPrice)).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right num">
                          {run.ivRvRatio != null ? (
                            <span className={parseFloat(String(run.ivRvRatio)) > 1.1 ? "text-emerald-700" : parseFloat(String(run.ivRvRatio)) < 0.9 ? "text-red-700" : "text-amber-700"}>
                              {parseFloat(String(run.ivRvRatio)).toFixed(2)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${BIAS_COLORS[run.directionalBias ?? ""] ?? "text-muted-foreground"}`}>
                            {run.directionalBias ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right num">
                          {run.rsi != null ? (
                            <span className={parseFloat(String(run.rsi)) > 70 ? "text-red-700" : parseFloat(String(run.rsi)) < 30 ? "text-emerald-700" : "text-foreground"}>
                              {parseFloat(String(run.rsi)).toFixed(1)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right num text-muted-foreground">{run.targetDte}d</td>
                        <td className="px-4 py-3 text-right num text-muted-foreground">
                          ${run.accountSize.toLocaleString()}
                        </td>
                        {/* Individual delete */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                            onClick={() => setDeleteTarget({ type: "single", id: run.id })}
                            aria-label="Delete this run"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" />
              Delete {deleteDialogCount === 1 ? "Analysis Run" : `${deleteDialogCount} Analysis Runs`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogCount === 1
                ? "This will permanently delete this analysis run. This action cannot be undone."
                : `This will permanently delete ${deleteDialogCount} analysis runs. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmDelete}
            >
              Delete {deleteDialogCount === 1 ? "Run" : `${deleteDialogCount} Runs`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
