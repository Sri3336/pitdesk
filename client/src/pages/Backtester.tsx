import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  FlaskConical, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
} from "lucide-react";

type Strategy = "dux_5filter" | "velez_pullback";

const STRATEGY_META: Record<Strategy, { label: string; desc: string }> = {
  dux_5filter: {
    label: "Dux 5-Filter",
    desc: "Gap-up ≥ N%, volume ≥ 2× avg, close top 30% of range, prior day red",
  },
  velez_pullback: {
    label: "Velez Pullback",
    desc: "3-day quiet pullback above 20-EMA in an established uptrend",
  },
};

export default function Backtester() {
  const [strategy, setStrategy] = useState<Strategy>("dux_5filter");
  const [minGapPct, setMinGapPct] = useState(5);
  const [minVolMultiplier, setMinVolMultiplier] = useState(2);
  const [emaPeriod, setEmaPeriod] = useState(20);
  const [profitTargetPct, setProfitTargetPct] = useState(10);
  const [stopLossPct, setStopLossPct] = useState(5);
  const [maxHoldDays, setMaxHoldDays] = useState(5);
  const [result, setResult] = useState<any>(null);
  const [tradeFilter, setTradeFilter] = useState<"all" | "win" | "loss">("all");

  const { data: readiness } = trpc.backtester.getDataReadiness.useQuery();
  const hasData = readiness && Number(readiness.tickersWithData) > 0;

  const runMutation = trpc.backtester.runBacktest.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Backtest complete — ${data.totalTrades} trades found`);
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredTrades = (result?.trades ?? []).filter((t: any) => {
    if (tradeFilter === "win") return t.pnlPct > 0;
    if (tradeFilter === "loss") return t.pnlPct <= 0;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-7 w-7 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold">Strategy Backtester</h1>
          <p className="text-sm text-muted-foreground">
            Test entry/exit rules against 5 years of stored OHLCV data
          </p>
        </div>
      </div>

      {!hasData && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-600">No price data found</p>
            <p className="text-xs text-muted-foreground">
              Go to <strong>Data &amp; Settings → Historical Data</strong> and run the download first.
            </p>
          </div>
        </div>
      )}
      {hasData && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/30 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-700">
            <strong>{Number(readiness.tickersWithData).toLocaleString()}</strong> tickers ·{" "}
            <strong>{Number(readiness.totalBars).toLocaleString()}</strong> bars ·{" "}
            {readiness.oldestDate} → {readiness.newestDate}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategy</Label>
              <div className="space-y-2">
                {(Object.entries(STRATEGY_META) as [Strategy, { label: string; desc: string }][]).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => setStrategy(key)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      strategy === key ? "border-green-500 bg-green-500/10" : "border-border hover:border-green-500/50"
                    }`}
                  >
                    <div className={`text-sm font-semibold ${strategy === key ? "text-green-600" : ""}`}>{meta.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{meta.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {strategy === "dux_5filter" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Min Gap % <span className="text-green-500 font-bold">{minGapPct}%</span></Label>
                  <Slider value={[minGapPct]} min={2} max={30} step={1} onValueChange={([v]) => setMinGapPct(v)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Vol Multiplier <span className="text-green-500 font-bold">{minVolMultiplier}×</span></Label>
                  <Slider value={[minVolMultiplier]} min={1} max={5} step={0.5} onValueChange={([v]) => setMinVolMultiplier(v)} />
                </div>
              </div>
            )}
            {strategy === "velez_pullback" && (
              <div className="space-y-2">
                <Label className="text-xs">EMA Period <span className="text-green-500 font-bold">{emaPeriod}</span></Label>
                <Slider value={[emaPeriod]} min={5} max={50} step={5} onValueChange={([v]) => setEmaPeriod(v)} />
              </div>
            )}

            <div className="space-y-4 pt-2 border-t">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exit Rules</Label>
              <div className="space-y-2">
                <Label className="text-xs">Profit Target <span className="text-green-500 font-bold">{profitTargetPct}%</span></Label>
                <Slider value={[profitTargetPct]} min={2} max={50} step={1} onValueChange={([v]) => setProfitTargetPct(v)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Stop Loss <span className="text-red-500 font-bold">{stopLossPct}%</span></Label>
                <Slider value={[stopLossPct]} min={1} max={25} step={0.5} onValueChange={([v]) => setStopLossPct(v)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Hold Days <span className="text-blue-500 font-bold">{maxHoldDays}d</span></Label>
                <Slider value={[maxHoldDays]} min={1} max={30} step={1} onValueChange={([v]) => setMaxHoldDays(v)} />
              </div>
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => runMutation.mutate({ strategy, minGapPct, minVolMultiplier, emaPeriod, profitTargetPct, stopLossPct, maxHoldDays })}
              disabled={runMutation.isPending || !hasData}
            >
              {runMutation.isPending ? "Running…" : "Run Backtest"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !runMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed text-muted-foreground gap-2">
              <FlaskConical className="h-10 w-10 opacity-30" />
              <p className="text-sm">Configure parameters and click Run Backtest</p>
            </div>
          )}
          {runMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed gap-3">
              <div className="h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Scanning all tickers…</p>
            </div>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                  <div className={`text-2xl font-bold ${result.winRate >= 50 ? "text-green-500" : "text-red-500"}`}>{result.winRate}%</div>
                  <div className="text-xs text-muted-foreground">{result.wins}W / {result.losses}L</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Profit Factor</div>
                  <div className={`text-2xl font-bold ${result.profitFactor >= 1.5 ? "text-green-500" : result.profitFactor >= 1 ? "text-amber-500" : "text-red-500"}`}>{result.profitFactor}</div>
                  <div className="text-xs text-muted-foreground">Gross W / Gross L</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total Return</div>
                  <div className={`text-2xl font-bold ${result.totalReturnPct >= 0 ? "text-green-500" : "text-red-500"}`}>{result.totalReturnPct > 0 ? "+" : ""}{result.totalReturnPct}%</div>
                  <div className="text-xs text-muted-foreground">$10k starting equity</div>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-500">-{result.maxDrawdownPct}%</div>
                  <div className="text-xs text-muted-foreground">{result.totalTrades} trades</div>
                </CardContent></Card>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card><CardContent className="p-3 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <div><div className="text-xs text-muted-foreground">Avg Win</div><div className="text-lg font-bold text-green-500">+{result.avgWinPct}%</div></div>
                </CardContent></Card>
                <Card><CardContent className="p-3 flex items-center gap-3">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  <div><div className="text-xs text-muted-foreground">Avg Loss</div><div className="text-lg font-bold text-red-500">{result.avgLossPct}%</div></div>
                </CardContent></Card>
              </div>

              <Tabs defaultValue="equity">
                <TabsList>
                  <TabsTrigger value="equity">Equity Curve</TabsTrigger>
                  <TabsTrigger value="trades">Trades ({result.totalTrades})</TabsTrigger>
                  <TabsTrigger value="tickers">By Ticker</TabsTrigger>
                </TabsList>

                <TabsContent value="equity">
                  <Card><CardContent className="p-4">
                    {result.equityCurve.length > 1 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={result.equityCurve}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(0, 7)} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} domain={["auto", "auto"]} />
                          <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Equity"]} labelFormatter={(l: string) => `Date: ${l}`} />
                          <Line type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Not enough trades to draw equity curve</div>
                    )}
                  </CardContent></Card>
                </TabsContent>

                <TabsContent value="trades">
                  <Card><CardContent className="p-0">
                    <div className="flex gap-2 p-3 border-b">
                      {(["all", "win", "loss"] as const).map(f => (
                        <Button key={f} size="sm" variant={tradeFilter === f ? "default" : "outline"}
                          onClick={() => setTradeFilter(f)}
                          className={tradeFilter === f ? "bg-green-600 hover:bg-green-700 text-white" : ""}>
                          {f === "all" ? `All (${result.totalTrades})` : f === "win" ? `Wins (${result.wins})` : `Losses (${result.losses})`}
                        </Button>
                      ))}
                    </div>
                    <div className="overflow-auto max-h-80">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80">
                          <tr>
                            <th className="text-left p-2">Ticker</th>
                            <th className="text-left p-2">Entry</th>
                            <th className="text-left p-2">Exit</th>
                            <th className="text-right p-2">Entry $</th>
                            <th className="text-right p-2">Exit $</th>
                            <th className="text-right p-2">P&L %</th>
                            <th className="text-left p-2">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTrades.slice(0, 200).map((t: any, i: number) => (
                            <tr key={i} className="border-t hover:bg-muted/40">
                              <td className="p-2 font-mono font-bold">{t.ticker}</td>
                              <td className="p-2 text-muted-foreground">{t.entryDate}</td>
                              <td className="p-2 text-muted-foreground">{t.exitDate}</td>
                              <td className="p-2 text-right">${t.entryPrice}</td>
                              <td className="p-2 text-right">${t.exitPrice}</td>
                              <td className={`p-2 text-right font-bold ${t.pnlPct > 0 ? "text-green-500" : "text-red-500"}`}>
                                {t.pnlPct > 0 ? "+" : ""}{t.pnlPct}%
                              </td>
                              <td className="p-2">
                                <Badge variant="outline" className={`text-xs ${
                                  t.exitReason === "target" ? "border-green-500 text-green-600" :
                                  t.exitReason === "stop" ? "border-red-500 text-red-600" : "border-blue-500 text-blue-600"
                                }`}>
                                  {t.exitReason === "target" ? "🎯 Target" : t.exitReason === "stop" ? "🛑 Stop" : t.exitReason === "time" ? "⏱ Time" : "📋 EOD"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredTrades.length > 200 && (
                        <p className="text-xs text-center text-muted-foreground p-2">Showing 200 of {filteredTrades.length} trades</p>
                      )}
                    </div>
                  </CardContent></Card>
                </TabsContent>

                <TabsContent value="tickers">
                  <Card><CardContent className="p-0">
                    <div className="overflow-auto max-h-80">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80">
                          <tr>
                            <th className="text-left p-2">Ticker</th>
                            <th className="text-right p-2">Trades</th>
                            <th className="text-right p-2">Win Rate</th>
                            <th className="p-2">Bar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.tickerBreakdown.map((t: any, i: number) => (
                            <tr key={i} className="border-t hover:bg-muted/40">
                              <td className="p-2 font-mono font-bold">{t.ticker}</td>
                              <td className="p-2 text-right">{t.trades}</td>
                              <td className={`p-2 text-right font-bold ${t.winRate >= 50 ? "text-green-500" : "text-red-500"}`}>{t.winRate}%</td>
                              <td className="p-2 w-24">
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${t.winRate >= 50 ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${t.winRate}%` }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent></Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
