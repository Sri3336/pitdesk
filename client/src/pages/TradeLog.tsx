import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  BarChart2,
  BookOpen,
  CheckCircle,
  ClipboardList,
  Info,
  Lightbulb,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trade {
  id: number;
  ticker: string;
  strategy?: string | null;
  direction: "long" | "short";
  entryPrice?: string | null;
  exitPrice?: string | null;
  swingLow?: string | null;
  swingHigh?: string | null;
  quantity?: number | null;
  target1?: string | null;
  target2?: string | null;
  stopLoss?: string | null;
  pnl?: string | null;
  status: "open" | "closed";
  postTradeNotes?: string | null;
  lessonsLearned?: string | null;
  enteredAt: Date;
  closedAt?: Date | null;
}

function fmt(n: string | number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

// ─── Add Trade Form ───────────────────────────────────────────────────────────

function AddTradeDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [ticker, setTicker] = useState("");
  const [strategy, setStrategy] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [swingLow, setSwingLow] = useState("");
  const [swingHigh, setSwingHigh] = useState("");
  const [quantity, setQuantity] = useState("");
  const [target1, setTarget1] = useState("");
  const [target2, setTarget2] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [useFibTargets, setUseFibTargets] = useState(false);

  const entryNum = parseFloat(entryPrice) || 0;
  const swingLowNum = parseFloat(swingLow) || 0;

  // Auto-compute Fib extension targets when entry + swingLow are valid
  const fibTargets = trpc.trades.getFibTargets.useQuery(
    { entryPrice: entryNum, swingLow: swingLowNum },
    {
      enabled: entryNum > 0 && swingLowNum > 0 && swingLowNum < entryNum,
      staleTime: Infinity,
    }
  );

  // When Fib targets are computed and user wants to use them, fill in the fields
  useEffect(() => {
    if (useFibTargets && fibTargets.data) {
      setTarget1(fibTargets.data.target1.toFixed(2));
      setTarget2(fibTargets.data.target2.toFixed(2));
    }
  }, [useFibTargets, fibTargets.data]);

  const addMutation = trpc.trades.add.useMutation({
    onSuccess: () => {
      toast.success(`Trade logged: ${ticker.toUpperCase()}`);
      onSuccess();
      onClose();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setTicker("");
    setStrategy("");
    setDirection("long");
    setEntryPrice("");
    setSwingLow("");
    setSwingHigh("");
    setQuantity("");
    setTarget1("");
    setTarget2("");
    setStopLoss("");
    setUseFibTargets(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return toast.error("Ticker is required");
    if (!entryPrice) return toast.error("Entry price is required");

    addMutation.mutate({
      ticker: ticker.trim().toUpperCase(),
      strategy: strategy || undefined,
      direction,
      entryPrice: parseFloat(entryPrice),
      swingLow: swingLow ? parseFloat(swingLow) : undefined,
      swingHigh: swingHigh ? parseFloat(swingHigh) : undefined,
      quantity: quantity ? parseInt(quantity) : undefined,
      target1: target1 ? parseFloat(target1) : undefined,
      target2: target2 ? parseFloat(target2) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
    });
  }

  const canComputeFib = entryNum > 0 && swingLowNum > 0 && swingLowNum < entryNum;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Log New Trade
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ticker + Direction */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ticker">Ticker *</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Strategy */}
          <div className="space-y-1.5">
            <Label htmlFor="strategy">Strategy</Label>
            <Input
              id="strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              placeholder="Velez, VCP, Catalyst, etc."
            />
          </div>

          {/* Entry + Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entry">Entry Price *</Label>
              <Input
                id="entry"
                type="number"
                step="0.01"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="100"
              />
            </div>
          </div>

          {/* Swing High + Low */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="swingLow" className="flex items-center gap-1">
                Swing Low
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>Used to auto-calculate Fibonacci extension targets</TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="swingLow"
                type="number"
                step="0.01"
                value={swingLow}
                onChange={(e) => setSwingLow(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="swingHigh">Swing High</Label>
              <Input
                id="swingHigh"
                type="number"
                step="0.01"
                value={swingHigh}
                onChange={(e) => setSwingHigh(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Fibonacci Extension Suggestion */}
          {canComputeFib && (
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-green-700 font-semibold text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Fibonacci Extension Targets
                </div>
                {fibTargets.isLoading && (
                  <div className="text-xs text-muted-foreground">Computing…</div>
                )}
              </div>

              {fibTargets.data && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-blue-100 px-2 py-1.5 text-center">
                      <div className="font-bold text-blue-700">127.2% (T1)</div>
                      <div className="text-blue-600 font-semibold">${fibTargets.data.target1.toFixed(2)}</div>
                    </div>
                    <div className="rounded-md bg-green-100 px-2 py-1.5 text-center">
                      <div className="font-bold text-green-700">161.8% (T2)</div>
                      <div className="text-green-600 font-semibold">${fibTargets.data.target2.toFixed(2)}</div>
                    </div>
                    <div className="rounded-md bg-purple-100 px-2 py-1.5 text-center">
                      <div className="font-bold text-purple-700">261.8% (T3)</div>
                      <div className="text-purple-600 font-semibold">${fibTargets.data.target3.toFixed(2)}</div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-green-700 border-green-300 hover:bg-green-100 text-xs"
                    onClick={() => {
                      setUseFibTargets(true);
                      setTarget1(fibTargets.data!.target1.toFixed(2));
                      setTarget2(fibTargets.data!.target2.toFixed(2));
                      toast.success("Fib extension targets applied to T1 and T2");
                    }}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Apply Fib Targets to T1 & T2
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Targets + Stop */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t1" className="text-blue-600">Target 1</Label>
              <Input
                id="t1"
                type="number"
                step="0.01"
                value={target1}
                onChange={(e) => setTarget1(e.target.value)}
                placeholder="0.00"
                className="border-blue-200 focus:border-blue-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t2" className="text-green-600">Target 2</Label>
              <Input
                id="t2"
                type="number"
                step="0.01"
                value={target2}
                onChange={(e) => setTarget2(e.target.value)}
                placeholder="0.00"
                className="border-green-200 focus:border-green-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stop" className="text-red-600">Stop Loss</Label>
              <Input
                id="stop"
                type="number"
                step="0.01"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="0.00"
                className="border-red-200 focus:border-red-400"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={addMutation.isPending}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
            >
              {addMutation.isPending ? "Logging…" : "Log Trade"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close Trade Dialog ───────────────────────────────────────────────────────

function CloseTradeDialog({
  trade,
  onClose,
  onSuccess,
}: {
  trade: Trade;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [exitPrice, setExitPrice] = useState("");

  const closeMutation = trpc.trades.close.useMutation({
    onSuccess: (data) => {
      const pnl = data.pnl;
      toast.success(`Trade closed. P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Trade — {trade.ticker}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Entry: {fmt(trade.entryPrice)} · Qty: {trade.quantity ?? 1}
          </div>
          <div className="space-y-1.5">
            <Label>Exit Price *</Label>
            <Input
              type="number"
              step="0.01"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              disabled={!exitPrice || closeMutation.isPending}
              onClick={() => closeMutation.mutate({ id: trade.id, exitPrice: parseFloat(exitPrice) })}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
            >
              {closeMutation.isPending ? "Closing…" : "Close Trade"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Notes Dialog ─────────────────────────────────────────────────────────────

function NotesDialog({
  trade,
  onClose,
  onSuccess,
}: {
  trade: Trade;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes] = useState(trade.postTradeNotes ?? "");
  const [lessons, setLessons] = useState(trade.lessonsLearned ?? "");

  const updateMutation = trpc.trades.updateNotes.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Trade Journal — {trade.ticker}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Post-Trade Notes
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? How did the trade play out?"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
              Lessons Learned
            </Label>
            <Textarea
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              placeholder="What would you do differently? What did you learn?"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: trade.id, postTradeNotes: notes, lessonsLearned: lessons })}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
            >
              {updateMutation.isPending ? "Saving…" : "Save Notes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Trade Row ────────────────────────────────────────────────────────────────

function TradeRow({
  trade,
  onRefresh,
}: {
  trade: Trade;
  onRefresh: () => void;
}) {
  const [showClose, setShowClose] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const pnl = trade.pnl ? parseFloat(String(trade.pnl)) : null;
  const isProfit = pnl != null && pnl >= 0;

  return (
    <>
      <tr className="border-b border-border hover:bg-accent/30 transition-colors">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Link
              href={`/charts?ticker=${trade.ticker}`}
              className="font-bold text-sm text-green-700 hover:underline hover:text-green-800 transition-colors"
              title={`Open ${trade.ticker} chart`}
            >
              {trade.ticker}
            </Link>
            <Link href={`/charts?ticker=${trade.ticker}`} title="Open chart">
              <BarChart2 className="h-3 w-3 text-muted-foreground hover:text-green-600 transition-colors" />
            </Link>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${
                trade.direction === "long"
                  ? "border-green-400 text-green-700 bg-green-50"
                  : "border-red-400 text-red-700 bg-red-50"
              }`}
            >
              {trade.direction === "long" ? (
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
              )}
              {trade.direction}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {trade.strategy ?? "—"} · {new Date(trade.enteredAt).toLocaleDateString()}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-medium">{fmt(trade.entryPrice)}</td>
        <td className="px-3 py-2.5 text-right">
          <div className="text-xs text-blue-600">{fmt(trade.target1)}</div>
          <div className="text-xs text-green-600">{fmt(trade.target2)}</div>
        </td>
        <td className="px-3 py-2.5 text-right text-sm text-red-500">{fmt(trade.stopLoss)}</td>
        <td className="px-3 py-2.5 text-right">
          {trade.status === "closed" && pnl != null ? (
            <span className={`text-sm font-semibold ${isProfit ? "text-green-600" : "text-red-500"}`}>
              {isProfit ? "+" : ""}${pnl.toFixed(2)}
            </span>
          ) : (
            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">Open</Badge>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowNotes(true)}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </Button>
            {trade.status === "open" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => setShowClose(true)}
              >
                <CheckCircle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </td>
      </tr>

      {showClose && (
        <CloseTradeDialog trade={trade} onClose={() => setShowClose(false)} onSuccess={onRefresh} />
      )}
      {showNotes && (
        <NotesDialog trade={trade} onClose={() => setShowNotes(false)} onSuccess={onRefresh} />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradeLog() {
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");

  const tradesQuery = trpc.trades.list.useQuery(undefined, { staleTime: 30 * 1000 });
  const trades = (tradesQuery.data as Trade[] | undefined) ?? [];

  const filtered = useMemo(() => {
    if (filterStatus === "all") return trades;
    return trades.filter((t) => t.status === filterStatus);
  }, [trades, filterStatus]);

  const openCount = trades.filter((t) => t.status === "open").length;
  const totalPnl = trades
    .filter((t) => t.status === "closed" && t.pnl != null)
    .reduce((sum, t) => sum + parseFloat(String(t.pnl)), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-orange-500" />
            Trade Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log trades with Fibonacci extension targets auto-calculated from entry price + swing low
          </p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-green-500 hover:bg-green-600 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Log Trade
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Open Trades</div>
            <div className="text-2xl font-bold text-blue-600">{openCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Total Trades</div>
            <div className="text-2xl font-bold">{trades.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Realized P&L</div>
            <div className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fib hint */}
      <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
        <Sparkles className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        <div className="text-green-700">
          <span className="font-semibold">Fib Extension Auto-Suggest:</span> When logging a trade, enter your{" "}
          <span className="font-medium">Entry Price</span> and <span className="font-medium">Swing Low</span> — PitDesk will
          automatically calculate your 127.2%, 161.8%, and 261.8% extension targets and let you apply them as T1 and T2.
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(["all", "open", "closed"] as const).map((s) => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s)}
            className={filterStatus === s ? "bg-green-500 hover:bg-green-600 text-white" : ""}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Table */}
      {tradesQuery.isLoading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin mr-2" />
          Loading trades…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <ClipboardList className="h-8 w-8 text-orange-300" />
          <div className="text-sm font-medium">No trades logged yet</div>
          <div className="text-xs">Click "Log Trade" to add your first trade with Fib targets</div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Entry</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                  <span className="text-blue-600">T1</span> / <span className="text-green-600">T2</span>
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Stop</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">P&L</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <TradeRow key={t.id} trade={t} onRefresh={() => tradesQuery.refetch()} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddTradeDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => tradesQuery.refetch()}
      />
    </div>
  );
}
