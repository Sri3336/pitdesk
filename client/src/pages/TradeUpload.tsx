import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Flame,
  Loader2,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewRow {
  ticker: string;
  tradeDate: string;
  side: string;
  qty: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  strategy: string;
  assetType: string;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "—";
  return `${prefix}${Number(n).toFixed(2)}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}
function pnlColor(n: number | null | undefined): string {
  if (n == null) return "text-muted-foreground";
  return n >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold";
}

// ─── CSV Template Download ─────────────────────────────────────────────────────

function downloadTemplate() {
  const header = "Date,Ticker,Side,Qty,EntryPrice,ExitPrice,PnL,PnL%,Strategy,AssetType,Notes";
  const sample = [
    "2026-06-01,AAPL,BUY,100,185.50,192.30,680.00,3.66,Momentum,stock,Strong breakout",
    "2026-06-03,NVDA,SELL,50,875.00,920.00,-2250.00,-5.14,Short,stock,Missed stop",
    "2026-06-05,SPY,BUY,2,530.00,540.00,2000.00,1.89,Swing,etf,PCR signal",
  ].join("\n");
  const blob = new Blob([header + "\n" + sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pitdesk_trade_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (text: string, name: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please upload a CSV file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      onFile(text, file.name);
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }, []);

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
        ${dragging ? "border-green-400 bg-green-50" : "border-border hover:border-green-400 hover:bg-green-50/30"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
      />
      <Upload className={`h-10 w-10 mx-auto mb-3 ${dragging ? "text-green-500" : "text-muted-foreground"}`} />
      <div className="text-base font-semibold text-foreground mb-1">
        Drop your trades CSV here
      </div>
      <div className="text-sm text-muted-foreground mb-4">
        or click to browse — supports E*TRADE, Schwab, TD, or any CSV export
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download Template
        </Button>
      </div>
    </div>
  );
}

// ─── Preview Table ─────────────────────────────────────────────────────────────

function PreviewTable({ rows, totalRows }: { rows: PreviewRow[]; totalRows: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-foreground">
          Preview — showing {rows.length} of {totalRows} rows
        </div>
        {totalRows > rows.length && (
          <Badge variant="outline" className="text-xs">+{totalRows - rows.length} more rows will be imported</Badge>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {["Ticker", "Date", "Side", "Qty", "Entry", "Exit", "P&L", "P&L%", "Strategy", "Type"].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border hover:bg-accent/30">
                <td className="px-3 py-2 font-bold">{r.ticker || <span className="text-red-400">—</span>}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.tradeDate || "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-[10px] ${r.side === "BUY" || r.side === "LONG" ? "border-green-400 text-green-700" : "border-red-400 text-red-600"}`}>
                    {r.side}
                  </Badge>
                </td>
                <td className="px-3 py-2">{r.qty ?? "—"}</td>
                <td className="px-3 py-2">{fmt(r.entryPrice)}</td>
                <td className="px-3 py-2">{fmt(r.exitPrice)}</td>
                <td className={`px-3 py-2 ${pnlColor(r.pnl)}`}>{fmt(r.pnl)}</td>
                <td className={`px-3 py-2 ${pnlColor(r.pnlPct)}`}>{fmtPct(r.pnlPct)}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.strategy || "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary" className="text-[10px]">{r.assetType}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: {
  totalTrades: number; tradesWithPnl: number; wins: number; losses: number;
  winRate: number | null; totalPnl: number; avgPnl: number | null;
  bestTrade: number | null; worstTrade: number | null;
} | null }) {
  if (!summary) return null;
  const cards = [
    { label: "Total Trades", value: summary.totalTrades.toString(), icon: <FileText className="h-4 w-4 text-blue-500" /> },
    { label: "Win Rate", value: summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : "—", icon: <TrendingUp className="h-4 w-4 text-green-500" />, highlight: summary.winRate != null && summary.winRate >= 50 },
    { label: "Total P&L", value: fmt(summary.totalPnl), icon: summary.totalPnl >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />, pnl: summary.totalPnl },
    { label: "Avg P&L", value: fmt(summary.avgPnl), icon: <BarChart2 className="h-4 w-4 text-purple-500" />, pnl: summary.avgPnl },
    { label: "Best Trade", value: fmt(summary.bestTrade), icon: <Flame className="h-4 w-4 text-orange-500" /> },
    { label: "Worst Trade", value: fmt(summary.worstTrade), icon: <AlertTriangle className="h-4 w-4 text-red-400" /> },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {cards.map((c) => (
        <Card key={c.label} className="shadow-none">
          <CardContent className="pt-3 pb-3 px-3">
            <div className="flex items-center gap-1.5 mb-1">{c.icon}<span className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</span></div>
            <div className={`text-base font-bold ${c.pnl != null ? pnlColor(c.pnl) : ""}`}>{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── My Trades Tab ─────────────────────────────────────────────────────────────

function MyTradesTab() {
  const batchesQuery = trpc.tradeUpload.myBatches.useQuery();
  const [selectedBatch, setSelectedBatch] = useState<number | undefined>(undefined);
  const tradesQuery = trpc.tradeUpload.myTrades.useQuery({ batchId: selectedBatch });
  const deleteMutation = trpc.tradeUpload.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch deleted");
      setSelectedBatch(undefined);
      batchesQuery.refetch();
      tradesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  if (batchesQuery.isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const batches = batchesQuery.data ?? [];
  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Upload className="h-8 w-8 text-green-400" />
        <div className="text-sm font-medium">No trades uploaded yet</div>
        <div className="text-xs">Upload a CSV to see your trade history here</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Batch selector */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedBatch === undefined ? "default" : "outline"}
          size="sm"
          className="text-xs h-8"
          onClick={() => setSelectedBatch(undefined)}
        >
          All Batches
        </Button>
        {batches.map(b => (
          <Button
            key={b.id}
            variant={selectedBatch === b.id ? "default" : "outline"}
            size="sm"
            className="text-xs h-8 gap-1.5"
            onClick={() => setSelectedBatch(b.id)}
          >
            <FileText className="h-3 w-3" />
            {b.filename.replace(/\.csv$/i, "")}
            <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{b.rowCount}</Badge>
          </Button>
        ))}
      </div>

      {/* Summary */}
      <SummaryCards summary={tradesQuery.data?.summary ?? null} />

      {/* Batch management */}
      {selectedBatch !== undefined && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 text-red-500 border-red-200 hover:bg-red-50"
            onClick={() => {
              if (confirm("Delete this batch and all its trades?")) {
                deleteMutation.mutate({ batchId: selectedBatch });
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Delete Batch
          </Button>
        </div>
      )}

      {/* Trades table */}
      {tradesQuery.isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Ticker", "Date", "Side", "Qty", "Entry", "Exit", "P&L", "P&L%", "Strategy", "Type", "Notes"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tradesQuery.data?.trades ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-accent/30">
                  <td className="px-3 py-2 font-bold">{t.ticker}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.tradeDate}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-[10px] ${t.side === "BUY" || t.side === "LONG" ? "border-green-400 text-green-700" : "border-red-400 text-red-600"}`}>
                      {t.side}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{t.qty}</td>
                  <td className="px-3 py-2">{fmt(parseFloat(t.entryPrice as string))}</td>
                  <td className="px-3 py-2">{t.exitPrice ? fmt(parseFloat(t.exitPrice as string)) : "—"}</td>
                  <td className={`px-3 py-2 ${pnlColor(t.pnl ? parseFloat(t.pnl as string) : null)}`}>
                    {t.pnl ? fmt(parseFloat(t.pnl as string)) : "—"}
                  </td>
                  <td className={`px-3 py-2 ${pnlColor(t.pnlPct ? parseFloat(t.pnlPct as string) : null)}`}>
                    {t.pnlPct ? fmtPct(parseFloat(t.pnlPct as string)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.strategy || "—"}</td>
                  <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{t.assetType}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground max-w-32 truncate">{t.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(tradesQuery.data?.trades ?? []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No trades found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Community Insights Tab ────────────────────────────────────────────────────

function CommunityInsightsTab() {
  const insightsQuery = trpc.tradeUpload.communityInsights.useQuery({ minTrades: 3, limit: 30 });

  if (insightsQuery.isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const insights = insightsQuery.data ?? [];
  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
        <Users className="h-8 w-8 text-blue-400" />
        <div className="text-sm font-medium">No community data yet</div>
        <div className="text-xs">As more traders upload their trades, anonymized insights will appear here</div>
      </div>
    );
  }

  const sorted = [...insights].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Anonymized insights from all uploaded trades — your individual data is never shared</span>
      </div>

      {/* Heatmap-style grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {sorted.map((ins) => {
          const wr = ins.winRate ?? 0;
          const bg = wr >= 65 ? "bg-green-100 border-green-300" : wr >= 50 ? "bg-blue-50 border-blue-200" : wr > 0 ? "bg-yellow-50 border-yellow-200" : "bg-slate-50 border-slate-200";
          const textColor = wr >= 65 ? "text-green-700" : wr >= 50 ? "text-blue-700" : wr > 0 ? "text-yellow-700" : "text-slate-600";
          return (
            <div key={ins.ticker} className={`rounded-lg border p-3 ${bg}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-foreground">{ins.ticker}</span>
                <Badge variant="outline" className={`text-[10px] px-1 ${textColor} border-current`}>
                  {ins.totalTrades}T
                </Badge>
              </div>
              <div className={`text-lg font-bold ${textColor}`}>
                {ins.winRate != null ? `${ins.winRate.toFixed(0)}%` : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">win rate</div>
              {ins.avgPnlPct != null && (
                <div className={`text-xs mt-1 font-medium ${ins.avgPnlPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                  avg {ins.avgPnlPct >= 0 ? "+" : ""}{ins.avgPnlPct.toFixed(1)}%
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {ins.uniqueTraders} trader{ins.uniqueTraders !== 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table view */}
      <div className="overflow-x-auto rounded-lg border border-border mt-4">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {["Ticker", "Community Trades", "Traders", "Win Rate", "Avg P&L%", "Total P&L"].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((ins) => (
              <tr key={ins.ticker} className="border-t border-border hover:bg-accent/30">
                <td className="px-3 py-2 font-bold">{ins.ticker}</td>
                <td className="px-3 py-2">{ins.totalTrades}</td>
                <td className="px-3 py-2">{ins.uniqueTraders}</td>
                <td className={`px-3 py-2 font-semibold ${ins.winRate != null && ins.winRate >= 50 ? "text-green-600" : "text-red-500"}`}>
                  {ins.winRate != null ? `${ins.winRate.toFixed(1)}%` : "—"}
                </td>
                <td className={`px-3 py-2 ${ins.avgPnlPct != null && ins.avgPnlPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {ins.avgPnlPct != null ? `${ins.avgPnlPct >= 0 ? "+" : ""}${ins.avgPnlPct.toFixed(2)}%` : "—"}
                </td>
                <td className={`px-3 py-2 ${ins.totalPnl != null && ins.totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {ins.totalPnl != null ? fmt(ins.totalPnl) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradeUpload() {
  const [tab, setTab] = useState("upload");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("trades.csv");
  const [parseResult, setParseResult] = useState<{
    headers: string[];
    columnMap: Record<string, number>;
    preview: PreviewRow[];
    totalRows: number;
    unmappedColumns: string[];
    detectedColumns: string[];
  } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const parseMutation = trpc.tradeUpload.parseCsv.useMutation({
    onSuccess: (data) => {
      setParseResult(data);
      if (data.totalRows === 0) {
        toast.error("No valid rows found in CSV");
      } else {
        toast.success(`Parsed ${data.totalRows} rows — review the preview below`);
      }
    },
    onError: (e) => toast.error(`Parse error: ${e.message}`),
  });

  const confirmMutation = trpc.tradeUpload.confirmUpload.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.rowsInserted} trades successfully!`);
      setParseResult(null);
      setCsvText("");
      setShowConfirmDialog(false);
      setTab("my-trades");
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const handleFile = (text: string, name: string) => {
    setCsvText(text);
    setFilename(name);
    parseMutation.mutate({ csvText: text, filename: name });
  };

  const handleConfirm = () => {
    if (!csvText) return;
    confirmMutation.mutate({ csvText, filename });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Upload className="h-5 w-5 text-green-500" />
            Trade Upload & Community Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import your brokerage CSV exports for personal analysis — anonymized insights shared with the community
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="upload" className="flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Upload CSV
          </TabsTrigger>
          <TabsTrigger value="my-trades" className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            My Trades
          </TabsTrigger>
          <TabsTrigger value="community" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Community Insights
          </TabsTrigger>
        </TabsList>

        {/* ─── Upload Tab ─── */}
        <TabsContent value="upload" className="mt-4 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                Import Trades from CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Privacy notice */}
              <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg p-3">
                <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-blue-700">Your data stays private.</span>
                  <span className="text-blue-600"> Individual trade details are only visible to you. Community Insights shows only anonymized aggregates (win rate, avg P&L%) per ticker — never your specific trades or account info.</span>
                </div>
              </div>

              {/* Supported formats */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-muted-foreground">Supported formats:</span>
                {["E*TRADE", "Schwab", "TD Ameritrade", "Webull", "Robinhood", "Custom CSV"].map(b => (
                  <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>
                ))}
              </div>

              {parseMutation.isPending ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-green-500" />
                  <div className="text-sm text-muted-foreground">Parsing CSV…</div>
                </div>
              ) : (
                <UploadZone onFile={handleFile} />
              )}

              {/* Column detection result */}
              {parseResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">
                      Detected {parseResult.detectedColumns.length} columns — {parseResult.totalRows} rows ready to import
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parseResult.detectedColumns.map(c => (
                      <Badge key={c} className="text-[10px] bg-green-100 text-green-700 border-green-300">{c}</Badge>
                    ))}
                    {parseResult.unmappedColumns.slice(0, 5).map(c => (
                      <Badge key={c} variant="outline" className="text-[10px] text-muted-foreground">{c} (ignored)</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {parseResult && parseResult.preview.length > 0 && (
                <PreviewTable rows={parseResult.preview} totalRows={parseResult.totalRows} />
              )}

              {/* Confirm button */}
              {parseResult && parseResult.totalRows > 0 && (
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setParseResult(null); setCsvText(""); }}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button
                    className="bg-green-500 hover:bg-green-600 text-white"
                    size="sm"
                    onClick={() => setShowConfirmDialog(true)}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Import {parseResult.totalRows} Trades
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Confirm Dialog */}
          <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-green-500" />
                  Confirm Trade Import
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-foreground">
                  You are about to import <strong>{parseResult?.totalRows}</strong> trades from <strong>{filename}</strong>.
                </div>
                <div className="text-xs text-muted-foreground bg-slate-50 rounded-lg p-3 border border-border">
                  These trades will be stored privately under your account. Anonymized aggregates (win rate, avg P&L%) will contribute to Community Insights.
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
                  <Button
                    className="bg-green-500 hover:bg-green-600 text-white"
                    size="sm"
                    onClick={handleConfirm}
                    disabled={confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    {confirmMutation.isPending ? "Importing…" : "Confirm Import"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ─── My Trades Tab ─── */}
        <TabsContent value="my-trades" className="mt-4">
          <MyTradesTab />
        </TabsContent>

        {/* ─── Community Insights Tab ─── */}
        <TabsContent value="community" className="mt-4">
          <CommunityInsightsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
