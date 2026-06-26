/**
 * TickerAnalysis — Action 1: "Analyze a Ticker"
 * Full-page: ticker search → TradingView chart + PCR signal + options strategy + Pit Advisor pre-fill
 */
import { ActionLayout } from "@/components/ActionLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart2,
  MessageSquare,
  Search,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";

// Popular tickers for quick-pick
const QUICK_TICKERS = ["NVDA", "AAPL", "TSLA", "PLTR", "AMD", "META", "MSFT", "SPY", "QQQ", "APP"];

// PCR signal color
function pcrColor(signal: string) {
  if (signal?.includes("EXTREME_FEAR") || signal?.includes("FEAR")) return "#22c55e";
  if (signal?.includes("EXTREME_GREED") || signal?.includes("GREED")) return "#ef4444";
  return "#94a3b8";
}
function pcrLabel(signal: string) {
  if (!signal) return "No Signal";
  return signal.replace(/_/g, " ");
}

// TradingView widget embed
function TradingViewChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !ticker) return;
    // Remove previous widget
    if (widgetRef.current) {
      widgetRef.current.remove();
      widgetRef.current = null;
    }
    const div = document.createElement("div");
    div.className = "tradingview-widget-container__widget";
    containerRef.current.appendChild(div);
    widgetRef.current = div;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: ticker,
      interval: "D",
      timezone: "America/New_York",
      theme: "light",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies", "Volume@tv-basicstudies"],
    });
    containerRef.current.appendChild(script);

    return () => {
      script.remove();
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
    };
  }, [ticker]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full"
      style={{ height: 480 }}
    />
  );
}

