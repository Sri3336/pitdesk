/**
 * DayTradingPicks — Action 2: "Give me a ticker for day trading"
 * Auto-runs intraday scan on load, surfaces top 5 Grade-A setups as action cards.
 */
import { ActionLayout } from "@/components/ActionLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

function directionIcon(dir: string) {
  const d = dir?.toLowerCase();
  if (d === "bullish") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (d === "bearish") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Activity className="w-4 h-4 text-slate-400" />;
}

function directionColor(dir: string) {
  const d = dir?.toLowerCase();
  if (d === "bullish") return "#22c55e";
  if (d === "bearish") return "#ef4444";
  return "#94a3b8";
}

function gradeColor(grade: string) {
  if (grade === "A") return { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", text: "#16a34a" };
  if (grade === "B") return { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)", text: "#2563eb" };
  if (grade === "C") return { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#d97706" };
  return { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#dc2626" };
}

// ── Set Alert button — one-click IVR alert creation ─────────────────────────
function SetAlertButton({ ticker, direction }: { ticker: string; direction: string }) {
  const [alertSet, setAlertSet] = useState(false);
  const utils = trpc.useUtils();

  // Smart threshold: bullish setups alert at IVR 65 (IV spike = premium selling opp)
  // bearish/neutral alert at IVR 55 (elevated fear = potential reversal)
  const dir = direction?.toLowerCase();
  const smartThreshold = dir === "bullish" ? 65 : 55;

  const createAlert = trpc.ivrAlerts.create.useMutation({
    onSuccess: () => {
      setAlertSet(true);
      toast.success(`IVR alert set for ${ticker}`, {
        description: `Alert fires when ${ticker} IV rank crosses ${smartThreshold} — smart threshold based on ${dir} setup.`,
      });
      utils.ivrAlerts.list.invalidate();
    },
    onError: (err) => {
      // If alert already exists, still show success
      if (err.message?.includes("duplicate") || err.message?.includes("already")) {
        setAlertSet(true);
        toast.info(`Alert already exists for ${ticker}`);
      } else {
        toast.error(`Failed to set alert for ${ticker}`);
      }
    },
  });

  function handleSetAlert() {
    if (alertSet) return;
    createAlert.mutate({
      ticker,
      ivrThreshold: smartThreshold,
      direction: "above",
      notes: `Auto-set from Day Trading Picks — Grade A ${dir} setup. Smart threshold: IVR ${smartThreshold} (${dir === "bullish" ? "IV spike = premium selling opp" : "elevated fear = reversal watch"})`,
    });
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 text-xs gap-1.5 transition-all"
      style={alertSet
        ? { borderColor: "rgba(34,197,94,0.4)", color: "#16a34a", background: "rgba(34,197,94,0.08)" }
        : { borderColor: "rgba(245,158,11,0.4)", color: "#d97706" }
      }
      onClick={handleSetAlert}
      disabled={createAlert.isPending || alertSet}
    >
      {alertSet
        ? <><BellRing className="w-3.5 h-3.5" /> Alert Set</>  
        : <><Bell className="w-3.5 h-3.5" /> Alert @ IVR {smartThreshold}</>
      }
    </Button>
  );
}

export default function DayTradingPicks() {
  const [, navigate] = useLocation();
  const [hasTriggered, setHasTriggered] = useState(false);

  // Load latest scans from DB
  const { data: latestScans, isLoading: scansLoading, refetch } = trpc.intraday.getLatestScans.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Run fresh scan mutation
  const runScanMutation = trpc.intraday.runScan.useMutation({
    onSuccess: () => refetch(),
  });

  // Auto-trigger scan on first load
  useEffect(() => {
    if (!hasTriggered) {
      setHasTriggered(true);
      runScanMutation.mutate({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isScanning = runScanMutation.isPending;

  // Top 5 Grade-A picks, sorted by score desc
  const gradeA = (latestScans ?? [])
    .filter((s) => s.grade === "A")
    .sort((a, b) => Number(b.weightedScore) - Number(a.weightedScore))
    .slice(0, 5);

  // All results sorted for the full table
  const allSorted = (latestScans ?? [])
    .sort((a, b) => Number(b.weightedScore) - Number(a.weightedScore));

  function openPitAdvisor(ticker: string, direction: string, score: number) {
    const prompt = `I'm looking at ${ticker} for a day trade today. Intraday scan grade: A, direction: ${direction}, score: ${score}. Give me a 5-dimension analysis (Technical, Fundamental, Geopolitical, Sentiment, Quantitative) and a specific day trade setup with entry price, stop loss, T1 and T2 targets, and options strategy if applicable.`;
    navigate(`/pit-advisor?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <ActionLayout toolName="Day Trading Picks" toolColor="#f59e0b">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
              Day Trading Picks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scanning {allSorted.length > 0 ? allSorted.length : "50+"} tickers across 9 intraday criteria. Top Grade-A setups for today.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => runScanMutation.mutate({})}
            disabled={isScanning}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Scanning..." : "Refresh"}
          </Button>
        </div>

        {/* ── Scanning state ─────────────────────────────────────────── */}
        {isScanning && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-amber-100 border-t-amber-500 animate-spin" />
              <Zap className="absolute inset-0 m-auto w-6 h-6 text-amber-500" />
            </div>
            <div className="text-center">
              <div className="font-semibold text-foreground">Running intraday scan...</div>
              <div className="text-sm text-muted-foreground mt-1">
                Scoring tickers across 9 criteria: EMA stack, VWAP, RVOL, RSI, ATR, price structure, and more
              </div>
            </div>
          </div>
        )}

        {/* ── No Grade-A results ─────────────────────────────────────── */}
        {!isScanning && !scansLoading && gradeA.length === 0 && latestScans && latestScans.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Target className="w-10 h-10 opacity-30" />
              <div className="font-medium">No Grade-A setups right now</div>
              <div className="text-sm text-center max-w-sm">
                Market conditions don't show high-conviction intraday setups at this moment. Check back after the opening range (9:45–10:15 AM ET).
              </div>
              <Button variant="outline" size="sm" onClick={() => runScanMutation.mutate({})}>
                Scan Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Top 5 Grade-A Cards ────────────────────────────────────── */}
        {!isScanning && gradeA.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm font-semibold text-foreground">
                {gradeA.length} Grade-A Setup{gradeA.length > 1 ? "s" : ""} Found
              </span>
              <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                High Conviction
              </Badge>
            </div>

            {gradeA.map((scan, i) => {
              const gc = gradeColor(scan.grade);
              const price = Number(scan.price ?? 0);
              const vwap = Number(scan.vwap ?? 0);
              const atr = Number(scan.atr ?? 0);
              const entry = price;
              const stop = scan.direction?.toLowerCase() === "bullish"
                ? (price - atr * 0.5).toFixed(2)
                : (price + atr * 0.5).toFixed(2);
              const t1 = scan.direction?.toLowerCase() === "bullish"
                ? (price + atr * 1.0).toFixed(2)
                : (price - atr * 1.0).toFixed(2);
              const t2 = scan.direction?.toLowerCase() === "bullish"
                ? (price + atr * 2.0).toFixed(2)
                : (price - atr * 2.0).toFixed(2);

              return (
                <div
                  key={scan.ticker}
                  className="rounded-2xl border p-5 transition-all duration-200 hover:shadow-md"
                  style={{ background: gc.bg, borderColor: gc.border }}
                >
                  <div className="flex items-start gap-4">
                    {/* Rank */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: "#f59e0b22", color: "#d97706" }}
                    >
                      #{i + 1}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-bold font-mono" style={{ color: "var(--foreground)" }}>
                          {scan.ticker}
                        </span>
                        <Badge
                          className="text-xs font-bold"
                          style={{ background: gc.bg, color: gc.text, border: `1px solid ${gc.border}` }}
                        >
                          Grade {scan.grade}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {directionIcon(scan.direction)}
                          <span className="text-xs font-medium capitalize" style={{ color: directionColor(scan.direction) }}>
                            {scan.direction}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          Score: {Number(scan.weightedScore).toFixed(1)}/{Number(scan.maxScore).toFixed(0)}
                        </span>
                      </div>

                      {/* Price levels */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Entry</div>
                          <div className="font-semibold font-mono text-sm">${entry.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowDown className="w-3 h-3 text-red-400" /> Stop
                          </div>
                          <div className="font-semibold font-mono text-sm text-red-500">${stop}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-green-400" /> T1
                          </div>
                          <div className="font-semibold font-mono text-sm text-green-600">${t1}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-green-400" /> T2
                          </div>
                          <div className="font-semibold font-mono text-sm text-green-600">${t2}</div>
                        </div>
                      </div>

                      {/* VWAP / ATR context */}
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>VWAP: <span className="font-mono">${vwap.toFixed(2)}</span></span>
                        <span>ATR: <span className="font-mono">${atr.toFixed(2)}</span></span>
                        <span className={price > vwap ? "text-green-600" : "text-red-500"}>
                          {price > vwap ? "Above VWAP ✓" : "Below VWAP ✗"}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={() => navigate(`/ticker-analysis?ticker=${scan.ticker}`)}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Analyze
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        style={{ borderColor: "#8b5cf644", color: "#8b5cf6" }}
                        onClick={() => openPitAdvisor(scan.ticker, scan.direction, Number(scan.weightedScore))}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ask Pit
                      </Button>
                      <SetAlertButton ticker={scan.ticker} direction={scan.direction} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Full scan table (Grade B/C/D) ──────────────────────────── */}
        {!isScanning && allSorted.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              All {allSorted.length} Scanned Tickers
            </div>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--muted)" }}>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Ticker</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Grade</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Direction</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Score</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Price</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">VWAP</th>
                  </tr>
                </thead>
                <tbody>
                  {allSorted.map((scan) => {
                    const gc = gradeColor(scan.grade);
                    return (
                      <tr
                        key={scan.ticker}
                        className="border-b last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/ticker-analysis?ticker=${scan.ticker}`)}
                      >
                        <td className="px-3 py-2 font-mono font-semibold">{scan.ticker}</td>
                        <td className="px-3 py-2">
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-bold"
                            style={{ background: gc.bg, color: gc.text }}
                          >
                            {scan.grade}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {directionIcon(scan.direction)}
                            <span className="text-xs capitalize" style={{ color: directionColor(scan.direction) }}>
                              {scan.direction}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {Number(scan.weightedScore).toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          ${Number(scan.price).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs hidden sm:table-cell">
                          ${Number(scan.vwap).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ActionLayout>
  );
}
