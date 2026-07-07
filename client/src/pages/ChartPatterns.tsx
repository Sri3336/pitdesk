/**
 * ChartPatterns.tsx — 6 Classic Topping Patterns Reference Library
 *
 * Educational page showing SVG diagrams + plain-English explanations
 * for the 6 most important topping patterns.
 * Includes a "Learn Mode" toggle for beginner-friendly explanations.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  BookOpen,
  GraduationCap,
  Search,
  RefreshCw,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ─── SVG Pattern Diagrams ─────────────────────────────────────────────────────

function HeadAndShouldersSVG() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full" fill="none">
      {/* Grid lines */}
      <line x1="10" y1="100" x2="190" y2="100" stroke="#e5e7eb" strokeWidth="1" />
      <line x1="10" y1="70" x2="190" y2="70" strokeDasharray="4 3" stroke="#e5e7eb" strokeWidth="0.8" />
      {/* Neckline */}
      <line x1="40" y1="72" x2="160" y2="72" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="163" y="75" fontSize="8" fill="#f59e0b" fontWeight="600">Neckline</text>
      {/* Price path: left shoulder → head → right shoulder */}
      <polyline
        points="10,95 30,95 45,68 60,78 90,30 120,78 135,68 150,78 170,95 190,95"
        stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round"
      />
      {/* Labels */}
      <text x="38" y="62" fontSize="7.5" fill="#6b7280" textAnchor="middle">LS</text>
      <text x="90" y="24" fontSize="7.5" fill="#ef4444" textAnchor="middle" fontWeight="700">HEAD</text>
      <text x="142" y="62" fontSize="7.5" fill="#6b7280" textAnchor="middle">RS</text>
      {/* Arrows showing measured move */}
      <line x1="90" y1="72" x2="90" y2="114" stroke="#ef4444" strokeWidth="1" markerEnd="url(#arrow)" strokeDasharray="3 2" />
      <text x="95" y="112" fontSize="7" fill="#ef4444">Target</text>
    </svg>
  );
}

function DoubleTopSVG() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full" fill="none">
      <line x1="10" y1="100" x2="190" y2="100" stroke="#e5e7eb" strokeWidth="1" />
      {/* Neckline */}
      <line x1="50" y1="75" x2="170" y2="75" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="173" y="78" fontSize="8" fill="#f59e0b" fontWeight="600">Neck</text>
      {/* M shape */}
      <polyline
        points="10,95 30,95 55,35 80,75 105,35 130,75 155,95 190,95"
        stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round"
      />
      {/* Labels */}
      <text x="55" y="28" fontSize="8" fill="#ef4444" textAnchor="middle" fontWeight="700">Top 1</text>
      <text x="105" y="28" fontSize="8" fill="#ef4444" textAnchor="middle" fontWeight="700">Top 2</text>
      {/* Equal sign between tops */}
      <text x="80" y="22" fontSize="9" fill="#6b7280" textAnchor="middle">≈</text>
      {/* Breakdown arrow */}
      <line x1="130" y1="75" x2="130" y2="110" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x="135" y="112" fontSize="7" fill="#ef4444">Break</text>
    </svg>
  );
}

function TripleTopSVG() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full" fill="none">
      <line x1="10" y1="100" x2="190" y2="100" stroke="#e5e7eb" strokeWidth="1" />
      {/* Neckline */}
      <line x1="30" y1="76" x2="175" y2="76" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="178" y="79" fontSize="8" fill="#f59e0b" fontWeight="600">Neck</text>
      {/* W-W shape (3 peaks) */}
      <polyline
        points="10,95 25,95 42,36 58,76 75,36 91,76 108,36 124,76 150,95 190,95"
        stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round"
      />
      <text x="42" y="29" fontSize="7.5" fill="#ef4444" textAnchor="middle" fontWeight="700">1</text>
      <text x="75" y="29" fontSize="7.5" fill="#ef4444" textAnchor="middle" fontWeight="700">2</text>
      <text x="108" y="29" fontSize="7.5" fill="#ef4444" textAnchor="middle" fontWeight="700">3</text>
      {/* Resistance line */}
      <line x1="30" y1="36" x2="130" y2="36" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" opacity="0.6" />
      <text x="135" y="39" fontSize="7" fill="#ef4444">Resistance</text>
    </svg>
  );
}

