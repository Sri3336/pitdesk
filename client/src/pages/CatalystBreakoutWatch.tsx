/**
 * CatalystBreakoutWatch.tsx
 *
 * Tracker for the Breakout Catalyst Options Strategy (BCOS).
 * Based on: "Everything You Knew About Trading Is Wrong" — wait for mass panic/euphoria,
 * identify a key S/R level held for months, enter long options ONLY on a catalyst break.
 *
 * Strategy rules (from video):
 *  - Size for zero: only risk what you can lose entirely
 *  - No stop loss — position sized so total loss is acceptable
 *  - Scale out 50% at 40-50% gain, hold runner for 200-1000%+
 *  - Win rate ~30% is expected and intentional
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  RefreshCw,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Eye,
  CheckCircle2,
  XCircle,
  BookOpen,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WatchItem = {
  id: number;
  ticker: string;
  keyLevel: string | null;
  direction: "resistance" | "support";
  levelLabel: string | null;
  daysTested: number | null;
  touches: number | null;
  nextEarningsDate: string | null;
  catalystNotes: string | null;
  status: "watching" | "near_break" | "broken_out" | "broken_down" | "invalidated";
  lastPrice: string | null;
  distancePct: string | null;
  volumeRatio: string | null;
  lastScannedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  watching: {
    label: "Watching",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Eye,
  },
  near_break: {
    label: "Near Break",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: AlertTriangle,
  },
  broken_out: {
    label: "Broken Out ↑",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: TrendingUp,
  },
  broken_down: {
    label: "Broken Down ↓",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: TrendingDown,
  },
  invalidated: {
    label: "Invalidated",
    color: "bg-gray-100 text-gray-500 border-gray-200",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: WatchItem["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Add/Edit Dialog ──────────────────────────────────────────────────────────

type FormState = {
  ticker: string;
  keyLevel: string;
  direction: "resistance" | "support";
  levelLabel: string;
  daysTested: string;
  touches: string;
  nextEarningsDate: string;
  catalystNotes: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  ticker: "",
  keyLevel: "",
  direction: "resistance",
  levelLabel: "",
  daysTested: "",
  touches: "",
  nextEarningsDate: "",
  catalystNotes: "",
  notes: "",
};

function AddDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const add = trpc.catalystBreakout.add.useMutation({
    onSuccess: () => {
      toast.success(`${form.ticker} added to Catalyst Watch`);
      setForm(EMPTY_FORM);
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.ticker || !form.keyLevel) {
      toast.error("Ticker and Key Level are required");
      return;
    }
    add.mutate({
      ticker: form.ticker.toUpperCase(),
      keyLevel: parseFloat(form.keyLevel),
      direction: form.direction,
      levelLabel: form.levelLabel || undefined,
      daysTested: form.daysTested ? parseInt(form.daysTested) : 0,
      touches: form.touches ? parseInt(form.touches) : 0,
      nextEarningsDate: form.nextEarningsDate || undefined,
      catalystNotes: form.catalystNotes || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Add to Catalyst Watch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ticker *</Label>
              <Input
                placeholder="e.g. SPX, NVDA"
                value={form.ticker}
                onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label>Key Level ($) *</Label>
              <Input
                type="number"
                placeholder="e.g. 3680"
                value={form.keyLevel}
                onChange={(e) => set("keyLevel", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select
                value={form.direction}
                onValueChange={(v) => set("direction", v as "resistance" | "support")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resistance">Resistance (watch for calls)</SelectItem>
                  <SelectItem value="support">Support (watch for puts)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Level Label</Label>
              <Input
                placeholder="e.g. 5-month resistance"
                value={form.levelLabel}
                onChange={(e) => set("levelLabel", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Days Held</Label>
              <Input
                type="number"
                placeholder="e.g. 150"
                value={form.daysTested}
                onChange={(e) => set("daysTested", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Touches</Label>
              <Input
                type="number"
                placeholder="e.g. 4"
                value={form.touches}
                onChange={(e) => set("touches", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Next Earnings</Label>
              <Input
                type="date"
                value={form.nextEarningsDate}
                onChange={(e) => set("nextEarningsDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Catalyst Notes</Label>
            <Input
              placeholder="e.g. Fed meeting Jun 12, earnings Jun 25"
              value={form.catalystNotes}
              onChange={(e) => set("catalystNotes", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              placeholder="Why this level matters, context, plan..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={add.isPending}>
            {add.isPending ? "Adding..." : "Add to Watch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Strategy Rules Panel ─────────────────────────────────────────────────────

function StrategyRulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookOpen className="w-4 h-4 mr-1.5" />
        Strategy Rules
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Breakout Catalyst Options Strategy (BCOS)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="font-semibold text-amber-800">Core Philosophy</p>
              <p className="text-amber-700 mt-1">
                Wait for extreme market conditions (mass panic or mass euphoria). Identify a key
                S/R level held for months. Enter long options ONLY when a news catalyst drives a
                confirmed break through that level.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-800 mb-2">Setup Checklist</p>
              <div className="space-y-2">
                {[
                  "Draw a major horizontal S/R level tested for 2–5+ months",
                  "Confirm extreme condition: VIX > 25 (panic) or gap-up on major news (euphoria)",
                  "Wait for a catalyst — do NOT anticipate the break",
                  "Price must close above resistance (calls) or below support (puts)",
                  "Gap-through is acceptable and often preferred",
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700">{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold text-slate-800 mb-2">Entry Rules</p>
                <div className="space-y-1 text-slate-600">
                  <p>• ATM or slightly OTM options</p>
                  <p>• 30–90+ DTE (longer = better)</p>
                  <p>• <strong>Size for zero</strong> — only risk what you can lose entirely</p>
                  <p>• <strong>No stop loss</strong> — position is sized so total loss is OK</p>
                  <p>• Only A+ setups — skip anything less</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-2">Exit Rules</p>
                <div className="space-y-1 text-slate-600">
                  <p>• Sell <strong>50% at 40–50% gain</strong> (de-risk)</p>
                  <p>• Hold runner for <strong>200–1000%+</strong></p>
                  <p>• Accept runner may go to zero</p>
                  <p>• No stop on runner</p>
                  <p>• Exit all if catalyst is invalidated</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="bg-slate-50 rounded-lg p-3">
              <p className="font-semibold text-slate-800 mb-1">Historical Examples</p>
              <div className="space-y-2 text-slate-600">
                <p>
                  <strong>$17M NVDA Trade:</strong> Bought 20,000 shares at ~$180 (pre-split).
                  Held 1+ year. Sold at $1,040 after May 2024 earnings gap through $1,000 resistance.
                </p>
                <p>
                  <strong>SPX 3680 Breakout:</strong> SPX held under 3680 for 5 months. Elon Musk
                  $1B purchase catalyst drove gap-up through level. Market ran to 4490.
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="font-semibold text-red-800">Risk Warning</p>
              <p className="text-red-700 mt-1 text-xs">
                Expected win rate is ~30%. This strategy requires emotional detachment, patience,
                and a financial buffer. Do not trade money you need to pay bills. The presenter
                lost $500K–$600K on single trades. Size for zero.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalystBreakoutWatch() {
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | WatchItem["status"]>("all");

  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.catalystBreakout.list.useQuery();

  const scanAll = trpc.catalystBreakout.scanAll.useMutation({
    onSuccess: () => {
      utils.catalystBreakout.list.invalidate();
      toast.success("Scan complete — prices and statuses updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const scanOne = trpc.catalystBreakout.scanOne.useMutation({
    onSuccess: (data) => {
      utils.catalystBreakout.list.invalidate();
      toast.success(`${data.ticker} refreshed`);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.catalystBreakout.remove.useMutation({
    onSuccess: () => {
      utils.catalystBreakout.list.invalidate();
      toast.success("Removed from watch list");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.catalystBreakout.update.useMutation({
    onSuccess: () => {
      utils.catalystBreakout.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (filter === "all") return items as WatchItem[];
    return (items as WatchItem[]).filter((i) => i.status === filter);
  }, [items, filter]);

  // Summary counts
  const counts = useMemo(() => {
    const all = items as WatchItem[];
    return {
      total: all.length,
      nearBreak: all.filter((i) => i.status === "near_break").length,
      brokenOut: all.filter((i) => i.status === "broken_out").length,
      brokenDown: all.filter((i) => i.status === "broken_down").length,
    };
  }, [items]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Please sign in to use Catalyst Watch.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-6 h-6 text-amber-500" />
              Catalyst Breakout Watch
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Track key S/R levels. Wait for mass panic or euphoria + catalyst. Enter long options
              on the confirmed break.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StrategyRulesPanel />
            <Button
              variant="outline"
              size="sm"
              onClick={() => scanAll.mutate()}
              disabled={scanAll.isPending || items.length === 0}
            >
              <RefreshCw
                className={`w-4 h-4 mr-1.5 ${scanAll.isPending ? "animate-spin" : ""}`}
              />
              Scan All
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Level
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setFilter("all")}
          >
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Watching</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{counts.total}</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow border-amber-200"
            onClick={() => setFilter("near_break")}
          >
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-amber-600 uppercase tracking-wide">Near Break</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{counts.nearBreak}</p>
              <p className="text-xs text-slate-400 mt-0.5">Within 2% of level</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow border-emerald-200"
            onClick={() => setFilter("broken_out")}
          >
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-emerald-600 uppercase tracking-wide">Broken Out ↑</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{counts.brokenOut}</p>
              <p className="text-xs text-slate-400 mt-0.5">Consider long calls</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow border-red-200"
            onClick={() => setFilter("broken_down")}
          >
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-red-600 uppercase tracking-wide">Broken Down ↓</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{counts.brokenDown}</p>
              <p className="text-xs text-slate-400 mt-0.5">Consider long puts</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          {(["all", "watching", "near_break", "broken_out", "broken_down", "invalidated"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === s
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s === "all"
                  ? `All (${counts.total})`
                  : STATUS_CONFIG[s]?.label ?? s}
              </button>
            )
          )}
        </div>

        {/* Watch List Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-slate-400">
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
                <Eye className="w-10 h-10 opacity-30" />
                <div className="text-center">
                  <p className="font-medium">No levels being watched</p>
                  <p className="text-sm mt-1">
                    Add a key S/R level to start tracking catalyst setups.
                  </p>
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add First Level
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Ticker</TableHead>
                    <TableHead className="font-semibold">Key Level</TableHead>
                    <TableHead className="font-semibold">Direction</TableHead>
                    <TableHead className="font-semibold">Current Price</TableHead>
                    <TableHead className="font-semibold">Distance</TableHead>
                    <TableHead className="font-semibold">Vol Ratio</TableHead>
                    <TableHead className="font-semibold">Days Held</TableHead>
                    <TableHead className="font-semibold">Touches</TableHead>
                    <TableHead className="font-semibold">Next Catalyst</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const keyLevel = parseFloat(item.keyLevel ?? "0");
                    const lastPrice = item.lastPrice ? parseFloat(item.lastPrice) : null;
                    const distancePct = item.distancePct
                      ? parseFloat(item.distancePct)
                      : null;
                    const volRatio = item.volumeRatio ? parseFloat(item.volumeRatio) : null;
                    const isNearBreak = item.status === "near_break";
                    const isBreaking =
                      item.status === "broken_out" || item.status === "broken_down";

                    return (
                      <TableRow
                        key={item.id}
                        className={`${
                          isBreaking
                            ? "bg-emerald-50/40"
                            : isNearBreak
                            ? "bg-amber-50/40"
                            : ""
                        } hover:bg-slate-50 transition-colors`}
                      >
                        {/* Ticker */}
                        <TableCell>
                          <span className="font-bold text-slate-900">{item.ticker}</span>
                          {item.levelLabel && (
                            <p className="text-xs text-slate-400 mt-0.5">{item.levelLabel}</p>
                          )}
                        </TableCell>

                        {/* Key Level */}
                        <TableCell>
                          <span className="font-mono font-semibold text-slate-800">
                            ${keyLevel.toFixed(2)}
                          </span>
                        </TableCell>

                        {/* Direction */}
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              item.direction === "resistance"
                                ? "text-red-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {item.direction === "resistance" ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {item.direction === "resistance"
                              ? "Resistance → Calls"
                              : "Support → Puts"}
                          </span>
                        </TableCell>

                        {/* Current Price */}
                        <TableCell>
                          {lastPrice != null ? (
                            <span className="font-mono text-slate-800">
                              ${lastPrice.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Distance */}
                        <TableCell>
                          {distancePct != null ? (
                            <span
                              className={`font-mono text-sm font-semibold ${
                                distancePct <= 1
                                  ? "text-red-600"
                                  : distancePct <= 2
                                  ? "text-amber-600"
                                  : "text-slate-600"
                              }`}
                            >
                              {distancePct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Volume Ratio */}
                        <TableCell>
                          {volRatio != null ? (
                            <span
                              className={`font-mono text-sm ${
                                volRatio >= 2
                                  ? "text-red-600 font-bold"
                                  : volRatio >= 1.5
                                  ? "text-amber-600 font-semibold"
                                  : "text-slate-600"
                              }`}
                            >
                              {volRatio.toFixed(2)}×
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </TableCell>

                        {/* Days Held */}
                        <TableCell>
                          <span className="text-slate-700">
                            {item.daysTested ?? "—"}
                            {item.daysTested ? " days" : ""}
                          </span>
                        </TableCell>

                        {/* Touches */}
                        <TableCell>
                          <span className="text-slate-700">{item.touches ?? "—"}</span>
                        </TableCell>

                        {/* Next Catalyst */}
                        <TableCell>
                          <div>
                            {item.nextEarningsDate ? (
                              <span className="text-xs font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                                Earnings {item.nextEarningsDate}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                            {item.catalystNotes && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-xs text-slate-400 truncate max-w-[120px] mt-0.5 cursor-help">
                                    {item.catalystNotes}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>{item.catalystNotes}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => scanOne.mutate({ id: item.id })}
                                  disabled={scanOne.isPending}
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Refresh price</TooltipContent>
                            </Tooltip>

                            {(item.status === "broken_out" ||
                              item.status === "broken_down") && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-500"
                                    onClick={() =>
                                      updateStatus.mutate({
                                        id: item.id,
                                        status: "invalidated",
                                      })
                                    }
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Mark invalidated</TooltipContent>
                              </Tooltip>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-400 hover:text-red-600"
                                  onClick={() => remove.mutate({ id: item.id })}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remove</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Strategy reminder footer */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800 mb-1">
            Remember the BCOS Rules Before Entering
          </p>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <p className="font-medium text-slate-700">✓ Entry</p>
              <p className="text-xs mt-0.5">
                Only on confirmed catalyst break. ATM/OTM calls or puts. 30–90+ DTE. Size for
                zero — no stop loss.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-700">✓ Exit</p>
              <p className="text-xs mt-0.5">
                Sell 50% at 40–50% gain. Hold runner for 200–1000%+. Accept runner may go to
                zero.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-700">✓ Mindset</p>
              <p className="text-xs mt-0.5">
                30% win rate is expected. Focus on net P&L, not win rate. Do nothing in normal
                conditions.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AddDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => utils.catalystBreakout.list.invalidate()}
      />
    </TooltipProvider>
  );
}
