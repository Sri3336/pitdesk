import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";

const SCORING_DIMENSIONS = [
  {
    name: "POP (Probability of Profit)",
    max: 20,
    formula: "1 − |delta| (short leg)",
    desc: "Derived from the absolute delta of the short leg(s). A delta-0.30 short put implies ~70% POP. For defined-risk spreads, the short leg delta is used. Higher probability of expiring worthless earns a proportionally higher score.",
  },
  {
    name: "Liquidity",
    max: 20,
    formula: "Spread Score (0–10) + OI Score (0–10)",
    desc: "Composite of bid/ask spread tightness and open interest depth on the short leg(s). Tight spreads reduce slippage; high OI indicates active markets with reliable fills. For Iron Condor, only the short put and short call legs are evaluated to avoid dilution from the long wings.",
  },
  {
    name: "Risk Definition",
    max: 20,
    formula: "Fixed per strategy type",
    desc: "Iron Condor, Bull Put Spread, Bear Call Spread, Bull Call Spread, Bear Put Spread, Butterfly: 20 (max loss fully capped). Cash-Secured Put, Covered Call: 16 (defined via collateral). Short Strangle: 10. Naked Put: 6. Naked Call: 2 (unlimited upside risk). Long Straddle/Strangle: 14 (max loss = debit paid).",
  },
  {
    name: "Directional Fit",
    max: 20,
    formula: "Regime alignment score",
    desc: "Measures alignment between the strategy's directional exposure and the current market regime (price vs. SMA-20/50/200, MACD histogram, RSI-14). Bullish regime favors Naked Put, Bull Put Spread, Bull Call Spread, Cash-Secured Put, Covered Call. Bearish favors Naked Call, Bear Call Spread, Bear Put Spread. Neutral favors Iron Condor, Short Strangle, Butterfly. Long Straddle/Strangle score best when the regime is strongly directional (either way).",
  },
  {
    name: "IV/RV Ratio",
    max: 20,
    formula: "Scales 0→20 for IV/RV 0.8→1.8 (inverted for long-premium strategies)",
    desc: "Compares median chain implied volatility to 20-day realized volatility. A ratio above 1.0 means options are pricing in more vol than the stock has realized — the classic condition for selling premium. Credit strategies score higher when IV/RV is elevated. Debit strategies (Long Straddle, Long Strangle, Bull Call Spread, Bear Put Spread) score inversely — they prefer cheap IV.",
  },
  {
    name: "Theta Decay",
    max: 10,
    formula: "|net daily theta| × 50",
    desc: "Net daily theta of the position (short legs minus long legs). Higher net theta means faster time-value erosion in favor of the position. Credit strategies collect positive theta; debit strategies pay negative theta and score lower here.",
  },
  {
    name: "Vega Exposure",
    max: 10,
    formula: "10 − |net vega| × 5",
    desc: "Inverse net vega exposure. Lower net vega means the position is less sensitive to sudden IV expansions (vol spikes). Iron Condor's long wings reduce net vega vs. a naked strangle. Long-premium strategies have high positive vega and score lower here.",
  },
];

