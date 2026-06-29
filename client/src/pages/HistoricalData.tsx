/**
 * Historical Data — 5-Year OHLCV Download & Export
 *
 * Lets Sridhar download 5 years of daily OHLCV bars for all 212 tickers
 * across four universes (PCR, Ticker Universe, Intraday, Dux) into the DB,
 * then export any subset as a combined CSV for backtesting.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Download,
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  BarChart2,
  FileDown,
  Trash2,
  AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Universe = "pcr" | "ticker_universe" | "intraday" | "dux";

const UNIVERSE_LABELS: Record<Universe, string> = {
  pcr: "PCR Signal Board (60)",
  ticker_universe: "Ticker Universe (60)",
  intraday: "Intraday Scanner (49)",
  dux: "Dux Universe (103)",
};

const UNIVERSE_DESCRIPTIONS: Record<Universe, string> = {
  pcr: "SPY, QQQ, AAPL, NVDA, TSLA and 55 more liquid names used in the PCR Signal Board",
  ticker_universe: "66-ticker curated universe with sector metadata used in the Options Analyzer",
  intraday: "50-ticker watchlist across AI/Semis, Mega-Cap Tech, Financials, ETFs",
  dux: "103 small-cap momentum names used by the Steven Dux 5-Filter Scanner",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "done")
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[11px]">
        <CheckCircle2 className="h-3 w-3" /> Done
      </Badge>
    );
  if (status === "running")
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 text-[11px]">
        <Loader2 className="h-3 w-3 animate-spin" /> Downloading
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-[11px]">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HistoricalData() {
  const [selectedUniverses, setSelectedUniverses] = useState<Universe[]>(["pcr", "ticker_universe", "intraday", "dux"]);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);

  // CSV export state
  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().split("T")[0];
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [exportUniverses, setExportUniverses] = useState<Universe[]>(["pcr"]);
  const [tickerFilter, setTickerFilter] = useState("");

  const prevDoneRef = useRef(0);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const statusQuery = trpc.historicalData.getDownloadStatus.useQuery(undefined, {
    refetchInterval: pollingActive ? 3000 : false,
  });

  const summaryQuery = trpc.historicalData.getUniverseSummary.useQuery();

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const startDownload = trpc.historicalData.startBulkDownload.useMutation({
    onSuccess: ({ queued }) => {
      toast.success(`Download started — ${queued} tickers queued`);
      setIsDownloading(true);
      setPollingActive(true);
    },
    onError: (err) => toast.error(`Failed to start download: ${err.message}`),
  });

  const resetJobs = trpc.historicalData.resetJobs.useMutation({
    onSuccess: () => {
      toast.success("Jobs reset — ready for a fresh download");
      setIsDownloading(false);
      setPollingActive(false);
      statusQuery.refetch();
      summaryQuery.refetch();
    },
  });

  const exportCsv = trpc.historicalData.exportCsv.useMutation({
    onSuccess: ({ csv, rowCount }) => {
      if (!csv) { toast.error("No data found for the selected range"); return; }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pitdesk_ohlcv_${exportFrom}_to_${exportTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rowCount.toLocaleString()} rows`);
    },
    onError: (err) => toast.error(`Export failed: ${err.message}`),
  });

  // ── Stop polling when all done ────────────────────────────────────────────────
  useEffect(() => {
    const s = statusQuery.data;
    if (!s) return;
    const activeDone = s.done;
    if (activeDone > prevDoneRef.current) {
      prevDoneRef.current = activeDone;
    }
    if (pollingActive && s.pending === 0 && s.running === 0 && s.total > 0) {
      setPollingActive(false);
      setIsDownloading(false);
      summaryQuery.refetch();
      if (s.error > 0) {
        toast.warning(`Download complete — ${s.done} done, ${s.error} errors`);
      } else {
        toast.success(`All ${s.done} tickers downloaded successfully!`);
      }
    }
  }, [statusQuery.data, pollingActive]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const toggleUniverse = (u: Universe) =>
    setSelectedUniverses((prev) =>
      prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]
    );

  const toggleExportUniverse = (u: Universe) =>
    setExportUniverses((prev) =>
      prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]
    );

  const handleStartDownload = () => {
    if (selectedUniverses.length === 0) {
      toast.error("Select at least one universe");
      return;
    }
    startDownload.mutate({ universes: selectedUniverses, forceRefresh });
  };

  const handleExport = () => {
    if (exportUniverses.length === 0) { toast.error("Select at least one universe to export"); return; }
    // Build ticker list from selected universes + optional filter
    const summary = summaryQuery.data ?? [];
    const tickers = new Set<string>();
    for (const u of exportUniverses) {
      const found = summary.find((s) => s.key === u);
      if (found) found.tickerDetails.filter((t) => t.barCount > 0).forEach((t) => tickers.add(t.ticker));
    }
    if (tickerFilter.trim()) {
      const filter = tickerFilter.toUpperCase().split(/[\s,]+/).filter(Boolean);
      filter.forEach((t) => tickers.add(t));
    }
    if (tickers.size === 0) { toast.error("No downloaded tickers found for selected universes"); return; }
    exportCsv.mutate({ tickers: Array.from(tickers), from: exportFrom, to: exportTo });
  };

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const status = statusQuery.data;
  const progressPct = status && status.total > 0 ? Math.round(((status.done + status.error) / status.total) * 100) : 0;
  const totalBarsStored = (summaryQuery.data ?? []).reduce((sum, u) => sum + u.totalBars, 0);
  const totalTickersDownloaded = (summaryQuery.data ?? []).reduce((sum, u) => sum + u.downloadedCount, 0);

  // Filter jobs for display
  const jobs = (status?.jobs ?? []) as any[];
  const filteredJobs = tickerFilter.trim()
    ? jobs.filter((j) => j.ticker.includes(tickerFilter.toUpperCase()))
    : jobs;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-green-500" />
            Historical Price Data
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Download 5 years of daily OHLCV bars for all 212 tickers and export as CSV for backtesting.
          </p>
        </div>
        {totalBarsStored > 0 && (
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">{totalBarsStored.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">bars stored · {totalTickersDownloaded} tickers</div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {summaryQuery.data && summaryQuery.data.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryQuery.data.map((u) => (
            <Card key={u.key} className="border border-border">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground mb-1">{u.name}</div>
                <div className="text-lg font-bold">{u.downloadedCount} / {u.tickerDetails.length}</div>
                <div className="text-xs text-muted-foreground">{u.totalBars.toLocaleString()} bars</div>
                <Progress
                  value={u.tickerDetails.length > 0 ? (u.downloadedCount / u.tickerDetails.length) * 100 : 0}
                  className="h-1 mt-2"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="download">
        <TabsList>
          <TabsTrigger value="download" className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Download
          </TabsTrigger>
          <TabsTrigger value="progress" className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" /> Progress
            {status && status.running > 0 && (
              <Badge className="ml-1 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0">{status.running}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-1.5">
            <FileDown className="h-3.5 w-3.5" /> Export CSV
          </TabsTrigger>
        </TabsList>

        {/* ── Download Tab ── */}
        <TabsContent value="download" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Universes to Download</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(UNIVERSE_LABELS) as Universe[]).map((u) => {
                  const summary = summaryQuery.data?.find((s) => s.key === u);
                  return (
                    <div
                      key={u}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        selectedUniverses.includes(u)
                          ? "border-green-400 bg-green-50"
                          : "border-border hover:border-muted-foreground"
                      }`}
                      onClick={() => toggleUniverse(u)}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedUniverses.includes(u)}
                          onCheckedChange={() => toggleUniverse(u)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{UNIVERSE_LABELS[u]}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{UNIVERSE_DESCRIPTIONS[u]}</div>
                          {summary && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-green-700 font-medium">
                                {summary.downloadedCount}/{summary.tickerDetails.length} downloaded
                              </span>
                              {summary.totalBars > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  · {summary.totalBars.toLocaleString()} bars
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="force-refresh"
                    checked={forceRefresh}
                    onCheckedChange={(v) => setForceRefresh(!!v)}
                  />
                  <Label htmlFor="force-refresh" className="text-sm cursor-pointer">
                    Force re-download (overwrite existing data)
                  </Label>
                </div>
              </div>

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                <div>
                  <strong>~3–4 minutes</strong> for all 212 tickers. The download runs in the background — you can
                  navigate away and check the Progress tab. Data is fetched from Yahoo Finance (5-year daily bars,
                  ~1,260 bars per ticker).
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleStartDownload}
                  disabled={startDownload.isPending || isDownloading || selectedUniverses.length === 0}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {startDownload.isPending || isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Start Download
                    </>
                  )}
                </Button>
                {status && status.total > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetJobs.mutate()}
                    disabled={resetJobs.isPending || isDownloading}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Reset Jobs
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Progress Tab ── */}
        <TabsContent value="progress" className="mt-4 space-y-4">
          {!status || status.total === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
              <Database className="h-10 w-10 opacity-30" />
              <p className="text-sm">No download jobs yet — start a download from the Download tab.</p>
            </div>
          ) : (
            <>
              {/* Stats bar */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">{status.done} done</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-medium">{status.running} running</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-sm font-medium">{status.pending} pending</span>
                </div>
                {status.error > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-sm font-medium text-red-600">{status.error} errors</span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{progressPct}%</span>
                  {pollingActive && (
                    <span className="flex items-center gap-1 text-xs text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Live
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { statusQuery.refetch(); summaryQuery.refetch(); }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <Progress value={progressPct} className="h-2" />

              {/* Ticker filter */}
              <Input
                placeholder="Filter by ticker…"
                value={tickerFilter}
                onChange={(e) => setTickerFilter(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />

              {/* Jobs table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Ticker</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Universe</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Bars</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.slice(0, 300).map((job: any) => (
                      <tr key={job.ticker} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono font-semibold">{job.ticker}</td>
                        <td className="px-4 py-2 text-muted-foreground capitalize text-xs">{job.universe.replace("_", " ")}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {job.barsDownloaded > 0 ? job.barsDownloaded.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-2 text-red-600 text-xs max-w-xs truncate">
                          {job.errorMsg ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredJobs.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">No jobs match your filter.</div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Export CSV Tab ── */}
        <TabsContent value="export" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Export OHLCV as CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Universe selector */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Universes to export</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(UNIVERSE_LABELS) as Universe[]).map((u) => {
                    const summary = summaryQuery.data?.find((s) => s.key === u);
                    const downloaded = summary?.downloadedCount ?? 0;
                    return (
                      <button
                        key={u}
                        onClick={() => toggleExportUniverse(u)}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                          exportUniverses.includes(u)
                            ? "border-green-400 bg-green-50 text-green-800"
                            : "border-border text-muted-foreground hover:border-muted-foreground"
                        }`}
                      >
                        {UNIVERSE_LABELS[u]}
                        {downloaded > 0 && (
                          <span className="ml-1.5 text-xs opacity-70">({downloaded})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
                  <Input
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    className="h-8 text-sm w-40"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
                  <Input
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    className="h-8 text-sm w-40"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Additional tickers (comma-separated)</Label>
                  <Input
                    placeholder="e.g. PLTR, HOOD, MSTR"
                    value={tickerFilter}
                    onChange={(e) => setTickerFilter(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* CSV format info */}
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground font-mono">
                ticker,date,open,high,low,close,volume,adj_close<br />
                AAPL,2024-01-02,185.2300,185.8800,182.7300,185.5200,79878700,185.5200<br />
                AAPL,2024-01-03,184.2200,185.8800,183.4300,184.2500,55751600,184.2500<br />
                …
              </div>

              <Button
                onClick={handleExport}
                disabled={exportCsv.isPending || exportUniverses.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {exportCsv.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating CSV…
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-2" />
                    Download CSV
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground">
                Only tickers that have been downloaded are included. Download missing tickers first from the Download tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