export default function TickerAnalysis() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialTicker = params.get("ticker")?.toUpperCase() ?? "";

  const [inputValue, setInputValue] = useState(initialTicker);
  const [activeTicker, setActiveTicker] = useState(initialTicker);
  const [, navigate] = useLocation();

  // PCR data for the ticker (getBatch with single ticker)
  const { data: pcrBatch, isLoading: pcrLoading } = trpc.pcr.getBatch.useQuery(
    { tickers: [activeTicker] },
    { enabled: !!activeTicker, retry: 1 }
  );
  const pcrData = pcrBatch?.[0] ?? null;

  // Options analysis (run analysis engine)
  const analysisMutation = trpc.analysis.run.useMutation();
  const analysisData = analysisMutation.data;
  const analysisLoading = analysisMutation.isPending;
  const runAnalysis = analysisMutation.mutate;

  function handleSearch(ticker?: string) {
    const t = (ticker ?? inputValue).toUpperCase().trim();
    if (!t) return;
    setActiveTicker(t);
    setInputValue(t);
    // Auto-run options analysis
    runAnalysis({ ticker: t });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  function openPitAdvisor() {
    if (!activeTicker) return;
    const pcrSignal = pcrData?.signal ?? "N/A";
    const pcr = pcrData?.pcr ?? "N/A";
    const strategy = analysisData?.recommendation?.name ?? "N/A";
    const prompt = `Analyze ${activeTicker} across all 5 dimensions (Technical, Fundamental, Geopolitical, Sentiment, Quantitative). PCR: ${pcr} (${pcrSignal}). Recommended options strategy: ${strategy}. Give me specific entry price, stop loss, T1 and T2 targets, and position sizing for a $10,000 account.`;
    navigate(`/pit-advisor?prompt=${encodeURIComponent(prompt)}`);
  }

  const hasData = !!activeTicker;

  return (
    <ActionLayout toolName="Analyze a Ticker" toolColor="#22c55e">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ── Search bar ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Analyze a Ticker
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-lg">
            Enter any ticker to get a full chart, PCR signal, options strategy recommendation, and entry/exit levels.
          </p>
          <div className="flex gap-2 w-full max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 h-11 text-base font-mono uppercase"
                placeholder="NVDA, AAPL, TSLA..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button
              className="h-11 px-5 bg-green-500 hover:bg-green-600 text-white font-semibold"
              onClick={() => handleSearch()}
            >
              Analyze
            </Button>
          </div>
          {/* Quick-pick tickers */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {QUICK_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => handleSearch(t)}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-colors hover:border-green-400 hover:text-green-600"
                style={{
                  borderColor: activeTicker === t ? "#22c55e" : "var(--border)",
                  color: activeTicker === t ? "#22c55e" : "var(--muted-foreground)",
                  background: activeTicker === t ? "rgba(34,197,94,0.08)" : "transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {!hasData && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <BarChart2 className="w-12 h-12 opacity-20" />
            <p className="text-sm">Enter a ticker above to begin analysis</p>
          </div>
        )}

        {hasData && (
          <>
            {/* ── Top signal strip ──────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* PCR Signal */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">PCR Signal</div>
                  {pcrLoading ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <div className="font-bold text-sm" style={{ color: pcrColor(pcrData?.signal ?? "") }}>
                      {pcrLabel(pcrData?.signal ?? "No data")}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* PCR Value */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Put/Call Ratio</div>
                  {pcrLoading ? (
                    <Skeleton className="h-6 w-16" />
                  ) : (
                    <div className="font-bold text-sm font-mono">
                      {pcrData?.pcr != null ? Number(pcrData.pcr).toFixed(2) : "—"}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommended Strategy */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Options Strategy</div>
                  {analysisLoading ? (
                    <Skeleton className="h-6 w-28" />
                  ) : (
                    <div className="font-bold text-sm text-blue-600">
                      {analysisData?.recommendation?.name ?? "Run analysis"}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ask Pit Advisor CTA */}
              <Card
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                style={{ background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.2)" }}
                onClick={openPitAdvisor}
              >
                <CardContent className="p-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 shrink-0" style={{ color: "#8b5cf6" }} />
                  <div>
                    <div className="text-xs text-muted-foreground">Deep Analysis</div>
                    <div className="font-bold text-sm" style={{ color: "#8b5cf6" }}>Ask Pit Advisor</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── TradingView Chart ──────────────────────────────────── */}
            <Card className="border shadow-sm overflow-hidden">
              <CardHeader className="pb-0 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-500" />
                  {activeTicker} — Daily Chart
                  <Badge variant="outline" className="text-xs ml-1">TradingView</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-2">
                <TradingViewChart ticker={activeTicker} />
              </CardContent>
            </Card>

            {/* ── Options Strategy Detail ────────────────────────────── */}
            {(analysisData || analysisLoading) && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Options Strategy Recommendation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysisLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : analysisData?.recommendation ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Strategy</div>
                        <div className="font-semibold text-blue-600">{analysisData.recommendation.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Net Credit / Debit</div>
                        <div className="font-semibold font-mono">
                          {analysisData.recommendation.netCredit != null
                            ? `$${Number(analysisData.recommendation.netCredit).toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Max Profit</div>
                        <div className="font-semibold font-mono text-green-600">
                          {analysisData.recommendation.maxProfit != null
                            ? `$${Number(analysisData.recommendation.maxProfit).toFixed(2)}`
                            : "Unlimited"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Prob of Profit</div>
                        <div className="font-semibold font-mono">
                          {(analysisData.recommendation.pop * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Max Loss</div>
                        <div className="font-semibold font-mono text-red-500">
                          {analysisData.recommendation.maxLoss != null
                            ? `$${Number(analysisData.recommendation.maxLoss).toFixed(2)}`
                            : "Unlimited"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Score</div>
                        <div className="font-semibold font-mono">
                          {analysisData.recommendation.compositeScore.toFixed(1)}/10
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        <div className="text-xs text-muted-foreground mb-0.5">Rationale</div>
                        <div className="text-sm text-foreground leading-relaxed">{analysisData.recommendation.rationale}</div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {/* ── PCR Detail ────────────────────────────────────────── */}
            {pcrData && !pcrLoading && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    PCR Signal Detail — {activeTicker}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">PCR</div>
                      <div className="font-semibold font-mono">{Number(pcrData.pcr).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Signal</div>
                      <div className="font-semibold" style={{ color: pcrColor(pcrData.signal) }}>
                        {pcrLabel(pcrData.signal)}
                      </div>
                    </div>
                    {pcrData.strategyHint && (
                      <div className="col-span-2 sm:col-span-4">
                        <div className="text-xs text-muted-foreground mb-0.5">Strategy Hint</div>
                        <div className="text-sm text-foreground">{pcrData.strategyHint}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Full analysis CTA ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3 pb-4">
              <Button
                className="flex-1 h-11 bg-green-500 hover:bg-green-600 text-white font-semibold gap-2"
                onClick={() => navigate(`/analyzer?ticker=${activeTicker}`)}
              >
                <Activity className="w-4 h-4" />
                Full Options Analysis (13 Strategies)
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 font-semibold gap-2"
                style={{ borderColor: "#8b5cf644", color: "#8b5cf6" }}
                onClick={openPitAdvisor}
              >
                <MessageSquare className="w-4 h-4" />
                Deep Dive with Pit Advisor
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 font-semibold gap-2"
                onClick={() => navigate(`/pcr-strategy?ticker=${activeTicker}`)}
              >
                <TrendingDown className="w-4 h-4" />
                PCR Signal Board
              </Button>
            </div>
          </>
        )}
      </div>
    </ActionLayout>
  );
}