const STRATEGIES = [
  // ── Credit / Short Premium ─────────────────────────────────────────────────
  {
    name: "Naked Put",
    color: "#22c55e",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    category: "Credit",
    risk: "Defined (cash-secured) / Undefined (margin)",
    bias: "Bullish to Neutral",
    maxProfit: "Net credit received",
    maxLoss: "Strike − Credit (cash-secured) or very large (margin)",
    bestWhen: "IV/RV elevated, IVR ≥ 50%, market trending up or range-bound, RSI not overbought",
    avoid: "Strong bearish trend, IV crush expected, earnings approaching",
  },
  {
    name: "Cash-Secured Put",
    color: "#16a34a",
    badge: "bg-green-50 text-green-700 border-green-200",
    category: "Credit",
    risk: "Defined (collateral = strike × 100)",
    bias: "Bullish to Neutral",
    maxProfit: "Net credit received",
    maxLoss: "Strike − Credit (stock goes to zero)",
    bestWhen: "Willing to own the stock at the strike price, IV/RV elevated, IVR ≥ 40%",
    avoid: "Stocks you would not want to own, very low IV environments",
  },
  {
    name: "Covered Call",
    color: "#f97316",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    category: "Credit",
    risk: "Defined (own 100 shares as collateral)",
    bias: "Neutral to Mildly Bullish",
    maxProfit: "Credit + (Strike − Cost Basis) if called away",
    maxLoss: "Cost basis of shares − Credit (stock goes to zero)",
    bestWhen: "Already long the stock, neutral to slightly bullish outlook, IV elevated",
    avoid: "Strong bullish conviction (caps upside), very low IV (poor premium)",
  },
  {
    name: "Bull Put Spread",
    color: "#14b8a6",
    badge: "bg-teal-50 text-teal-700 border-teal-200",
    category: "Credit",
    risk: "Defined (spread width − credit)",
    bias: "Bullish to Neutral",
    maxProfit: "Net credit received",
    maxLoss: "Spread width − Net credit",
    bestWhen: "IV/RV elevated, IVR ≥ 40%, bullish bias, defined-risk preference",
    avoid: "Strong bearish trend, very low IV (poor credit-to-risk ratio)",
  },
  {
    name: "Bear Call Spread",
    color: "#f43f5e",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    category: "Credit",
    risk: "Defined (spread width − credit)",
    bias: "Bearish to Neutral",
    maxProfit: "Net credit received",
    maxLoss: "Spread width − Net credit",
    bestWhen: "IV/RV elevated, IVR ≥ 40%, bearish bias, defined-risk preference",
    avoid: "Strong bullish trend, breakout conditions, low IV",
  },
  {
    name: "Short Strangle",
    color: "#a855f7",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    category: "Credit",
    risk: "Undefined on both sides",
    bias: "Neutral",
    maxProfit: "Combined net credit",
    maxLoss: "Unlimited on both sides",
    bestWhen: "High IV/RV, IVR ≥ 50%, low directional conviction, stable macro environment",
    avoid: "Strong trending markets, upcoming catalysts, low-liquidity underlyings",
  },
  {
    name: "Iron Condor",
    color: "#f59e0b",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    category: "Credit",
    risk: "Defined (wing width − credit)",
    bias: "Neutral",
    maxProfit: "Net credit received",
    maxLoss: "Wing width − Net credit (per side)",
    bestWhen: "High IV/RV, IVR ≥ 50%, neutral bias, defined-risk preference, range-bound market",
    avoid: "Strong directional moves, very low IV environments (poor credit-to-risk ratio)",
  },
  {
    name: "Naked Call",
    color: "#ef4444",
    badge: "bg-red-50 text-red-700 border-red-200",
    category: "Credit",
    risk: "Unlimited (upside)",
    bias: "Bearish to Neutral",
    maxProfit: "Net credit received",
    maxLoss: "Theoretically unlimited",
    bestWhen: "IV/RV elevated, market trending down or range-bound, RSI overbought",
    avoid: "Bullish trend, low-float stocks, pre-earnings, momentum breakouts",
  },
  // ── Debit / Long Premium ───────────────────────────────────────────────────
  {
    name: "Bull Call Spread",
    color: "#3b82f6",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    category: "Debit",
    risk: "Defined (debit paid)",
    bias: "Bullish",
    maxProfit: "Spread width − Debit paid",
    maxLoss: "Debit paid",
    bestWhen: "Bullish bias, IV relatively low (cheap debit), 30–60 DTE",
    avoid: "Neutral or bearish market, high IV (expensive debit), very short DTE",
  },
  {
    name: "Bear Put Spread",
    color: "#ec4899",
    badge: "bg-pink-50 text-pink-700 border-pink-200",
    category: "Debit",
    risk: "Defined (debit paid)",
    bias: "Bearish",
    maxProfit: "Spread width − Debit paid",
    maxLoss: "Debit paid",
    bestWhen: "Bearish bias, IV relatively low, 30–60 DTE",
    avoid: "Bullish or neutral market, high IV, very short DTE",
  },
  {
    name: "Long Straddle",
    color: "#06b6d4",
    badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
    category: "Debit",
    risk: "Defined (total debit paid)",
    bias: "Non-directional (expects large move)",
    maxProfit: "Unlimited (either direction)",
    maxLoss: "Total debit paid",
    bestWhen: "Low IV/RV, IVR < 30%, expecting a large move (earnings, catalyst), 7–21 DTE",
    avoid: "High IV environments (expensive premium), range-bound markets",
  },
  {
    name: "Long Strangle",
    color: "#0ea5e9",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
    category: "Debit",
    risk: "Defined (total debit paid)",
    bias: "Non-directional (expects large move)",
    maxProfit: "Unlimited (either direction)",
    maxLoss: "Total debit paid",
    bestWhen: "Low IV/RV, IVR < 30%, expecting a very large move, 7–21 DTE, cheaper than straddle",
    avoid: "High IV environments, range-bound markets, very short DTE",
  },
  {
    name: "Butterfly Spread",
    color: "#8b5cf6",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    category: "Debit",
    risk: "Defined (net debit)",
    bias: "Neutral (expects stock to pin at middle strike)",
    maxProfit: "Wing width − Debit (if stock pins at middle strike at expiry)",
    maxLoss: "Net debit paid",
    bestWhen: "Low IV, neutral outlook, expecting stock to stay near current price, 7–21 DTE",
    avoid: "High IV, strong directional moves, wide bid/ask spreads",
  },
];

const CREDIT_STRATEGIES = STRATEGIES.filter(s => s.category === "Credit");
const DEBIT_STRATEGIES = STRATEGIES.filter(s => s.category === "Debit");

