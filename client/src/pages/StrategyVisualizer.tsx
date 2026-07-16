import { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Area, ComposedChart,
  BarChart, Bar, Cell, Legend,
} from "recharts";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Activity,
  BarChart2, BookOpen, ChevronDown, ChevronUp, Info,
  Target, Zap, DollarSign, Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Leg {
  id: string;
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  expiry: string;
  premium: number;
  iv: number;
  contracts: number;
}

const STRATEGY_TEMPLATES: Record<string, Leg[]> = {
  "Naked Put": [
    { id: "1", action: "sell", type: "put", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Naked Call": [
    { id: "1", action: "sell", type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Short Strangle": [
    { id: "1", action: "sell", type: "put",  strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "2", action: "sell", type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Iron Condor": [
    { id: "1", action: "buy",  type: "put",  strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "2", action: "sell", type: "put",  strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "3", action: "sell", type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "4", action: "buy",  type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Bull Put Spread": [
    { id: "1", action: "buy",  type: "put", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "2", action: "sell", type: "put", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Bear Call Spread": [
    { id: "1", action: "sell", type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "2", action: "buy",  type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Long Straddle": [
    { id: "1", action: "buy", type: "put",  strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
    { id: "2", action: "buy", type: "call", strike: 0, expiry: "", premium: 0, iv: 0.30, contracts: 1 },
  ],
  "Custom": [],
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function fmt$(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (n < 0 ? "-$" : "$") + s;
}

// ─── Payoff Chart ─────────────────────────────────────────────────────────────

interface PayoffChartProps {
  curve: { price: number; pnlNow: number; pnlExpiry: number }[];
  currentPrice: number;
  breakevens: number[];
}

function PayoffChart({ curve, currentPrice, breakevens }: PayoffChartProps) {
  const [hovered, setHovered] = useState<{ price: number; pnlNow: number; pnlExpiry: number } | null>(null);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xl text-xs">
        <div className="font-bold text-gray-900 mb-1">${Number(label).toFixed(2)}</div>
        <div className={cn("font-semibold", d.pnlExpiry >= 0 ? "text-green-400" : "text-red-400")}>
          Expiry P&L: {fmt$(d.pnlExpiry, 2)}
        </div>
        <div className={cn("text-gray-600", d.pnlNow >= 0 ? "text-green-600" : "text-red-600")}>
          Today P&L: {fmt$(d.pnlNow, 2)}
        </div>
      </div>
    );
  };

  // Split curve into profit / loss zones for coloring
  const maxPnl = Math.max(...curve.map(c => Math.max(c.pnlExpiry, c.pnlNow)));
  const minPnl = Math.min(...curve.map(c => Math.min(c.pnlExpiry, c.pnlNow)));
  const yPad = (maxPnl - minPnl) * 0.1;

  return (
    <div className="w-full h-64 relative">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={curve} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.0} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="price"
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            domain={[minPnl - yPad, maxPnl + yPad]}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1.5} />
          <ReferenceLine
            x={currentPrice}
            stroke="#facc15"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            label={{ value: `$${currentPrice}`, fill: "#facc15", fontSize: 10, position: "top" }}
          />
          {breakevens.map((bv, i) => (
            <ReferenceLine
              key={i}
              x={bv}
              stroke="#9ca3af"
              strokeWidth={1}
              strokeDasharray="2 2"
              label={{ value: `BE $${bv.toFixed(0)}`, fill: "#94a3b8", fontSize: 9, position: "insideTopRight" }}
            />
          ))}
          {/* Profit zone fill */}
          <Area
            type="monotone"
            dataKey="pnlExpiry"
            stroke="none"
            fill="url(#profitGrad)"
            fillOpacity={1}
            isAnimationActive={false}
          />
          {/* Expiry line */}
          <Line
            type="monotone"
            dataKey="pnlExpiry"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {/* Today line */}
          <Line
            type="monotone"
            dataKey="pnlNow"
            stroke="#60a5fa"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="absolute top-2 right-4 flex gap-3 text-xs">
        <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-green-400 inline-block" /> Expiry</span>
        <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-blue-400 inline-block border-dashed" style={{ borderTop: "2px dashed #60a5fa", height: 0 }} /> Today</span>
      </div>
    </div>
  );
}

// ─── Leg Row ──────────────────────────────────────────────────────────────────

function LegRow({ leg, onChange, onRemove }: {
  leg: Leg;
  onChange: (updated: Leg) => void;
  onRemove: () => void;
}) {
  const update = (field: keyof Leg, value: any) => onChange({ ...leg, [field]: value });

  return (
    <div className="grid grid-cols-[80px_70px_80px_90px_90px_70px_50px_32px] gap-1.5 items-center text-xs">
      <Select value={leg.action} onValueChange={v => update("action", v)}>
        <SelectTrigger className={cn("h-7 text-xs", leg.action === "sell" ? "text-red-400 border-red-900" : "text-green-400 border-green-900")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sell">Sell</SelectItem>
          <SelectItem value="buy">Buy</SelectItem>
        </SelectContent>
      </Select>
      <Select value={leg.type} onValueChange={v => update("type", v)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="put">Put</SelectItem>
          <SelectItem value="call">Call</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number"
        value={leg.strike || ""}
        onChange={e => update("strike", Number(e.target.value))}
        placeholder="Strike"
        className="h-7 text-xs px-2"
      />
      <Input
        type="date"
        value={leg.expiry}
        onChange={e => update("expiry", e.target.value)}
        className="h-7 text-xs px-2"
      />
      <Input
        type="number"
        step="0.01"
        value={leg.premium || ""}
        onChange={e => update("premium", Number(e.target.value))}
        placeholder="Premium"
        className="h-7 text-xs px-2"
      />
      <Input
        type="number"
        step="0.01"
        value={Math.round(leg.iv * 100) || ""}
        onChange={e => update("iv", Number(e.target.value) / 100)}
        placeholder="IV%"
        className="h-7 text-xs px-2"
      />
      <Input
        type="number"
        value={leg.contracts}
        onChange={e => update("contracts", Math.max(1, Number(e.target.value)))}
        className="h-7 text-xs px-2"
      />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── Greeks Bar ───────────────────────────────────────────────────────────────

function GreeksBar({ greeks }: { greeks: { delta: number; gamma: number; theta: number; vega: number; rho: number } }) {
  const items = [
    { label: "Delta", value: greeks.delta.toFixed(3), color: greeks.delta > 0 ? "text-green-400" : "text-red-400" },
    { label: "Gamma", value: greeks.gamma.toFixed(4), color: "text-blue-400" },
    { label: "Theta", value: greeks.theta.toFixed(2), color: greeks.theta < 0 ? "text-red-400" : "text-green-400" },
    { label: "Vega",  value: greeks.vega.toFixed(2),  color: "text-purple-400" },
    { label: "Rho",   value: greeks.rho.toFixed(2),   color: "text-gray-400" },
  ];
  return (
    <div className="flex gap-4 flex-wrap">
      {items.map(({ label, value, color }) => (
        <div key={label} className="text-center">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
          <div className={cn("text-sm font-bold font-mono", color)}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Performance Explorer ─────────────────────────────────────────────────────

function PerformanceExplorer() {
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [tickerFilter, setTickerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  const { data: filterOpts } = trpc.strategyVisualizer.getFilterOptions.useQuery();
  const { data: stats } = trpc.strategyVisualizer.getSetupStats.useQuery();
  const { data: trades, isLoading } = trpc.strategyVisualizer.getTradeHistory.useQuery({
    strategyType: strategyFilter !== "all" ? strategyFilter : undefined,
    ticker:       tickerFilter   !== "all" ? tickerFilter   : undefined,
    status:       statusFilter,
    limit: 100,
  });

  const outcomeColor = (outcome: string) => {
    if (outcome === "win")  return "text-green-400";
    if (outcome === "loss") return "text-red-400";
    if (outcome === "open") return "text-yellow-400";
    return "text-gray-400";
  };

  const outcomeBg = (outcome: string) => {
    if (outcome === "win")  return "bg-green-500/10 border-green-500/30";
    if (outcome === "loss") return "bg-red-500/10 border-red-500/30";
    if (outcome === "open") return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-gray-500/10 border-gray-500/30";
  };

  // Chart data for strategy stats
  const statsChartData = (stats || []).map((s: NonNullable<typeof stats>[number]) => ({
    name: s.strategy.replace(" ", "\n"),
    winRate: s.winRate,
    avgPnl: s.avgPnl,
    trades: s.trades,
    profitFactor: s.grossLosses > 0 ? Math.round((s.grossWins / s.grossLosses) * 100) / 100 : s.grossWins > 0 ? 99 : 0,
  }));

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Strategy Stats Cards */}
      {stats && stats.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Setup Performance by Strategy</div>
          <div className="grid grid-cols-2 gap-2">
            {stats.slice(0, 6).map(s => (
              <div key={s.strategy} className={cn("rounded-lg border p-2.5 text-xs", s.totalPnl >= 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20")}>
                <div className="font-semibold text-gray-900 truncate">{s.strategy}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-400">{s.trades} trades</span>
                  <span className={s.winRate >= 50 ? "text-green-400" : "text-red-400"}>{s.winRate}% WR</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-gray-500">Avg P&L</span>
                  <span className={s.avgPnl >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>{fmt$(s.avgPnl)}</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-gray-500">Total</span>
                  <span className={s.totalPnl >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>{fmt$(s.totalPnl)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Win Rate Chart */}
      {statsChartData.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Win Rate by Strategy</div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsChartData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#374151" }} interval={0} angle={-20} textAnchor="end" />
                <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#374151" }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(v: any, name: string) => [name === "winRate" ? `${v}%` : fmt$(v), name === "winRate" ? "Win Rate" : "Avg P&L"]}
                  contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: "#111827" }}
                />
                <ReferenceLine y={50} stroke="#d1d5db" strokeDasharray="3 3" />
                <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                  {statsChartData.map((entry: { name: string; winRate: number; avgPnl: number; trades: number; profitFactor: number }, i: number) => (
                    <Cell key={i} fill={entry.winRate >= 50 ? "#22c55e" : "#ef4444"} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={strategyFilter} onValueChange={setStrategyFilter}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="All Strategies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Strategies</SelectItem>
            {(filterOpts?.strategies || []).map((s: string) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tickerFilter} onValueChange={setTickerFilter}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue placeholder="All Tickers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickers</SelectItem>
            {(filterOpts?.tickers || []).map((t: string) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="h-7 text-xs w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trade List */}
      <div className="flex-1 min-h-0">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Trade History {trades ? `(${trades.length})` : ""}
        </div>
        {isLoading ? (
          <div className="text-gray-500 text-xs text-center py-8">Loading trades...</div>
        ) : !trades?.length ? (
          <div className="text-gray-500 text-xs text-center py-8">
            No trades found. Log trades in the Trade Log to see performance here.
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="flex flex-col gap-1.5 pr-2">
              {trades.map(t => (
                <div key={t.id} className={cn("rounded-lg border px-3 py-2 text-xs", outcomeBg(t.outcome))}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-gray-900">{t.ticker}</span>
                      <span className="text-gray-400 ml-2">{t.strategyType || "—"}</span>
                      {t.expiryDate && <span className="text-gray-500 ml-2">exp {t.expiryDate}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", outcomeColor(t.outcome))}>
                        {t.outcome.toUpperCase()}
                      </Badge>
                      {t.realizedPnl != null && (
                        <span className={cn("font-mono font-bold", t.realizedPnl >= 0 ? "text-green-400" : "text-red-400")}>
                          {fmt$(t.realizedPnl)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1 text-gray-500">
                    {t.entryDate && <span>Entry: {t.entryDate}</span>}
                    {t.exitDate  && <span>Exit: {t.exitDate}</span>}
                    {t.entryPrice != null && <span>@ {fmt$(t.entryPrice, 2)}</span>}
                    {t.pnlPct != null && (
                      <span className={t.pnlPct >= 0 ? "text-green-400" : "text-red-400"}>
                        {t.pnlPct > 0 ? "+" : ""}{t.pnlPct}% of risk
                      </span>
                    )}
                  </div>
                  {t.postTradeNotes && (
                    <div className="mt-1 text-gray-500 italic truncate">{t.postTradeNotes}</div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StrategyVisualizer() {
  const [legs, setLegs] = useState<Leg[]>([
    { id: "1", action: "sell", type: "put", strike: 580, expiry: todayPlus(30), premium: 5.50, iv: 0.28, contracts: 1 },
  ]);
  const [currentPrice, setCurrentPrice] = useState(620);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [ivShift, setIvShift] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState("Naked Put");
  const [showLearnMore, setShowLearnMore] = useState(false);

  // Compute max DTE from legs
  const maxDte = useMemo(() => {
    if (!legs.length) return 45;
    const now = new Date();
    return Math.max(...legs.map(l => {
      if (!l.expiry) return 45;
      const exp = new Date(l.expiry + "T16:00:00");
      return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }));
  }, [legs]);

  // Clamp daysElapsed to maxDte
  const clampedDays = Math.min(daysElapsed, maxDte);

  const validLegs = legs.filter(l => l.strike > 0 && l.expiry && l.premium > 0 && l.iv > 0);

  const { data: payoff } = trpc.strategyVisualizer.computePayoff.useQuery(
    {
      legs: validLegs,
      currentPrice,
      daysElapsed: clampedDays,
      ivShift,
    },
    { enabled: validLegs.length > 0 }
  );

  const applyTemplate = (name: string) => {
    setSelectedTemplate(name);
    const template = STRATEGY_TEMPLATES[name];
    if (!template) return;
    const expiry = todayPlus(30);
    setLegs(template.map((l, i) => ({ ...l, id: String(i + 1), expiry })));
  };

  const addLeg = () => {
    setLegs(prev => [...prev, {
      id: String(Date.now()),
      action: "sell", type: "put",
      strike: currentPrice * 0.95,
      expiry: todayPlus(30),
      premium: 2.00, iv: 0.30, contracts: 1,
    }]);
  };

  const updateLeg = useCallback((id: string, updated: Leg) => {
    setLegs(prev => prev.map(l => l.id === id ? updated : l));
  }, []);

  const removeLeg = useCallback((id: string) => {
    setLegs(prev => prev.filter(l => l.id !== id));
  }, []);

  const netCredit = payoff?.netCredit ?? 0;
  const isCredit = netCredit > 0;

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-4 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-400" />
            Strategy Visualizer
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Build any options strategy, visualize P&L, and compare against your trade history</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 text-xs"
          onClick={() => setShowLearnMore(v => !v)}
        >
          <Info className="h-3.5 w-3.5 mr-1" />
          How to use
          {showLearnMore ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>
      </div>

      {showLearnMore && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-400 flex-shrink-0">
          <strong className="text-gray-900">How to use:</strong> Enter your option legs below (strike, expiry, premium, IV). The payoff chart updates in real-time.
          Use the <strong className="text-yellow-400">Time slider</strong> to simulate theta decay — drag right to see how your position looks as days pass.
          Use the <strong className="text-purple-400">IV slider</strong> to simulate IV crush (drag left) or IV expansion (drag right).
          The <strong className="text-green-400">green line</strong> shows P&L at expiration. The <strong className="text-blue-400">blue dashed line</strong> shows P&L today with current IV.
        </div>
      )}

      {/* Main layout: left = builder, right = explorer */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Strategy Builder ── */}
        <div className="flex flex-col gap-3 w-[55%] min-w-0 overflow-y-auto">

          {/* Template picker */}
          <Card className="bg-white border-gray-200 flex-shrink-0">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm text-gray-900 flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                Strategy Template
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(STRATEGY_TEMPLATES).map(name => (
                  <button
                    key={name}
                    onClick={() => applyTemplate(name)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                      selectedTemplate === name
                        ? "bg-green-500/20 border-green-500/50 text-green-400"
                        : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Underlying price */}
          <Card className="bg-white border-gray-200 flex-shrink-0">
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-gray-400">Underlying Price ($)</Label>
                  <Input
                    type="number"
                    value={currentPrice}
                    onChange={e => setCurrentPrice(Number(e.target.value))}
                    className="h-8 mt-1 text-sm font-mono"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-gray-400">Account Size (for sizing)</Label>
                  <Input type="number" defaultValue={100000} className="h-8 mt-1 text-sm font-mono" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legs */}
          <Card className="bg-white border-gray-200 flex-shrink-0">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-900">Option Legs</CardTitle>
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={addLeg}>
                  <Plus className="h-3 w-3" /> Add Leg
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {/* Column headers */}
              <div className="grid grid-cols-[80px_70px_80px_90px_90px_70px_50px_32px] gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
                <span>Action</span><span>Type</span><span>Strike</span>
                <span>Expiry</span><span>Premium</span><span>IV %</span>
                <span>Qty</span><span></span>
              </div>
              <div className="flex flex-col gap-1.5">
                {legs.map(leg => (
                  <LegRow
                    key={leg.id}
                    leg={leg}
                    onChange={updated => updateLeg(leg.id, updated)}
                    onRemove={() => removeLeg(leg.id)}
                  />
                ))}
              </div>
              {legs.length === 0 && (
                <div className="text-center text-gray-500 text-xs py-4">
                  No legs. Pick a template above or click Add Leg.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary metrics */}
          {payoff && (
            <Card className="bg-white border-gray-200 flex-shrink-0">
              <CardContent className="px-4 py-3">
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Net {isCredit ? "Credit" : "Debit"}</div>
                    <div className={cn("text-base font-bold font-mono", isCredit ? "text-green-400" : "text-red-400")}>
                      {fmt$(Math.abs(netCredit), 2)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Max Profit</div>
                    <div className="text-base font-bold font-mono text-green-400">
                      {payoff.maxProfit > 50000 ? "Unlimited" : fmt$(payoff.maxProfit)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Max Loss</div>
                    <div className="text-base font-bold font-mono text-red-400">
                      {payoff.maxLoss < -50000 ? "Unlimited" : fmt$(payoff.maxLoss)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Prob. Profit</div>
                    <div className={cn("text-base font-bold font-mono", payoff.pop >= 60 ? "text-green-400" : payoff.pop >= 40 ? "text-yellow-400" : "text-red-400")}>
                      {payoff.pop}%
                    </div>
                  </div>
                </div>
                {payoff.breakevens.length > 0 && (
                  <div className="text-xs text-gray-400">
                    Breakeven{payoff.breakevens.length > 1 ? "s" : ""}: {payoff.breakevens.map(b => `$${b.toFixed(2)}`).join(" / ")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Payoff Chart */}
          <Card className="bg-white border-gray-200 flex-shrink-0">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm text-gray-900 flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-green-400" />
                Payoff Diagram
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {payoff?.curve ? (
                <PayoffChart
                  curve={payoff.curve}
                  currentPrice={currentPrice}
                  breakevens={payoff.breakevens}
                />
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 text-xs">
                  Fill in at least one leg to see the payoff diagram
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sliders */}
          <Card className="bg-white border-gray-200 flex-shrink-0">
            <CardContent className="px-4 py-3 flex flex-col gap-4">
              {/* Time slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    Time Decay — Days Elapsed
                  </Label>
                  <span className="text-xs font-mono text-yellow-400">
                    Day {clampedDays} of {maxDte} ({maxDte - clampedDays} DTE remaining)
                  </span>
                </div>
                <Slider
                  value={[clampedDays]}
                  onValueChange={([v]) => setDaysElapsed(v)}
                  min={0}
                  max={maxDte}
                  step={1}
                  className="[&_[role=slider]]:bg-yellow-400 [&_[role=slider]]:border-yellow-400"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>Entry (Day 0)</span>
                  <span>Expiration (Day {maxDte})</span>
                </div>
              </div>

              {/* IV slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-xs text-purple-400 font-semibold flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5" />
                    IV Shift
                  </Label>
                  <span className={cn("text-xs font-mono", ivShift > 0 ? "text-red-400" : ivShift < 0 ? "text-green-400" : "text-gray-400")}>
                    {ivShift > 0 ? "+" : ""}{Math.round(ivShift * 100)}% IV
                    {ivShift < 0 && " (IV Crush ✓)"}
                    {ivShift > 0 && " (IV Expansion ↑)"}
                  </span>
                </div>
                <Slider
                  value={[ivShift * 100]}
                  onValueChange={([v]) => setIvShift(v / 100)}
                  min={-30}
                  max={30}
                  step={1}
                  className="[&_[role=slider]]:bg-purple-400 [&_[role=slider]]:border-purple-400"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span className="text-green-400">-30% IV Crush</span>
                  <span className="text-gray-400">No change</span>
                  <span className="text-red-400">+30% IV Expansion</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Greeks */}
          {payoff?.greeks && (
            <Card className="bg-white border-gray-200 flex-shrink-0">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-gray-400 uppercase tracking-wide">Position Greeks</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <GreeksBar greeks={payoff.greeks} />
                {payoff.currentPnl !== 0 && (
                  <div className="mt-2 text-xs text-gray-400">
                    Current P&L (with sliders): <span className={cn("font-mono font-bold", payoff.currentPnl >= 0 ? "text-green-400" : "text-red-400")}>{fmt$(payoff.currentPnl, 2)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── RIGHT: Performance Explorer ── */}
        <div className="flex flex-col w-[45%] min-w-0 overflow-y-auto">
          <Card className="bg-white border-gray-200 flex-1 min-h-0">
            <CardHeader className="pb-2 pt-3 px-4 flex-shrink-0">
              <CardTitle className="text-sm text-gray-900 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-400" />
                Trade Setup Performance
              </CardTitle>
              <p className="text-[11px] text-gray-500">Your historical trades — see which setups actually work</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex-1 min-h-0 overflow-y-auto">
              <PerformanceExplorer />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
// light theme
