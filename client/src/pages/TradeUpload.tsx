import { ActionLayout } from "@/components/ActionLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ROUTES } from "@/lib/routes";
import {
  AlertTriangle,
  BarChart2,
  Briefcase,
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
  Wallet,
  XCircle,
  Sparkles,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Known accounts ───────────────────────────────────────────────────────────

const KNOWN_ACCOUNTS = [
  { id: "etrade-4723", label: "E*TRADE -4723" },
  { id: "etrade-2738", label: "E*TRADE -2738" },
  { id: "schwab",      label: "Schwab" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "—";
  return `${prefix}${Number(n).toFixed(2)}`;
}
function fmtK(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n) >= 0 ? "+" : ""}${Number(n).toFixed(1)}%`;
}
function pnlColor(n: number | null | undefined): string {
  if (n == null) return "text-muted-foreground";
  return n >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold";
}
function accountColor(accountId: string): string {
  if (accountId === "etrade-4723") return "#3b82f6";
  if (accountId === "etrade-2738") return "#8b5cf6";
  if (accountId === "schwab") return "#f59e0b";
  return "#6b7280";
}

// ─── CSV Template Download ─────────────────────────────────────────────────────

function downloadTradeTemplate() {
  const header = "Date,Ticker,Side,Qty,EntryPrice,ExitPrice,PnL,PnL%,Strategy,AssetType,Notes";
  const sample = [
    "2026-06-01,AAPL,BUY,100,185.50,192.30,680.00,3.66,Momentum,stock,Strong breakout",
    "2026-06-03,NVDA,SELL,50,875.00,920.00,-2250.00,-5.14,Short,stock,Missed stop",
  ].join("\n");
  const blob = new Blob([header + "\n" + sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "pitdesk_trade_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

function downloadPositionsTemplate() {
  const header = "Ticker,Qty,AvgCost,CurrentPrice,MarketValue,UnrealizedPnL,UnrealizedPnL%,AssetType,Notes";
  const sample = [
    "NVDA,50,875.00,950.00,47500.00,3750.00,8.57,stock,Core position",
    "TSLA,30,220.00,245.00,7350.00,750.00,11.36,stock,Swing hold",
    "SPY,5,530.00,545.00,2725.00,75.00,2.83,etf,Hedge",
  ].join("\n");
  const blob = new Blob([header + "\n" + sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "pitdesk_positions_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile, label = "Drop your CSV here" }: { onFile: (text: string, name: string) => void; label?: string }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please upload a CSV file"); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => onFile(e.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0]; if (file) readFile(file);
  }, []);

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
        ${dragging ? "border-green-400 bg-green-50" : "border-border hover:border-green-400 hover:bg-green-50/30"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
      <Upload className={`h-8 w-8 mx-auto mb-2 ${dragging ? "text-green-500" : "text-muted-foreground"}`} />
      <div className="text-sm font-semibold text-foreground mb-1">{label}</div>
      <div className="text-xs text-muted-foreground">or click to browse</div>
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
    { label: "Win Rate", value: summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : "—", icon: <TrendingUp className="h-4 w-4 text-green-500" /> },
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

// ─── Account Selector ─────────────────────────────────────────────────────────

function AccountSelector({ value, onChange, placeholder = "Select account" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-56 h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {KNOWN_ACCOUNTS.map(a => (
          <SelectItem key={a.id} value={a.id}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accountColor(a.id) }} />
              {a.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── My Trades Tab ─────────────────────────────────────────────────────────────

function MyTradesTab() {
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedBatch, setSelectedBatch] = useState<number | undefined>(undefined);

  const batchesQuery = trpc.tradeUpload.myBatches.useQuery(
    selectedAccount !== "all" ? { accountId: selectedAccount } : {}
  );
  const tradesQuery = trpc.tradeUpload.myTrades.useQuery({
    batchId: selectedBatch,
    accountId: selectedAccount !== "all" ? selectedAccount : undefined,
  });
  const deleteMutation = trpc.tradeUpload.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch deleted");
      setSelectedBatch(undefined);
      batchesQuery.refetch();
      tradesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (batchesQuery.isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const batches = batchesQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Account filter pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground font-medium">Account:</span>
        <button
          onClick={() => { setSelectedAccount("all"); setSelectedBatch(undefined); }}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${selectedAccount === "all" ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground/40"}`}
        >
          All Accounts
        </button>
        {KNOWN_ACCOUNTS.map(a => (
          <button
            key={a.id}
            onClick={() => { setSelectedAccount(a.id); setSelectedBatch(undefined); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${selectedAccount === a.id ? "text-white border-transparent" : "border-border hover:border-foreground/40"}`}
            style={selectedAccount === a.id ? { background: accountColor(a.id), borderColor: accountColor(a.id) } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedAccount === a.id ? "white" : accountColor(a.id) }} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Batch selector */}
      {batches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant={selectedBatch === undefined ? "default" : "outline"} size="sm" className="text-xs h-8"
            onClick={() => setSelectedBatch(undefined)}>All Batches</Button>
          {batches.map(b => (
            <Button key={b.id} variant={selectedBatch === b.id ? "default" : "outline"} size="sm"
              className="text-xs h-8 gap-1.5" onClick={() => setSelectedBatch(b.id)}>
              <FileText className="h-3 w-3" />
              {b.filename.replace(/\.csv$/i, "")}
              {b.accountLabel && (
                <span className="text-[9px] px-1 py-0 rounded" style={{ background: accountColor(b.accountId ?? ""), color: "white" }}>
                  {b.accountLabel}
                </span>
              )}
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">{b.rowCount}</Badge>
            </Button>
          ))}
        </div>
      )}

      {/* Summary */}
      <SummaryCards summary={tradesQuery.data?.summary ?? null} />

      {/* Delete batch */}
      {selectedBatch !== undefined && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="text-xs h-8 text-red-500 border-red-200 hover:bg-red-50"
            onClick={() => { if (confirm("Delete this batch and all its trades?")) deleteMutation.mutate({ batchId: selectedBatch }); }}
            disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Delete Batch
          </Button>
        </div>
      )}

      {/* Trades table */}
      {tradesQuery.isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (tradesQuery.data?.trades ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <Upload className="h-8 w-8 text-green-400" />
          <div className="text-sm font-medium">No trades found</div>
          <div className="text-xs">Upload a CSV to see your trade history here</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Account", "Ticker", "Date", "Side", "Qty", "Entry", "Exit", "P&L", "P&L%", "Strategy", "Type"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tradesQuery.data?.trades ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-accent/30">
                  <td className="px-3 py-2">
                    {t.accountLabel ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: accountColor(t.accountId ?? "") + "22", color: accountColor(t.accountId ?? "") }}>
                        {t.accountLabel}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 font-bold">{t.ticker}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.tradeDate}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-[10px] ${t.side === "BUY" || t.side === "LONG" ? "border-green-400 text-green-700" : "border-red-400 text-red-600"}`}>{t.side}</Badge>
                  </td>
                  <td className="px-3 py-2">{t.qty}</td>
                  <td className="px-3 py-2">{fmt(parseFloat(t.entryPrice as string))}</td>
                  <td className="px-3 py-2">{t.exitPrice ? fmt(parseFloat(t.exitPrice as string)) : "—"}</td>
                  <td className={`px-3 py-2 ${pnlColor(t.pnl ? parseFloat(t.pnl as string) : null)}`}>{t.pnl ? fmt(parseFloat(t.pnl as string)) : "—"}</td>
                  <td className={`px-3 py-2 ${pnlColor(t.pnlPct ? parseFloat(t.pnlPct as string) : null)}`}>{t.pnlPct ? fmtPct(parseFloat(t.pnlPct as string)) : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.strategy || "—"}</td>
                  <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{t.assetType}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Positions Tab ─────────────────────────────────────────────────────────────

function PositionsTab() {
  const [uploadAccount, setUploadAccount] = useState("");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("positions.csv");
  const [parseResult, setParseResult] = useState<{
    preview: Array<{ ticker: string; qty: number | null; avgCost: number | null; currentPrice: number | null; marketValue: number | null; unrealizedPnl: number | null; unrealizedPnlPct: number | null; assetType: string }>;
    totalRows: number;
    detectedColumns: string[];
    unmappedColumns: string[];
  } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [filterAccount, setFilterAccount] = useState("all");

  const parseMutation = trpc.positions.parseCsv.useMutation({
    onSuccess: (d) => { setParseResult(d); toast.success(`Parsed ${d.totalRows} positions`); },
    onError: (e) => toast.error(e.message),
  });

  const confirmMutation = trpc.positions.confirmUpload.useMutation({
    onSuccess: (d) => {
      toast.success(`Imported ${d.rowsInserted} positions`);
      setParseResult(null); setCsvText(""); setShowConfirm(false);
      positionsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const positionsQuery = trpc.positions.myPositions.useQuery(
    filterAccount !== "all" ? { accountId: filterAccount } : {}
  );

  const deleteMutation = trpc.positions.deleteBatch.useMutation({
    onSuccess: () => { toast.success("Positions batch deleted"); positionsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const batchesQuery = trpc.positions.myBatches.useQuery();

  const handleFile = (text: string, name: string) => {
    if (!uploadAccount) { toast.error("Please select an account first"); return; }
    const acct = KNOWN_ACCOUNTS.find(a => a.id === uploadAccount)!;
    setCsvText(text); setFilename(name);
    parseMutation.mutate({ csvText: text, filename: name, accountId: acct.id, accountLabel: acct.label });
  };

  const handleConfirm = () => {
    const acct = KNOWN_ACCOUNTS.find(a => a.id === uploadAccount)!;
    confirmMutation.mutate({ csvText, filename, accountId: acct.id, accountLabel: acct.label });
  };

  const summary = positionsQuery.data?.portfolioSummary;
  const byAccount = positionsQuery.data?.byAccount ?? [];
  const posRows = positionsQuery.data?.positions ?? [];

  return (
    <div className="space-y-5">
      {/* ── Portfolio Summary ── */}
      {summary && summary.totalPositions > 0 && (
        <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-sm">Portfolio Summary</span>
            <span className="text-xs text-muted-foreground ml-auto">{summary.totalPositions} positions across {byAccount.length} account{byAccount.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Top-level numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-3 border" style={{ background: "var(--muted)/30" }}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total Market Value</div>
              <div className="text-xl font-bold text-foreground">{fmtK(summary.totalMarketValue)}</div>
            </div>
            <div className="rounded-xl p-3 border" style={{ background: summary.totalUnrealizedPnl >= 0 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderColor: summary.totalUnrealizedPnl >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)" }}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Unrealized P&L</div>
              <div className={`text-xl font-bold ${pnlColor(summary.totalUnrealizedPnl)}`}>{fmtK(summary.totalUnrealizedPnl)}</div>
              {summary.totalUnrealizedPnlPct != null && (
                <div className={`text-xs ${pnlColor(summary.totalUnrealizedPnlPct)}`}>{fmtPct(summary.totalUnrealizedPnlPct)}</div>
              )}
            </div>
            {byAccount.map(a => (
              <div key={a.accountId} className="rounded-xl p-3 border" style={{ background: accountColor(a.accountId) + "0d", borderColor: accountColor(a.accountId) + "33" }}>
                <div className="text-[10px] uppercase tracking-wide mb-1 font-medium" style={{ color: accountColor(a.accountId) }}>{a.accountLabel}</div>
                <div className="text-base font-bold text-foreground">{fmtK(a.marketValue)}</div>
                <div className={`text-xs ${pnlColor(a.unrealizedPnl)}`}>{fmtK(a.unrealizedPnl)} unrealized</div>
                <div className="text-[10px] text-muted-foreground">{a.positionCount} positions</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload section ── */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-green-500" />
            Upload Current Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
            Uploading positions for an account <strong>replaces</strong> the prior snapshot for that account — always reflects your latest holdings.
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">Account:</span>
            <AccountSelector value={uploadAccount} onChange={setUploadAccount} placeholder="Select account first" />
            <Button variant="outline" size="sm" className="text-xs h-8 ml-auto" onClick={downloadPositionsTemplate}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download Template
            </Button>
          </div>

          {parseMutation.isPending ? (
            <div className="flex items-center justify-center h-24 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-green-500" />
              <span className="text-sm text-muted-foreground">Parsing…</span>
            </div>
          ) : (
            <UploadZone onFile={handleFile} label={uploadAccount ? `Drop positions CSV for ${KNOWN_ACCOUNTS.find(a => a.id === uploadAccount)?.label}` : "Select an account above, then drop positions CSV"} />
          )}

          {parseResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-700">
                  {parseResult.totalRows} positions detected — {parseResult.detectedColumns.join(", ")}
                </span>
              </div>
              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Ticker", "Qty", "Avg Cost", "Current Price", "Market Value", "Unrealized P&L", "Unrealized %", "Type"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.preview.map((p, i) => (
                      <tr key={i} className="border-t border-border hover:bg-accent/30">
                        <td className="px-3 py-2 font-bold">{p.ticker || "—"}</td>
                        <td className="px-3 py-2">{p.qty ?? "—"}</td>
                        <td className="px-3 py-2">{fmt(p.avgCost)}</td>
                        <td className="px-3 py-2">{fmt(p.currentPrice)}</td>
                        <td className="px-3 py-2 font-semibold">{fmt(p.marketValue)}</td>
                        <td className={`px-3 py-2 ${pnlColor(p.unrealizedPnl)}`}>{fmt(p.unrealizedPnl)}</td>
                        <td className={`px-3 py-2 ${pnlColor(p.unrealizedPnlPct)}`}>{p.unrealizedPnlPct != null ? fmtPct(p.unrealizedPnlPct) : "—"}</td>
                        <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{p.assetType}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => { setParseResult(null); setCsvText(""); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />Cancel
                </Button>
                <Button className="bg-green-500 hover:bg-green-600 text-white" size="sm" onClick={() => setShowConfirm(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import {parseResult.totalRows} Positions
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Confirm Dialog ── */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-green-500" />
              Confirm Positions Import
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-foreground">
              Import <strong>{parseResult?.totalRows}</strong> positions for <strong>{KNOWN_ACCOUNTS.find(a => a.id === uploadAccount)?.label}</strong>?
            </div>
            <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
              This will <strong>replace</strong> any previously uploaded positions for this account.
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button className="bg-green-500 hover:bg-green-600 text-white" size="sm" onClick={handleConfirm} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                {confirmMutation.isPending ? "Importing…" : "Confirm Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Current Holdings ── */}
      {posRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold">Current Holdings</span>
            {/* Account filter */}
            <div className="flex gap-1.5 ml-auto flex-wrap">
              <button onClick={() => setFilterAccount("all")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${filterAccount === "all" ? "bg-foreground text-background border-foreground" : "border-border"}`}>
                All
              </button>
              {byAccount.map(a => (
                <button key={a.accountId} onClick={() => setFilterAccount(a.accountId)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${filterAccount === a.accountId ? "text-white" : "border-border"}`}
                  style={filterAccount === a.accountId ? { background: accountColor(a.accountId), borderColor: accountColor(a.accountId) } : {}}>
                  {a.accountLabel}
                </button>
              ))}
            </div>
            {/* Delete batch buttons */}
            {(batchesQuery.data ?? []).map(b => (
              <Button key={b.id} variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => { if (confirm(`Delete positions for ${b.accountLabel}?`)) deleteMutation.mutate({ batchId: b.id }); }}>
                <Trash2 className="h-3 w-3 mr-1" />
                Clear {b.accountLabel}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Account", "Ticker", "Qty", "Avg Cost", "Current Price", "Market Value", "Unrealized P&L", "Unrealized %", "Type"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posRows.map(p => (
                  <tr key={p.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: accountColor(p.accountId) + "22", color: accountColor(p.accountId) }}>
                        {p.accountLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold">{p.ticker}</td>
                    <td className="px-3 py-2">{p.qty}</td>
                    <td className="px-3 py-2">{p.avgCost ? fmt(parseFloat(p.avgCost as string)) : "—"}</td>
                    <td className="px-3 py-2">{p.currentPrice ? fmt(parseFloat(p.currentPrice as string)) : "—"}</td>
                    <td className="px-3 py-2 font-semibold">{p.marketValue ? fmt(parseFloat(p.marketValue as string)) : "—"}</td>
                    <td className={`px-3 py-2 ${pnlColor(p.unrealizedPnl ? parseFloat(p.unrealizedPnl as string) : null)}`}>
                      {p.unrealizedPnl ? fmt(parseFloat(p.unrealizedPnl as string)) : "—"}
                    </td>
                    <td className={`px-3 py-2 ${pnlColor(p.unrealizedPnlPct ? parseFloat(p.unrealizedPnlPct as string) : null)}`}>
                      {p.unrealizedPnlPct ? fmtPct(parseFloat(p.unrealizedPnlPct as string)) : "—"}
                    </td>
                    <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{p.assetType}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {posRows.length === 0 && !positionsQuery.isLoading && (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <Briefcase className="h-8 w-8 text-green-400" />
          <div className="text-sm font-medium">No positions uploaded yet</div>
          <div className="text-xs">Upload a positions CSV above for each account</div>
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
        <span>Anonymized insights — your individual data is never shared</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {sorted.map((ins) => {
          const wr = ins.winRate ?? 0;
          const bg = wr >= 65 ? "bg-green-100 border-green-300" : wr >= 50 ? "bg-blue-50 border-blue-200" : wr > 0 ? "bg-yellow-50 border-yellow-200" : "bg-slate-50 border-slate-200";
          const textColor = wr >= 65 ? "text-green-700" : wr >= 50 ? "text-blue-700" : wr > 0 ? "text-yellow-700" : "text-slate-600";
          return (
            <div key={ins.ticker} className={`rounded-lg border p-3 ${bg}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-foreground">{ins.ticker}</span>
                <Badge variant="outline" className={`text-[10px] px-1 ${textColor} border-current`}>{ins.totalTrades}T</Badge>
              </div>
              <div className={`text-lg font-bold ${textColor}`}>{ins.winRate != null ? `${ins.winRate.toFixed(0)}%` : "—"}</div>
              <div className="text-[10px] text-muted-foreground">win rate</div>
              {ins.avgPnlPct != null && (
                <div className={`text-xs mt-1 font-medium ${ins.avgPnlPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                  avg {ins.avgPnlPct >= 0 ? "+" : ""}{ins.avgPnlPct.toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Upload Trades Tab ─────────────────────────────────────────────────────────

function UploadTradesTab() {
  const [uploadAccount, setUploadAccount] = useState("");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("trades.csv");
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const [parseResult, setParseResult] = useState<{
    headers: string[]; columnMap: Record<string, number>;
    preview: Array<{ ticker: string; tradeDate: string; side: string; qty: number | null; entryPrice: number | null; exitPrice: number | null; pnl: number | null; pnlPct: number | null; strategy: string; assetType: string; notes: string }>;
    totalRows: number; unmappedColumns: string[]; detectedColumns: string[];
  } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const parseMutation = trpc.tradeUpload.parseCsv.useMutation({
    onSuccess: (data) => { setParseResult(data); toast.success(`Parsed ${data.totalRows} rows`); },
    onError: (e) => toast.error(`Parse error: ${e.message}`),
  });

  const confirmMutation = trpc.tradeUpload.confirmUpload.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.rowsInserted} trades!`);
      setParseResult(null); setCsvText(""); setShowConfirmDialog(false);
      setImportedCount(data.rowsInserted);
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const handleFile = (text: string, name: string) => {
    setCsvText(text); setFilename(name);
    const acct = KNOWN_ACCOUNTS.find(a => a.id === uploadAccount);
    parseMutation.mutate({ csvText: text, filename: name, accountId: acct?.id, accountLabel: acct?.label });
  };

  const handleConfirm = () => {
    const acct = KNOWN_ACCOUNTS.find(a => a.id === uploadAccount);
    confirmMutation.mutate({ csvText, filename, accountId: acct?.id, accountLabel: acct?.label });
  };

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500" />
          Import Trade History from CSV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg p-3">
          <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <span><strong className="text-blue-700">Your data stays private.</strong> <span className="text-blue-600">Individual trades are only visible to you. Community Insights shows only anonymized aggregates.</span></span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Account:</span>
          <AccountSelector value={uploadAccount} onChange={setUploadAccount} placeholder="Select account (optional)" />
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {["E*TRADE", "Schwab", "TD Ameritrade", "Webull", "Robinhood"].map(b => (
              <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>
            ))}
          </div>
        </div>

        {parseMutation.isPending ? (
          <div className="flex flex-col items-center justify-center h-24 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-green-500" />
            <div className="text-sm text-muted-foreground">Parsing CSV…</div>
          </div>
        ) : (
          <UploadZone onFile={handleFile} />
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={downloadTradeTemplate}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Download Template
          </Button>
        </div>

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
            {/* Preview */}
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
                  {parseResult.preview.map((r, i) => (
                    <tr key={i} className="border-t border-border hover:bg-accent/30">
                      <td className="px-3 py-2 font-bold">{r.ticker || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.tradeDate || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] ${r.side === "BUY" || r.side === "LONG" ? "border-green-400 text-green-700" : "border-red-400 text-red-600"}`}>{r.side}</Badge>
                      </td>
                      <td className="px-3 py-2">{r.qty ?? "—"}</td>
                      <td className="px-3 py-2">{fmt(r.entryPrice)}</td>
                      <td className="px-3 py-2">{fmt(r.exitPrice)}</td>
                      <td className={`px-3 py-2 ${pnlColor(r.pnl)}`}>{fmt(r.pnl)}</td>
                      <td className={`px-3 py-2 ${pnlColor(r.pnlPct)}`}>{r.pnlPct != null ? fmtPct(r.pnlPct) : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.strategy || "—"}</td>
                      <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{r.assetType}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => { setParseResult(null); setCsvText(""); }}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />Cancel
              </Button>
              <Button className="bg-green-500 hover:bg-green-600 text-white" size="sm" onClick={() => setShowConfirmDialog(true)}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />Import {parseResult.totalRows} Trades
              </Button>
            </div>
          </div>
        )}

        {/* AI CTA after import */}
        {importedCount !== null && (
          <div className="rounded-xl border-2 px-5 py-4 flex items-center gap-4 cursor-pointer transition-all hover:shadow-md"
            style={{ borderColor: "#8b5cf644", background: "#8b5cf608" }}
            onClick={() => navigate(`${ROUTES.PIT_ADVISOR}?prompt=${encodeURIComponent(`I just imported ${importedCount} trades. Analyze my trading performance — win rate, best/worst tickers, strategy breakdown, day-of-week patterns, and give me 3 specific improvements.`)}`)}>
            <Sparkles className="h-6 w-6 shrink-0" style={{ color: "#8b5cf6" }} />
            <div>
              <div className="font-semibold text-sm" style={{ color: "#8b5cf6" }}>Analyze with Pit Advisor</div>
              <div className="text-xs text-muted-foreground">Get AI insights on your {importedCount} imported trades</div>
            </div>
            <ChevronRight className="h-4 w-4 ml-auto" style={{ color: "#8b5cf6" }} />
          </div>
        )}
      </CardContent>

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
              Import <strong>{parseResult?.totalRows}</strong> trades from <strong>{filename}</strong>
              {uploadAccount && <> for <strong>{KNOWN_ACCOUNTS.find(a => a.id === uploadAccount)?.label}</strong></>}?
            </div>
            <div className="text-xs text-muted-foreground bg-slate-50 rounded-lg p-3 border border-border">
              Trades will be stored privately. Anonymized aggregates contribute to Community Insights.
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
              <Button className="bg-green-500 hover:bg-green-600 text-white" size="sm" onClick={handleConfirm} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                {confirmMutation.isPending ? "Importing…" : "Confirm Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradeUpload() {
  const [tab, setTab] = useState("positions");

  return (
    <ActionLayout toolName="Analyze My Trades" toolColor="#ec4899">
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-green-500" />
              My Accounts & Trade History
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload positions and trade history from E*TRADE -4723, E*TRADE -2738, and Schwab
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="positions" className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Current Positions
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Upload Trade History
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

          <TabsContent value="positions" className="mt-4">
            <PositionsTab />
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <UploadTradesTab />
          </TabsContent>

          <TabsContent value="my-trades" className="mt-4">
            <MyTradesTab />
          </TabsContent>

          <TabsContent value="community" className="mt-4">
            <CommunityInsightsTab />
          </TabsContent>
        </Tabs>
      </div>
    </ActionLayout>
  );
}