function RoundingTopSVG() {
  // Dome/arc shape using a quadratic bezier
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full" fill="none">
      <line x1="10" y1="100" x2="190" y2="100" stroke="#e5e7eb" strokeWidth="1" />
      {/* Dome curve */}
      <path
        d="M 10,90 Q 100,15 190,90"
        stroke="#3b82f6" strokeWidth="2" fill="none"
      />
      {/* Shading under dome */}
      <path
        d="M 10,90 Q 100,15 190,90 L 190,100 L 10,100 Z"
        fill="#3b82f6" opacity="0.06"
      />
      {/* Peak label */}
      <text x="100" y="12" fontSize="8" fill="#ef4444" textAnchor="middle" fontWeight="700">Peak</text>
      <line x1="100" y1="15" x2="100" y2="30" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
      {/* Time labels */}
      <text x="15" y="112" fontSize="7" fill="#9ca3af">Weeks</text>
      <text x="175" y="112" fontSize="7" fill="#9ca3af" textAnchor="end">→ Time</text>
      {/* "Slow distribution" annotation */}
      <text x="100" y="55" fontSize="7.5" fill="#6b7280" textAnchor="middle">Slow distribution</text>
      <text x="100" y="65" fontSize="7.5" fill="#6b7280" textAnchor="middle">over weeks/months</text>
    </svg>
  );
}

function RisingWedgeSVG() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full" fill="none">
      <line x1="10" y1="100" x2="190" y2="100" stroke="#e5e7eb" strokeWidth="1" />
      {/* Upper trendline (rising, less steep) */}
      <line x1="10" y1="85" x2="160" y2="30" stroke="#ef4444" strokeWidth="1.5" />
      {/* Lower trendline (rising, more steep — converging) */}
      <line x1="10" y1="95" x2="160" y2="55" stroke="#22c55e" strokeWidth="1.5" />
      {/* Price zigzag inside wedge */}
      <polyline
        points="10,93 30,78 50,88 70,68 90,78 110,55 130,65 150,48 160,42"
        stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"
      />
      {/* Labels */}
      <text x="165" y="28" fontSize="7.5" fill="#ef4444">Resistance</text>
      <text x="165" y="58" fontSize="7.5" fill="#22c55e">Support</text>
      {/* Breakdown */}
      <polyline
        points="160,42 175,70 190,95"
        stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2"
      />
      <text x="168" y="88" fontSize="7.5" fill="#ef4444" fontWeight="700">Break!</text>
      {/* "Looks bullish" note */}
      <text x="80" y="110" fontSize="7.5" fill="#f59e0b" textAnchor="middle">⚠ Looks bullish — it's a trap</text>
    </svg>
  );
}

function BroadeningTopSVG() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-full" fill="none">
      <line x1="10" y1="100" x2="190" y2="100" stroke="#e5e7eb" strokeWidth="1" />
      {/* Upper trendline (rising) */}
      <line x1="20" y1="65" x2="180" y2="25" stroke="#ef4444" strokeWidth="1.5" />
      {/* Lower trendline (falling) */}
      <line x1="20" y1="80" x2="180" y2="95" stroke="#22c55e" strokeWidth="1.5" />
      {/* Expanding zigzag */}
      <polyline
        points="20,72 40,60 60,78 85,50 110,82 135,38 160,88 180,55"
        stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"
      />
      {/* Labels */}
      <text x="183" y="24" fontSize="7.5" fill="#ef4444">↑ Highs</text>
      <text x="183" y="97" fontSize="7.5" fill="#22c55e">↓ Lows</text>
      {/* Expanding arrows */}
      <text x="100" y="112" fontSize="7.5" fill="#f59e0b" textAnchor="middle">⚠ Volatility expanding — loss of control</text>
    </svg>
  );
}

