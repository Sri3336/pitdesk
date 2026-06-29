import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingDown, ShieldAlert, DollarSign } from "lucide-react";

function fmt(n: number, decimals = 2) {
  return isNaN(n) || !isFinite(n) ? "—" : n.toFixed(decimals);
}

export default function PositionSizer() {
  const [ticker, setTicker] = useState("AAPL");
  const [entryPrice, setEntryPrice] = useState(150);
  const [stopPrice, setStopPrice] = useState(142.5);
  const [accountSize, setAccountSize] = useState(50000);
  const [maxRiskPct, setMaxRiskPct] = useState(1.5);
  const [winRate, setWinRate] = useState(55);
  const [avgWinPct, setAvgWinPct] = useState(10);
  const [avgLossPct, setAvgLossPct] = useState(5);

  const calc = useMemo(() => {
    const riskPerShare = entryPrice - stopPrice;
    const riskPct = (riskPerShare / entryPrice) * 100;
    const maxDollarRisk = accountSize * (maxRiskPct / 100);
    const shares = riskPerShare > 0 ? Math.floor(maxDollarRisk / riskPerShare) : 0;
    const positionValue = shares * entryPrice;
    const positionPct = (positionValue / accountSize) * 100;
    const dollarRisk = shares * riskPerShare;
    const b = avgWinPct / avgLossPct;
    const p = winRate / 100;
    const q = 1 - p;
    const kelly = ((b * p - q) / b) * 100;
    const halfKelly = kelly / 2;
    const targetPrice = entryPrice + (entryPrice - stopPrice) * (avgWinPct / avgLossPct);
    const rrRatio = riskPerShare > 0 ? (targetPrice - entryPrice) / riskPerShare : 0;
    return { riskPerShare, riskPct, maxDollarRisk, shares, positionValue, positionPct, dollarRisk, kelly, halfKelly, targetPrice, rrRatio };
  }, [entryPrice, stopPrice, accountSize, maxRiskPct, winRate, avgWinPct, avgLossPct]);

  const riskColor = calc.riskPct > 10 ? "text-red-500" : calc.riskPct > 5 ? "text-amber-500" : "text-green-500";
  const posColor = calc.positionPct > 25 ? "text-red-500" : calc.positionPct > 15 ? "text-amber-500" : "text-green-500";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Calculator className="h-7 w-7 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold">Position Sizer</h1>
          <p className="text-sm text-muted-foreground">Calculate exact share count, dollar risk, and Kelly fraction before entering a trade</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Trade Setup</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Ticker</Label>
                <Input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="font-mono" placeholder="AAPL" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Entry Price ($)</Label>
                  <Input type="number" step="0.01" min="0" value={entryPrice} onChange={e => setEntryPrice(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Stop Price ($)</Label>
                  <Input type="number" step="0.01" min="0" value={stopPrice} onChange={e => setStopPrice(parseFloat(e.target.value) || 0)} className={stopPrice >= entryPrice ? "border-red-500" : ""} />
                </div>
              </div>
              {stopPrice >= entryPrice && <p className="text-xs text-red-500">⚠ Stop must be below entry price for a long trade</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Account & Risk</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Account Size ($)</Label>
                <Input type="number" step="1000" min="0" value={accountSize} onChange={e => setAccountSize(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Risk per Trade <span className="text-green-500 font-bold">{maxRiskPct}%</span></Label>
                <Slider value={[maxRiskPct]} min={0.25} max={5} step={0.25} onValueChange={([v]) => setMaxRiskPct(v)} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.25% conservative</span><span>2% standard</span><span>5% aggressive</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Kelly Criterion Inputs</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Historical Win Rate <span className="text-green-500 font-bold">{winRate}%</span></Label>
                <Slider value={[winRate]} min={20} max={80} step={1} onValueChange={([v]) => setWinRate(v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Avg Win <span className="text-green-500 font-bold">{avgWinPct}%</span></Label>
                  <Slider value={[avgWinPct]} min={1} max={50} step={1} onValueChange={([v]) => setAvgWinPct(v)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Avg Loss <span className="text-red-500 font-bold">{avgLossPct}%</span></Label>
                  <Slider value={[avgLossPct]} min={1} max={25} step={0.5} onValueChange={([v]) => setAvgLossPct(v)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-500" />Position Size for {ticker || "—"}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <div className="text-5xl font-bold text-green-500">{calc.shares.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">shares</div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Position Value</div>
                  <div className="text-lg font-bold">${calc.positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  <div className={`text-xs font-medium ${posColor}`}>{fmt(calc.positionPct)}% of account</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Dollar Risk</div>
                  <div className="text-lg font-bold text-red-500">${fmt(calc.dollarRisk)}</div>
                  <div className="text-xs text-muted-foreground">{maxRiskPct}% of account</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Risk Metrics</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Risk per share", value: `$${fmt(calc.riskPerShare)}`, color: "" },
                { label: "Stop distance", value: `${fmt(calc.riskPct)}%`, color: riskColor },
                { label: "Max dollar risk", value: `$${fmt(calc.maxDollarRisk)}`, color: "" },
                { label: "Implied target", value: `$${fmt(calc.targetPrice)}`, color: "text-green-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={`font-mono font-bold ${color}`}>{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">R:R ratio</span>
                <Badge variant="outline" className={calc.rrRatio >= 2 ? "border-green-500 text-green-600" : calc.rrRatio >= 1.5 ? "border-amber-500 text-amber-600" : "border-red-500 text-red-600"}>
                  {fmt(calc.rrRatio, 1)}:1
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Kelly Criterion</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <div>
                  <div className="text-sm font-medium">Full Kelly</div>
                  <div className="text-xs text-muted-foreground">Theoretically optimal — very aggressive</div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-lg ${calc.kelly > 0 ? "text-green-500" : "text-red-500"}`}>{calc.kelly > 0 ? fmt(calc.kelly) : "0"}%</div>
                  <div className="text-xs text-muted-foreground">{calc.kelly > 0 ? `$${fmt((accountSize * calc.kelly) / 100, 0)}` : "No edge"}</div>
                </div>
              </div>
              <div className="flex justify-between items-center py-2">
                <div>
                  <div className="text-sm font-medium">Half Kelly</div>
                  <div className="text-xs text-muted-foreground">Recommended — reduces drawdown significantly</div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-lg ${calc.halfKelly > 0 ? "text-blue-500" : "text-red-500"}`}>{calc.halfKelly > 0 ? fmt(calc.halfKelly) : "0"}%</div>
                  <div className="text-xs text-muted-foreground">{calc.halfKelly > 0 ? `$${fmt((accountSize * calc.halfKelly) / 100, 0)}` : "No edge"}</div>
                </div>
              </div>
              {calc.kelly <= 0 && (
                <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 text-red-600 text-xs">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  Kelly is negative — this setup has no mathematical edge with these parameters.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4">
              <p className="text-sm leading-relaxed">
                <strong>Summary:</strong> Buy <strong className="text-green-500">{calc.shares.toLocaleString()} shares</strong> of{" "}
                <strong>{ticker || "—"}</strong> at <strong>${fmt(entryPrice)}</strong>, stop at{" "}
                <strong className="text-red-500">${fmt(stopPrice)}</strong>. Max loss:{" "}
                <strong className="text-red-500">${fmt(calc.dollarRisk)}</strong> ({maxRiskPct}% of account).
                Position is <strong>{fmt(calc.positionPct)}%</strong> of your ${accountSize.toLocaleString()} account.
                {calc.kelly > 0
                  ? ` Kelly suggests ${fmt(calc.halfKelly)}% (half-Kelly) = $${fmt((accountSize * calc.halfKelly) / 100, 0)}.`
                  : " Kelly is negative — this setup has no statistical edge."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
