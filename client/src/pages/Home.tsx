import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, BarChart2, LineChart, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useLocation } from "wouter";

const quickLinks = [
  { icon: LineChart, label: "Velez Scanner", desc: "Daily & intraday Fib signals", path: "/velez-scanner", color: "text-blue-500", bg: "bg-blue-50" },
  { icon: Sparkles, label: "Fib+EMA Alerts", desc: "Confluence zone scanner", path: "/fib-ema-alerts", color: "text-green-600", bg: "bg-green-50" },
  { icon: Zap, label: "Trade Log", desc: "Log trades with Fib targets", path: "/trade-log", color: "text-orange-500", bg: "bg-orange-50" },
  { icon: BarChart2, label: "PCR Dashboard", desc: "Put/Call ratio for 60 tickers", path: "/pcr-dashboard", color: "text-purple-500", bg: "bg-purple-50" },
  { icon: Activity, label: "Options Analyzer", desc: "13 strategies, Black-Scholes", path: "/analyzer", color: "text-cyan-500", bg: "bg-cyan-50" },
  { icon: AlertTriangle, label: "IVR Alerts", desc: "IV rank alerts", path: "/ivr-alerts", color: "text-red-500", bg: "bg-red-50" },
];

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const firstName = user?.name?.split(" ")[0] ?? "Sridhar";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center shadow-md">
          <TrendingUp className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good morning, {firstName} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            PitDesk — Your personal trading intelligence platform
          </p>
        </div>
      </div>

      {/* Fibonacci Suite highlight */}
      <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-green-700">
            <Sparkles className="h-4 w-4" />
            Fibonacci Suite — Now Live
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <div>
                <div className="font-medium text-foreground">Fib Retracement Overlay</div>
                <div className="text-muted-foreground text-xs">23.6%, 38.2%, 50%, 61.8%, 78.6% on Velez Scanner</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <div>
                <div className="font-medium text-foreground">Extension Profit Targets</div>
                <div className="text-muted-foreground text-xs">127.2%, 161.8%, 261.8% in Scanner + Trade Log</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <div>
                <div className="font-medium text-foreground">Fib+EMA Confluence Alerts</div>
                <div className="text-muted-foreground text-xs">Scan 60 PCR tickers for high-probability zones</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick links grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-green-300 transition-all text-left group"
            >
              <div className={`w-9 h-9 rounded-lg ${link.bg} flex items-center justify-center shrink-0`}>
                <link.icon className={`h-4 w-4 ${link.color}`} />
              </div>
              <div>
                <div className="font-medium text-sm text-foreground group-hover:text-green-700 transition-colors">
                  {link.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{link.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Fibonacci education card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Fibonacci Trading Rules (Your Strategy)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="font-medium text-foreground">Retracement Entry Rules</div>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• Confirm trend using EMA (price above 50 EMA = uptrend)</li>
                <li>• Wait for pullback to 38.2%–61.8% Fib zone</li>
                <li>• Confirm bounce when price reclaims EMA at Fib level</li>
                <li>• Enter with stop below the Fib level</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-foreground">Extension Profit Targets</div>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• <span className="text-blue-600 font-medium">T1: 127.2%</span> — First profit target, partial exit</li>
                <li>• <span className="text-green-600 font-medium">T2: 161.8%</span> — Primary target, golden ratio</li>
                <li>• <span className="text-purple-600 font-medium">T3: 261.8%</span> — Aggressive target, strong trends</li>
                <li>• Move stop to breakeven after T1 is hit</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