// ─── Pattern data ─────────────────────────────────────────────────────────────

const PATTERNS = [
  {
    id: "HEAD_AND_SHOULDERS",
    label: "Head & Shoulders",
    emoji: "🎯",
    reliability: 95,
    color: "#ef4444",
    SVG: HeadAndShouldersSVG,
    beginner: "Imagine three mountain peaks — the middle one is tallest. The stock tried to go higher three times. The first and third peaks (the 'shoulders') are roughly the same height. When price falls below the 'neckline' connecting the two valleys, it's a confirmed reversal.",
    trader: "Most reliable topping pattern in technical analysis. Measured move = neckline − (head − neckline). Wait for a daily close below the neckline before acting. False breakdowns happen — volume on the breakdown should be high.",
    optionsPlay: "Sell call spreads above the right shoulder. Buy puts targeting the measured move. Avoid selling puts until pattern resolves.",
    keyRule: "Right shoulder lower than left = stronger signal",
    frequency: "Uncommon but high-conviction",
  },
  {
    id: "DOUBLE_TOP",
    label: "Double Top (M-Top)",
    emoji: "⛰️",
    reliability: 83,
    color: "#f97316",
    SVG: DoubleTopSVG,
    beginner: "Price hit the same ceiling twice and couldn't break through. Like trying to open a stuck door — the second attempt tells you it's really locked. The 'M' shape on the chart is unmistakable. When price falls below the middle valley, sellers win.",
    trader: "Second most common topping pattern. The second top is often slightly lower than the first — that divergence (lower high) is a bearish tell. Neckline break on high volume = confirmed. Target = neckline − (top − neckline).",
    optionsPlay: "Sell calls at the double top resistance. Iron condor works well if the range is defined. Sell put spreads only if you want to own shares at the neckline.",
    keyRule: "Second top lower than first = higher probability reversal",
    frequency: "Common — look for this on every chart",
  },
  {
    id: "TRIPLE_TOP",
    label: "Triple Top",
    emoji: "🏔️",
    reliability: 90,
    color: "#dc2626",
    SVG: TripleTopSVG,
    beginner: "Three separate attempts to break the same resistance level — all failed. If the stock can't break through after three tries, the sellers are firmly in control. This is the market saying 'this price is too expensive' three times in a row.",
    trader: "Stronger conviction than double top. The third failure is the most reliable entry signal. Often forms over a longer period (weeks to months). Volume typically decreases on each successive top.",
    optionsPlay: "Aggressive call selling above the triple top resistance. The defined resistance makes for clean strike selection. Sell puts only well below the neckline.",
    keyRule: "Three equal peaks = institutional resistance level",
    frequency: "Less common than double top but very reliable",
  },
  {
    id: "ROUNDING_TOP",
    label: "Rounding Top (Dome)",
    emoji: "🌙",
    reliability: 72,
    color: "#8b5cf6",
    SVG: RoundingTopSVG,
    beginner: "Instead of a sharp peak, price slowly curves over like a hill or dome. This happens when big institutions quietly sell over weeks or months while retail buyers keep pushing the price up. By the time most people notice, the smart money is already out.",
    trader: "Slow distribution pattern — often takes 2-6 months to form. IV is usually elevated during the right side of the dome. The gradual decline is deceptive — many traders keep buying the 'dip' on the way down.",
    optionsPlay: "Premium selling paradise — IV is high, direction is slowly down. Sell call spreads. Iron condors work if you use wide strikes. Avoid naked puts.",
    keyRule: "Longer the dome, stronger the reversal",
    frequency: "Common in large-cap stocks after extended rallies",
  },
  {
    id: "RISING_WEDGE",
    label: "Rising Wedge",
    emoji: "📐",
    reliability: 78,
    color: "#f59e0b",
    SVG: RisingWedgeSVG,
    beginner: "Price is making higher highs AND higher lows — which sounds bullish. But the moves are getting smaller and smaller, like a spring being compressed. When the floor breaks, the compressed energy releases downward. It's a trap for buyers.",
    trader: "Counter-intuitive pattern. The rising lower trendline gives false confidence. Key tell: volume decreases as price rises (no conviction on the up moves). Break of lower trendline on volume = confirmed. Often precedes sharp, fast declines.",
    optionsPlay: "Sell call spreads at the upper trendline. Avoid selling puts — the breakdown can be fast and deep. Buy puts on the trendline break.",
    keyRule: "Lower trendline rising faster than upper = converging = wedge",
    frequency: "Common after parabolic moves",
  },
  {
    id: "BROADENING_TOP",
    label: "Broadening Top",
    emoji: "📯",
    reliability: 65,
    color: "#6366f1",
    SVG: BroadeningTopSVG,
    beginner: "Price swings are getting bigger in both directions — huge up days followed by even bigger down days. This is the market losing control. Unlike other patterns, this one is chaotic. The expanding volatility means no one is in charge.",
    trader: "Most dangerous pattern for premium sellers — IV is high but the moves are unpredictable. Avoid strangles and iron condors. If trading, use defined-risk spreads with wide strikes. The pattern resolves bearishly about 65% of the time.",
    optionsPlay: "Avoid undefined-risk trades. If you must trade: buy put debit spreads. The high IV makes buying options expensive but the directional risk is real.",
    keyRule: "Expanding range = expanding uncertainty = reduce position size",
    frequency: "Less common — usually signals market tops",
  },
];