export default function Methodology() {
  return (
    <div className="min-h-screen p-6 max-w-[1100px] mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-gold">Scoring Methodology</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How the model evaluates and ranks all 13 strategies — scoring dimensions, assumptions, and limitations.
        </p>
      </div>

      {/* Scoring Overview */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Composite Scoring Framework (100 Points)
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Each strategy is scored across seven independent dimensions. The strategy with the highest
            composite score becomes the primary recommendation. Scores are computed at the time of analysis
            and reflect current market conditions. Credit strategies and debit strategies score inversely on
            IV/RV and theta dimensions — the model rewards each type in its optimal environment.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {SCORING_DIMENSIONS.map(d => (
            <div key={d.name} className="flex gap-4 p-4 rounded-lg bg-muted/20 border border-border/30">
              <div className="shrink-0 w-48">
                <p className="text-xs font-bold text-primary">{d.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Max: {d.max} pts</p>
                <code className="text-[10px] text-muted-foreground/70 font-mono">{d.formula}</code>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Credit Strategy Profiles */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            Credit / Short-Premium Strategies (8)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These strategies collect a net credit at entry. They profit when the underlying stays within a range or moves in the favoured direction. Best entered when IV/RV is elevated (IVR ≥ 40–50%).
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CREDIT_STRATEGIES.map(s => (
            <div key={s.name} className="p-4 rounded-lg bg-muted/20 border border-border/30" style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border mb-3 ${s.badge}`}>
                {s.name}
              </span>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["Risk Profile", s.risk],
                    ["Directional Bias", s.bias],
                    ["Max Profit", s.maxProfit],
                    ["Max Loss", s.maxLoss],
                    ["Best When", s.bestWhen],
                    ["Avoid When", s.avoid],
                  ].map(([label, value]) => (
                    <tr key={label} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 pr-3 text-muted-foreground font-medium w-24 align-top">{label}</td>
                      <td className="py-1.5 text-foreground/80 leading-relaxed">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Debit Strategy Profiles */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Debit / Long-Premium Strategies (5)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These strategies pay a net debit at entry. They profit from large moves (straddle/strangle) or directional moves (spreads). Best entered when IV/RV is low (IVR &lt; 30–40%) so premium is cheap.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEBIT_STRATEGIES.map(s => (
            <div key={s.name} className="p-4 rounded-lg bg-muted/20 border border-border/30" style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border mb-3 ${s.badge}`}>
                {s.name}
              </span>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["Risk Profile", s.risk],
                    ["Directional Bias", s.bias],
                    ["Max Profit", s.maxProfit],
                    ["Max Loss", s.maxLoss],
                    ["Best When", s.bestWhen],
                    ["Avoid When", s.avoid],
                  ].map(([label, value]) => (
                    <tr key={label} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 pr-3 text-muted-foreground font-medium w-24 align-top">{label}</td>
                      <td className="py-1.5 text-foreground/80 leading-relaxed">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* IVR Guidance */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Minus className="h-4 w-4 text-primary" />
            IV Percentile Rank (IVR) — Entry Timing Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {[
              { range: "IVR ≥ 50%", label: "Elevated IV", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", desc: "Premium is rich relative to the past year. Ideal for all credit/short-premium strategies. The IV/RV score will be high." },
              { range: "IVR 30–50%", label: "Moderate IV", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", desc: "IV is near its median. Credit strategies are viable but premium may be thin. Consider tighter strikes or shorter DTE." },
              { range: "IVR < 30%", label: "Cheap IV", color: "text-red-600", bg: "bg-red-50 border-red-200", desc: "Premium is historically cheap. Unfavourable for credit strategies. Debit strategies (Long Straddle, Bull Call Spread) score better in this environment." },
            ].map(item => (
              <div key={item.range} className={`p-3 rounded-lg border ${item.bg}`}>
                <p className={`font-bold text-sm ${item.color}`}>{item.range}</p>
                <p className={`font-semibold mb-1 ${item.color}`}>{item.label}</p>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model Assumptions */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Model Assumptions &amp; Limitations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
            {[
              ["Pricing Model", "Black-Scholes with constant volatility surface. Does not account for volatility smile or skew."],
              ["Risk-Free Rate", "Fixed at 4.5% annualized. Not dynamically adjusted to current Fed Funds rate."],
              ["Greeks", "Computed analytically from Black-Scholes at time of analysis. Not path-dependent."],
              ["POP Estimate", "Derived from delta (1 − |delta|). Not Monte Carlo simulation. Assumes log-normal returns."],
              ["Liquidity Score", "Uses reported bid/ask spread and open interest. Does not account for market impact or fill probability."],
              ["Dividends", "Not modeled. Dividend-paying stocks may have early assignment risk on short calls."],
              ["Commissions", "Not included in P&L calculations. Real-world returns will be lower."],
              ["Early Assignment", "Not modeled. American-style options carry early assignment risk, especially near ex-dividend dates."],
              ["IV Rank (IVR)", "Computed from 252-day rolling realized vol estimates as a proxy for historical IV. Approximation only."],
              ["Data Source", "Yahoo Finance. Data may be delayed. Always verify with your broker before trading."],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 p-3 rounded-lg bg-muted/20 border border-border/20">
                <span className="font-semibold text-foreground/70 shrink-0 w-32">{label}</span>
                <span className="leading-relaxed">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
