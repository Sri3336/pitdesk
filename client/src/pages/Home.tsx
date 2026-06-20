import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, BarChart2, LineChart, Radio, Sparkles, Target, TrendingUp, Zap } from "lucide-react";
import { useLocation } from "wouter";

const quickLinks = [
  { icon: Radio,         label: "PCR Signal Board",        desc: "COI heat map + intraday scan",      path: "/pcr-strategy",          color: "text-purple-600", bg: "bg-purple-50" },
  { icon: LineChart,     label: "Velez Scanner",            desc: "Daily & intraday Fib signals",      path: "/velez-scanner",         color: "text-blue-500",   bg: "bg-blue-50"   },
  { icon: Target,        label: "Opening Range Scalper",    desc: "ATR gate + reversal patterns",      path: "/velez-scanner?tab=ors", color: "text-orange-500", bg: "bg-orange-50" },
  { icon: Sparkles,      label: "VCP Strategy",             desc: "Volatility contraction patterns",   path: "/vcp-strategy",          color: "text-green-600",  bg: "bg-green-50"  },
  { icon: Activity,      label: "Options Analyzer",         desc: "13 strategies, Black-Scholes",      path: "/analyzer",              color: "text-cyan-500",   bg: "bg-cyan-50"   },
  { icon: Zap,           label: "Trade Log",                desc: "Log & journal every trade",         path: "/trade-log",             color: "text-amber-500",  bg: "bg-amber-50"  },
  { icon: BarChart2,     label: "Catalyst Watch",           desc: "BCOS breakout setups",              path: "/catalyst-watch",        color: "text-rose-500",   bg: "bg-rose-50"   },
  { icon: AlertTriangle, label: "IVR Alerts",               desc: "IV rank threshold alerts",          path: "/ivr-alerts",            color: "text-red-500",    bg: "bg-red-50"    },
];

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const firstName = user?.name?.split(" ")[0] ?? "Sridhar";

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center shadow-md">
          <TrendingUp className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            PitDesk — Your personal trading intelligence platform
          </p>
        </div>
      </div>

      {/* Opening Range Scalper highlight */}
      <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-orange-700">
            <Target className="h-4 w-4" />
            Opening Range Scalper — Now Live
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-orange-500 font-bold mt-0.5">✓</span>
              <div>
                <div className="font-medium text-foreground">ATR Gate Filter</div>
                <div className="text-muted-foreground text-xs">First 15-min candle ≥ 25% of Daily ATR-14 required</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 font-bold mt-0.5">✓</span>
              <div>
                <div className="font-medium text-foreground">Opening Range Box</div>
                <div className="text-muted-foreground text-xs">Breakout + reversal candle detection 9:30–11:00 AM ET</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 font-bold mt-0.5">✓</span>
              <div>
                <div className="font-medium text-foreground">One-Click Log Trade</div>
                <div className="text-muted-foreground text-xs">Pre-fills Trade Log with entry, stop, TP1, TP2</div>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      {/* Strategy quick-reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Your Strategy Rules at a Glance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="font-medium text-foreground">PCR Signal Zones</div>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• <span className="text-emerald-600 font-medium">PCR &gt; 1.5</span> — Extreme Fear → contrarian bullish (sell puts)</li>
                <li>• <span className="text-teal-600 font-medium">PCR 1.0–1.5</span> — Fear → bull put spread</li>
                <li>• <span className="text-slate-500 font-medium">PCR 0.7–1.0</span> — Neutral → iron condor</li>
                <li>• <span className="text-red-600 font-medium">PCR &lt; 0.7</span> — Greed/Extreme Greed → bear call spread</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-foreground">Opening Range Scalper Rules</div>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• First 15-min candle must be ≥ 25% of Daily ATR-14</li>
                <li>• Wait for price to break outside the opening range box</li>
                <li>• Enter on Hammer / Engulfing reversal back into box</li>
                <li>• TP1 = near box edge · TP2 = far box edge · 90-min limit</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