// ─── Live Pattern Scan ────────────────────────────────────────────────────────

function LivePatternScan({ learnMode }: { learnMode: boolean }) {
  const [ticker, setTicker] = useState("");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  const { data, isLoading } = trpc.emaPullback.detectPattern.useQuery(
    { ticker: activeTicker ?? "" },
    { enabled: !!activeTicker }
  );

  const handleScan = () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setActiveTicker(t);
    toast.info(`Scanning ${t} for top patterns…`);
  };

  const pattern = PATTERNS.find(p => p.id === data?.pattern);

  return (
    <Card className="border-green-200 bg-green-50/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-green-600" />
          Live Pattern Scanner
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Enter any ticker to detect which of the 6 top patterns (if any) is forming on the daily chart
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="AAPL, NVDA, SPY…"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleScan()}
            className="h-9 text-sm uppercase max-w-40"
          />
          <Button size="sm" onClick={handleScan} disabled={isLoading} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
            {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Scan
          </Button>
        </div>

        {data && activeTicker && (
          <div className={`rounded-xl border p-4 ${
            data.pattern === "NONE"
              ? "border-green-200 bg-green-50/40"
              : "border-amber-200 bg-amber-50/30"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{data.emoji}</span>
              <div>
                <div className="font-bold text-sm">{activeTicker} — {data.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {data.pattern !== "NONE" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">
                      {data.confidence}% confidence
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm text-foreground/80 mb-3">
              {learnMode ? data.plainEnglish : data.traderNote}
            </p>

            {data.pattern !== "NONE" && data.keyLevels && Object.keys(data.keyLevels).length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(data.keyLevels).map(([key, val]) => (
                  val != null && (
                    <div key={key} className="flex justify-between text-xs bg-white/60 rounded px-2 py-1">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-semibold">${(val as number).toFixed(2)}</span>
                    </div>
                  )
                ))}
                {data.bearishTarget && (
                  <div className="flex justify-between text-xs bg-red-50 rounded px-2 py-1 border border-red-100">
                    <span className="text-red-600">Bearish Target</span>
                    <span className="font-semibold text-red-600">${data.bearishTarget.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Match to pattern library */}
            {pattern && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Options Play</div>
                <p className="text-xs text-foreground/70">{pattern.optionsPlay}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pattern Card ─────────────────────────────────────────────────────────────

function PatternCard({
  pattern,
  learnMode,
}: {
  pattern: typeof PATTERNS[0];
  learnMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const SVGComponent = pattern.SVG;

  return (
    <Card
      className="border transition-all duration-200 hover:shadow-md cursor-pointer"
      style={{ borderColor: pattern.color + "40" }}
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* SVG diagram */}
          <div
            className="w-28 h-20 shrink-0 rounded-lg overflow-hidden border"
            style={{ background: pattern.color + "08", borderColor: pattern.color + "30" }}
          >
            <SVGComponent />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-base">{pattern.emoji}</span>
              <span className="font-bold text-sm">{pattern.label}</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{ borderColor: pattern.color + "60", color: pattern.color, background: pattern.color + "10" }}
              >
                {pattern.reliability}% reliable
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto">{pattern.frequency}</span>
            </div>

            <p className="text-xs text-foreground/80 leading-relaxed">
              {learnMode ? pattern.beginner : pattern.trader}
            </p>

            {expanded && (
              <div className="mt-3 space-y-2">
                {!learnMode && (
                  <div className="text-xs bg-muted/40 rounded-lg p-2.5">
                    <div className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Options Play</div>
                    <p className="text-foreground/80">{pattern.optionsPlay}</p>
                  </div>
                )}
                <div
                  className="text-xs rounded-lg p-2.5 border"
                  style={{ background: pattern.color + "08", borderColor: pattern.color + "30" }}
                >
                  <div className="font-semibold text-[10px] uppercase tracking-wide mb-1" style={{ color: pattern.color }}>
                    Key Rule
                  </div>
                  <p className="font-medium">{pattern.keyRule}</p>
                </div>
                {learnMode && (
                  <div className="text-xs bg-muted/40 rounded-lg p-2.5">
                    <div className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Trader's Take</div>
                    <p className="text-foreground/80">{pattern.trader}</p>
                  </div>
                )}
              </div>
            )}

            <button
              className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? "▲ Less" : "▼ More detail"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChartPatterns() {
  const [learnMode, setLearnMode] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-green-600" />
            6 Classic Topping Patterns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The most important distribution patterns — with SVG diagrams, plain-English explanations, and options plays
          </p>
        </div>

        {/* Learn Mode toggle */}
        <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2.5 border border-border/60">
          <GraduationCap className={`h-4 w-4 ${learnMode ? "text-green-600" : "text-muted-foreground"}`} />
          <div>
            <div className="text-xs font-semibold">{learnMode ? "Learn Mode ON" : "Trader Mode"}</div>
            <div className="text-[10px] text-muted-foreground">
              {learnMode ? "Beginner-friendly explanations" : "Technical trader language"}
            </div>
          </div>
          <Switch
            checked={learnMode}
            onCheckedChange={setLearnMode}
            className="data-[state=checked]:bg-green-600"
          />
        </div>
      </div>

      {/* Learn mode banner */}
      {learnMode && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <GraduationCap className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-green-800">Learn Mode is ON</div>
            <p className="text-xs text-green-700 mt-0.5">
              All explanations are in plain English — no jargon. Perfect for sharing with family and friends who are learning to trade.
              Toggle off to see the technical trader's perspective.
            </p>
          </div>
        </div>
      )}

      {/* Quick reference: reliability table */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Pattern Reliability at a Glance</div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {PATTERNS.map(p => (
              <div
                key={p.id}
                className="text-center p-2 rounded-lg border"
                style={{ background: p.color + "08", borderColor: p.color + "30" }}
              >
                <div className="text-lg mb-1">{p.emoji}</div>
                <div className="text-[10px] font-semibold leading-tight" style={{ color: p.color }}>{p.label}</div>
                <div className="text-xs font-bold mt-1">{p.reliability}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Live scanner */}
      <LivePatternScan learnMode={learnMode} />

      {/* Pattern cards */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pattern Library — click any card to expand
          </h2>
        </div>
        <div className="space-y-3">
          {PATTERNS.map(pattern => (
            <PatternCard key={pattern.id} pattern={pattern} learnMode={learnMode} />
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl p-4 border border-border/40">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <strong>Important:</strong> No pattern is 100% reliable. Always confirm with volume, multiple timeframes, and the broader market context.
          Patterns fail more often in strong trending markets. Use these as one input in your decision — not the only input.
        </div>
      </div>
    </div>
  );
}
