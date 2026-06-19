import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  BarChart2, Calculator, Eye, Target, Lightbulb, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Activity, Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SectionProps { children: React.ReactNode; className?: string }
function Section({ children, className = "" }: SectionProps) {
  return <div className={`space-y-4 ${className}`}>{children}</div>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold tracking-tight" style={{ color: "oklch(0.12 0.012 240)" }}>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold" style={{ color: "oklch(0.20 0.012 240)" }}>
      {children}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "oklch(0.38 0.012 240)" }}>
      {children}
    </p>
  );
}

// ─── Signal badge ─────────────────────────────────────────────────────────────
function SignalPill({ signal }: { signal: "BULLISH" | "BEARISH" | "NEUTRAL" }) {
  const styles = {
    BULLISH: { bg: "oklch(0.95 0.045 145)", color: "oklch(0.35 0.160 145)", icon: ArrowUpRight },
    BEARISH: { bg: "oklch(0.96 0.040 25)", color: "oklch(0.45 0.180 25)", icon: ArrowDownRight },
    NEUTRAL: { bg: "oklch(0.96 0.010 240)", color: "oklch(0.45 0.016 240)", icon: Minus },
  };
  const s = styles[signal];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      <Icon className="h-3 w-3" />
      {signal}
    </span>
  );
}

// ─── COT Index gauge (static visual) ─────────────────────────────────────────
function COTGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "oklch(0.55 0.180 145)" : pct <= 30 ? "oklch(0.55 0.200 25)" : "oklch(0.55 0.016 240)";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-medium" style={{ color: "oklch(0.45 0.012 240)" }}>{label}</div>
      <div className="relative w-24 h-2 rounded-full" style={{ background: "oklch(0.92 0.006 240)" }}>
        <div
          className="absolute left-0 top-0 h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="text-lg font-bold" style={{ color }}>{pct}</div>
    </div>
  );
}

// ─── Expandable FAQ item ──────────────────────────────────────────────────────
function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-lg border cursor-pointer transition-colors"
      style={{ borderColor: "oklch(0.90 0.006 240)", background: open ? "oklch(0.98 0.004 240)" : "#fff" }}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium" style={{ color: "oklch(0.20 0.012 240)" }}>{q}</span>
        <ChevronRight
          className="h-4 w-4 shrink-0 transition-transform duration-200"
          style={{ color: "oklch(0.55 0.016 240)", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </div>
      {open && (
        <div className="px-4 pb-3">
          <Separator className="mb-3" />
          <p className="text-sm leading-relaxed" style={{ color: "oklch(0.38 0.012 240)" }}>{a}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function COTReference() {
  return (
    <div className="min-h-screen" style={{ background: "oklch(0.98 0.003 240)" }}>
      {/* Header */}
      <div className="px-6 py-6 border-b" style={{ background: "#fff", borderColor: "oklch(0.92 0.006 240)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.95 0.045 145)" }}>
              <Globe className="h-5 w-5" style={{ color: "oklch(0.45 0.160 145)" }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "oklch(0.12 0.012 240)" }}>
                COT Methodology Reference
              </h1>
              <p className="text-sm" style={{ color: "oklch(0.48 0.016 240)" }}>
                Larry Williams' Commitments of Traders framework — how to read it, trade it, and avoid the traps
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline" className="text-xs">CFTC Weekly Data</Badge>
            <Badge variant="outline" className="text-xs">52-Week Rolling Index</Badge>
            <Badge variant="outline" className="text-xs">Larry Williams Framework</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Explainer Video ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ background: "oklch(0.95 0.045 145)" }}>
              <svg className="h-3.5 w-3.5" style={{ color: "oklch(0.40 0.160 145)" }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "oklch(0.48 0.016 240)" }}>
              COT Intro Video — 2 min 42 sec
            </h2>
          </div>
          <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
            <video
              controls
              preload="metadata"
              className="w-full"
              style={{ display: "block", background: "#0f1729" }}
              poster="https://d2xsxph8kpxj0f.cloudfront.net/118490340/BheE8kSKn5XamgVXMJ6CM6/cot-video-frame1-P6ioEQ2hVsekmHC9AM8nDD.webp"
            >
              <source src="/manus-storage/cot-explainer_4f74c33d.mp4" type="video/mp4" />
              Your browser does not support HTML5 video.
            </video>
          </div>
          <p className="text-xs mt-2" style={{ color: "oklch(0.60 0.016 240)" }}>
            Covers: Who files the COT report · The 3 trader groups · COT Index formula · Gold signal example · How to trade it
          </p>
        </div>

        {/* ── Strategy Deep-Dive Video ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ background: "oklch(0.93 0.055 260)" }}>
              <svg className="h-3.5 w-3.5" style={{ color: "oklch(0.40 0.180 260)" }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "oklch(0.48 0.016 240)" }}>
              COT Strategy Deep-Dive — 6 min 18 sec
            </h2>
          </div>
          <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
            <video
              controls
              preload="metadata"
              className="w-full"
              style={{ display: "block", background: "#0f1729" }}
            >
              <source src="/manus-storage/cot-strategy-video_ec1b296f.mp4" type="video/mp4" />
              Your browser does not support HTML5 video.
            </video>
          </div>
          <p className="text-xs mt-2" style={{ color: "oklch(0.60 0.016 240)" }}>
            Covers: The 3 trader groups in depth · COT Index formula step-by-step · Reading the PitDesk dashboard · Price confirmation rule · Setting alerts · Options strategy matrix · 4 mistakes to avoid
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="formula">Formula</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-6">
            <Section>
              <H2>What is the COT Report?</H2>
              <Prose>
                The Commitments of Traders (COT) report is published every Friday by the US Commodity Futures Trading Commission (CFTC). It shows the net futures positions held by three groups of market participants across 19 major commodity and financial markets. Larry Williams, legendary futures trader and author of <em>Trade Stocks and Commodities with the Insiders</em>, popularized using this data as a contrarian signal — specifically by tracking what the "smart money" commercials are doing versus the speculative crowd.
              </Prose>
            </Section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: Building2Icon,
                  title: "Commercials",
                  color: "oklch(0.95 0.045 145)",
                  iconColor: "oklch(0.40 0.160 145)",
                  desc: "Hedgers — farmers, oil producers, miners, corporations. They use futures to hedge real business exposure. When they're heavily long, they expect prices to rise. They are the 'smart money' — they know their industry better than anyone.",
                  label: "Smart Money",
                  labelColor: "oklch(0.40 0.160 145)",
                  labelBg: "oklch(0.95 0.045 145)",
                },
                {
                  icon: TrendingUp,
                  title: "Large Speculators",
                  color: "oklch(0.96 0.040 25)",
                  iconColor: "oklch(0.45 0.180 25)",
                  desc: "Hedge funds, CTAs, institutional traders. They follow trends and use leverage. They are often wrong at extremes — when they are maximally long, the top is usually near. Williams calls them the 'dumb money' at turning points.",
                  label: "Trend Followers",
                  labelColor: "oklch(0.45 0.180 25)",
                  labelBg: "oklch(0.96 0.040 25)",
                },
                {
                  icon: Activity,
                  title: "Small Speculators",
                  color: "oklch(0.96 0.030 280)",
                  iconColor: "oklch(0.45 0.140 280)",
                  desc: "Retail traders and small funds below the CFTC reporting threshold. Generally the least informed group. Williams largely ignores this group — the commercial vs large speculator divergence is the key signal.",
                  label: "Retail / Small",
                  labelColor: "oklch(0.45 0.140 280)",
                  labelBg: "oklch(0.96 0.030 280)",
                },
              ].map(item => (
                <Card key={item.title} className="border" style={{ borderColor: "oklch(0.90 0.006 240)" }}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: item.color }}>
                        <item.icon className="h-4 w-4" style={{ color: item.iconColor }} />
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: item.labelBg, color: item.labelColor }}>
                        {item.label}
                      </span>
                    </div>
                    <CardTitle className="text-sm mt-2">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(0.42 0.012 240)" }}>{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Section>
              <H2>Why Does It Work?</H2>
              <Prose>
                Commercials are the ultimate insiders. A gold mining company selling futures knows more about gold supply than any hedge fund. A grain elevator buying corn futures knows more about crop conditions than any speculator. When commercials take an extreme position — either extremely long or extremely short relative to their historical range — they are signaling a strong view on future prices. The COT Index quantifies how extreme their current position is relative to the past 52 weeks, giving you a normalized 0–100 score.
              </Prose>
              <div className="rounded-lg p-4 border-l-4" style={{ background: "oklch(0.97 0.010 145)", borderColor: "oklch(0.55 0.180 145)" }}>
                <p className="text-sm font-medium" style={{ color: "oklch(0.30 0.012 240)" }}>
                  Larry Williams' Core Rule: "When commercials are at a 52-week extreme in their net position, pay attention. When large speculators are at the opposite extreme, act."
                </p>
              </div>
            </Section>

            <Section>
              <H2>Markets Covered in PitDesk</H2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { cat: "Metals", items: ["Gold", "Silver", "Copper", "Platinum"] },
                  { cat: "Energy", items: ["Crude Oil", "Natural Gas", "Heating Oil"] },
                  { cat: "Grains", items: ["Corn", "Wheat", "Soybeans", "Soybean Oil"] },
                  { cat: "Softs", items: ["Coffee", "Sugar", "Cotton", "Cocoa"] },
                  { cat: "Financials", items: ["S&P 500", "10-Year T-Note", "Euro FX"] },
                  { cat: "Livestock", items: ["Live Cattle", "Lean Hogs"] },
                ].map(group => (
                  <div key={group.cat} className="rounded-lg p-3 border" style={{ borderColor: "oklch(0.90 0.006 240)", background: "#fff" }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: "oklch(0.45 0.016 240)" }}>{group.cat}</div>
                    {group.items.map(i => (
                      <div key={i} className="text-xs py-0.5" style={{ color: "oklch(0.30 0.012 240)" }}>• {i}</div>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          </TabsContent>

          {/* ── FORMULA ── */}
          <TabsContent value="formula" className="space-y-6">
            <Section>
              <H2>The COT Index Formula</H2>
              <Prose>
                The raw COT data shows net positions (longs minus shorts) for each trader group. The raw number alone is not useful — a net long of 50,000 contracts in gold means nothing without knowing whether that's historically high or low. The COT Index normalizes this into a 0–100 scale using a rolling 52-week window, exactly like the Williams %R oscillator applied to positioning data.
              </Prose>
            </Section>

            <Card className="border" style={{ borderColor: "oklch(0.90 0.006 240)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calculator className="h-4 w-4" style={{ color: "oklch(0.45 0.160 145)" }} />
                  COT Index Calculation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg p-4" style={{ background: "oklch(0.96 0.004 240)", fontFamily: "monospace" }}>
                  <div className="text-sm space-y-2" style={{ color: "oklch(0.20 0.012 240)" }}>
                    <div><span style={{ color: "oklch(0.45 0.160 145)" }}>NetPosition</span> = Commercial Longs − Commercial Shorts</div>
                    <div className="mt-3"><span style={{ color: "oklch(0.45 0.160 145)" }}>MaxNet</span> = highest NetPosition over past 52 weeks</div>
                    <div><span style={{ color: "oklch(0.45 0.160 145)" }}>MinNet</span> = lowest NetPosition over past 52 weeks</div>
                    <div className="mt-3 text-base font-bold" style={{ color: "oklch(0.12 0.012 240)" }}>
                      COT Index = (NetPosition − MinNet) / (MaxNet − MinNet) × 100
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                  <COTGauge value={85} label="Bullish Zone (≥70)" />
                  <COTGauge value={50} label="Neutral Zone (30–70)" />
                  <COTGauge value={15} label="Bearish Zone (≤30)" />
                </div>

                <Separator />

                <div className="space-y-3">
                  <H3>Step-by-Step Example — Gold</H3>
                  <div className="space-y-2">
                    {[
                      { step: "1", label: "Get this week's net position", value: "Commercials: 180,000 long − 240,000 short = −60,000 net" },
                      { step: "2", label: "Find 52-week max", value: "Highest net in past year: +40,000 (they were net long)" },
                      { step: "3", label: "Find 52-week min", value: "Lowest net in past year: −120,000 (heavily net short)" },
                      { step: "4", label: "Apply formula", value: "(−60,000 − (−120,000)) / (40,000 − (−120,000)) × 100 = 37.5" },
                      { step: "5", label: "Interpret", value: "COT Index = 37.5 → NEUTRAL (between 30 and 70)" },
                    ].map(s => (
                      <div key={s.step} className="flex gap-3 items-start">
                        <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                          style={{ background: "oklch(0.95 0.045 145)", color: "oklch(0.40 0.160 145)" }}>
                          {s.step}
                        </div>
                        <div>
                          <div className="text-xs font-semibold" style={{ color: "oklch(0.25 0.012 240)" }}>{s.label}</div>
                          <div className="text-xs" style={{ color: "oklch(0.42 0.012 240)" }}>{s.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Section>
              <H2>Data Source</H2>
              <Prose>
                PitDesk pulls data directly from the CFTC's public Socrata API (no API key required). The CFTC releases COT data every Friday at 3:30 PM Eastern time, reflecting positions as of Tuesday of that week. This means there is a 3-day lag in the data — Tuesday positions are reported on Friday. PitDesk shows a data freshness banner when the data is more than 8 days old.
              </Prose>
              <div className="rounded-lg p-3 border flex items-center gap-3" style={{ borderColor: "oklch(0.90 0.006 240)", background: "#fff" }}>
                <CheckCircle className="h-4 w-4 shrink-0" style={{ color: "oklch(0.50 0.180 145)" }} />
                <span className="text-xs" style={{ color: "oklch(0.35 0.012 240)" }}>
                  Source: <strong>CFTC Disaggregated Futures Only Report</strong> — api.cftc.gov/public/opendata/reporttype/dof
                </span>
              </div>
            </Section>
          </TabsContent>

          {/* ── SIGNALS ── */}
          <TabsContent value="signals" className="space-y-6">
            <Section>
              <H2>Reading the Signals</H2>
              <Prose>
                The COT Index alone is not a trade signal — it is a positioning context indicator. Williams always combined it with a price confirmation trigger before entering a trade. The index tells you the setup; price action tells you the timing.
              </Prose>
            </Section>

            <div className="space-y-3">
              {[
                {
                  signal: "BULLISH" as const,
                  range: "COT Index ≥ 70",
                  meaning: "Commercials are near their most net-long position in 52 weeks",
                  interpretation: "They expect prices to rise. This is a bullish setup — look for a price confirmation trigger (breakout above recent high, reversal candle, or moving average cross) before entering long.",
                  example: "Gold COT Index = 82 → Commercials are heavily long gold. Wait for price to close above the 10-day high before buying.",
                  caution: "High COT can stay high for weeks. Do not buy just because the index is above 70 — wait for price to confirm.",
                },
                {
                  signal: "NEUTRAL" as const,
                  range: "COT Index 30–70",
                  meaning: "Commercials are in the middle of their historical range",
                  interpretation: "No strong positioning signal. The market is in equilibrium from a COT perspective. Use other tools (technical analysis, fundamentals) to make directional decisions. COT is not adding information here.",
                  example: "Crude Oil COT Index = 52 → No edge from COT. Look at price structure, supply/demand fundamentals instead.",
                  caution: "Many traders make the mistake of trading neutral COT readings. The edge only appears at extremes.",
                },
                {
                  signal: "BEARISH" as const,
                  range: "COT Index ≤ 30",
                  meaning: "Commercials are near their most net-short position in 52 weeks",
                  interpretation: "They expect prices to fall. This is a bearish setup — look for a price confirmation trigger (breakdown below recent low, reversal candle, or moving average cross) before entering short or buying puts.",
                  example: "Corn COT Index = 12 → Commercials are heavily short corn. Wait for price to close below the 10-day low before shorting.",
                  caution: "Bearish COT in commodities can reflect seasonal hedging patterns. Always check if the reading is seasonally normal for that market.",
                },
              ].map(item => (
                <Card key={item.signal} className="border" style={{ borderColor: "oklch(0.90 0.006 240)" }}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <SignalPill signal={item.signal} />
                      <span className="text-xs font-mono font-semibold" style={{ color: "oklch(0.45 0.016 240)" }}>{item.range}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold mb-1" style={{ color: "oklch(0.25 0.012 240)" }}>What it means</div>
                      <p className="text-xs leading-relaxed" style={{ color: "oklch(0.38 0.012 240)" }}>{item.meaning}</p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-1" style={{ color: "oklch(0.25 0.012 240)" }}>How to trade it</div>
                      <p className="text-xs leading-relaxed" style={{ color: "oklch(0.38 0.012 240)" }}>{item.interpretation}</p>
                    </div>
                    <div className="rounded p-2" style={{ background: "oklch(0.97 0.006 240)" }}>
                      <div className="text-xs font-semibold mb-0.5" style={{ color: "oklch(0.35 0.012 240)" }}>Example</div>
                      <p className="text-xs" style={{ color: "oklch(0.42 0.012 240)" }}>{item.example}</p>
                    </div>
                    <div className="flex items-start gap-2 rounded p-2" style={{ background: "oklch(0.97 0.030 55)" }}>
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" style={{ color: "oklch(0.55 0.160 55)" }} />
                      <p className="text-xs" style={{ color: "oklch(0.38 0.012 240)" }}>{item.caution}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Section>
              <H2>The Williams Confirmation Rule</H2>
              <div className="rounded-lg p-5 border-l-4 space-y-3" style={{ background: "oklch(0.97 0.010 145)", borderColor: "oklch(0.55 0.180 145)" }}>
                <H3>Never trade COT alone. Always require price confirmation.</H3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "For BULLISH setups", trigger: "Price closes above the 10-day high (or 3-day high for shorter-term)", icon: TrendingUp, color: "oklch(0.40 0.160 145)" },
                    { label: "For BEARISH setups", trigger: "Price closes below the 10-day low (or 3-day low for shorter-term)", icon: TrendingDown, color: "oklch(0.45 0.180 25)" },
                  ].map(item => (
                    <div key={item.label} className="flex gap-3">
                      <item.icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: item.color }} />
                      <div>
                        <div className="text-xs font-semibold" style={{ color: "oklch(0.25 0.012 240)" }}>{item.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: "oklch(0.42 0.012 240)" }}>{item.trigger}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          </TabsContent>

          {/* ── WALKTHROUGH ── */}
          <TabsContent value="walkthrough" className="space-y-6">
            <Section>
              <H2>How to Use the PitDesk COT Dashboard</H2>
            </Section>

            <div className="space-y-4">
              {[
                {
                  step: "1",
                  title: "Open the COT Dashboard",
                  desc: "Navigate to Market Intelligence → COT Dashboard in the sidebar. You'll see a grid of all 19 instruments with their current COT Index score and signal.",
                  tip: "Use the category filter tabs (All / Metals / Energy / Grains / Softs / Financials) to focus on a sector.",
                },
                {
                  step: "2",
                  title: "Identify Extreme Readings",
                  desc: "Look for instruments with a BULLISH (≥70) or BEARISH (≤30) signal. These are the only setups worth investigating further. Ignore NEUTRAL readings for COT-based trades.",
                  tip: "The summary bar at the top shows counts: X Bullish, Y Bearish, Z Neutral. Start with the extremes.",
                },
                {
                  step: "3",
                  title: "Click Into the Detail View",
                  desc: "Click any instrument card to open the detail page. You'll see: (1) a 52-week COT Index line chart showing the full history, (2) a bar chart of commercial vs non-commercial net positions, and (3) the current signal interpretation.",
                  tip: "Look for the COT Index to be at a multi-week extreme — not just crossing 70 for the first time, but sustained above 70 for 2+ weeks.",
                },
                {
                  step: "4",
                  title: "Check Price Confirmation",
                  desc: "Go to your charting platform (TradingView, E*TRADE) and pull up the corresponding futures or ETF chart. Apply a 10-day high/low channel. Wait for price to close above (for bullish) or below (for bearish) that channel.",
                  tip: "For Gold: use GLD or /GC. For Crude Oil: use USO or /CL. For S&P 500: use SPY or /ES.",
                },
                {
                  step: "5",
                  title: "Size the Trade",
                  desc: "COT signals are intermediate-term (2–8 week) setups. Use options with 30–60 DTE. For bullish setups: buy call spreads. For bearish setups: buy put spreads. Risk no more than 2% of account per COT trade.",
                  tip: "COT signals can be early by 1–3 weeks. Use defined-risk options spreads so you can hold through the noise without getting stopped out.",
                },
                {
                  step: "6",
                  title: "Monitor Weekly",
                  desc: "Check the COT Dashboard every Friday after 3:30 PM ET when new data is released. If the COT Index reverses from extreme back toward neutral while you're in a trade, that's a warning sign — consider tightening your stop.",
                  tip: "The data freshness banner will appear if the data is stale. Refresh on Fridays.",
                },
              ].map(item => (
                <div key={item.step} className="flex gap-4">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                    style={{ background: "oklch(0.95 0.045 145)", color: "oklch(0.40 0.160 145)" }}>
                    {item.step}
                  </div>
                  <div className="flex-1 pb-4 border-b" style={{ borderColor: "oklch(0.92 0.006 240)" }}>
                    <div className="font-semibold text-sm mb-1" style={{ color: "oklch(0.20 0.012 240)" }}>{item.title}</div>
                    <p className="text-sm leading-relaxed mb-2" style={{ color: "oklch(0.38 0.012 240)" }}>{item.desc}</p>
                    <div className="flex items-start gap-2 rounded p-2" style={{ background: "oklch(0.97 0.010 145)" }}>
                      <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" style={{ color: "oklch(0.50 0.160 145)" }} />
                      <p className="text-xs" style={{ color: "oklch(0.35 0.012 240)" }}>{item.tip}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Section>
              <H2>Quick Reference: COT + Options Strategy Matrix</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: "oklch(0.96 0.006 240)" }}>
                      {["COT Signal", "Market Direction", "Options Strategy", "DTE", "Example"].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold border-b"
                          style={{ color: "oklch(0.30 0.012 240)", borderColor: "oklch(0.88 0.006 240)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["BULLISH (≥70)", "Expecting rally", "Bull Call Spread", "30–60 DTE", "GLD $185/$195 call spread"],
                      ["BULLISH (≥70)", "Strong conviction", "Long Call", "45–90 DTE", "GLD $185 call"],
                      ["BEARISH (≤30)", "Expecting decline", "Bear Put Spread", "30–60 DTE", "USO $70/$65 put spread"],
                      ["BEARISH (≤30)", "Strong conviction", "Long Put", "45–90 DTE", "USO $70 put"],
                      ["NEUTRAL (30–70)", "No COT edge", "No trade / use other signals", "—", "Wait for extreme"],
                    ].map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "oklch(0.99 0.002 240)" }}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 border-b"
                            style={{ color: "oklch(0.35 0.012 240)", borderColor: "oklch(0.92 0.006 240)" }}>
                            {j === 0 ? (
                              <SignalPill signal={cell.startsWith("BULL") ? "BULLISH" : cell.startsWith("BEAR") ? "BEARISH" : "NEUTRAL"} />
                            ) : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </TabsContent>

          {/* ── FAQ ── */}
          <TabsContent value="faq" className="space-y-3">
            <H2>Frequently Asked Questions</H2>
            {[
              {
                q: "How often is the COT data updated?",
                a: "The CFTC releases COT data every Friday at 3:30 PM Eastern time. The data reflects positions as of Tuesday of that week, so there is a 3-day lag. PitDesk fetches the latest data on each dashboard load and shows a freshness warning if the data is more than 8 days old.",
              },
              {
                q: "Why do we focus on Commercials and not Large Speculators?",
                a: "Commercials are hedgers with real business exposure — they know their industry better than any speculator. When a gold mining company is heavily long gold futures, they're signaling they expect gold prices to rise. Large speculators (hedge funds) are trend followers who are often most long at market tops and most short at market bottoms — they're a contrary indicator at extremes.",
              },
              {
                q: "Can a COT Index stay above 70 for a long time?",
                a: "Yes — and this is a common trap. A COT Index above 70 means commercials are positioned bullishly relative to the past year, but it doesn't mean the market will move immediately. The index can stay elevated for 4–8 weeks before price confirms. This is why Williams insists on a price confirmation trigger (10-day high breakout) before entering. Never buy just because COT is above 70.",
              },
              {
                q: "What's the difference between the COT Index and raw net position?",
                a: "Raw net position (longs minus shorts) is an absolute number that's hard to interpret without context. A net long of 100,000 contracts in gold might be historically high or historically low depending on the year. The COT Index normalizes this into a 0–100 scale using the 52-week rolling range, making it comparable across time and across different markets.",
              },
              {
                q: "Does COT work for stocks and ETFs?",
                a: "COT data is for futures markets — commodities and financial futures. It doesn't directly apply to individual stocks. However, the S&P 500 futures COT can give you a macro read on institutional positioning in equities broadly. For individual stocks, use other tools (PCR, earnings, technicals). The COT Dashboard is most useful for commodity-linked ETFs (GLD, USO, SLV, CORN) and macro futures.",
              },
              {
                q: "What is the 52-week window and why not use a longer period?",
                a: "Williams chose 52 weeks (1 year) as the normalization window because it captures a full seasonal cycle for most commodity markets. Using a longer window (3–5 years) would make the index less responsive to recent changes. Using a shorter window (13 weeks) would make it too noisy. 52 weeks is the standard in the industry and what Williams uses in his published work.",
              },
              {
                q: "How do I use COT with the PitDesk Options Strategy Analyzer?",
                a: "Use COT to identify the directional bias (bullish or bearish), then use the Strategy Analyzer to find the optimal options structure. For a bullish COT signal with moderate conviction, the Bull Call Spread is typically the best structure (defined risk, 30–60 DTE). For strong conviction, a Long Call gives more leverage. Enter the underlying symbol in the Strategy Analyzer and it will rank all 13 strategies by expected value.",
              },
              {
                q: "What happens when COT and technical analysis disagree?",
                a: "When COT says bullish but price is in a downtrend, wait. Williams' rule is that COT sets the context and price action provides the entry trigger. If the COT Index is at 80 (strongly bullish) but price is making new lows, the commercials may be early — or the market has a fundamental problem the COT doesn't capture. In those cases, wait for price to stabilize and show a reversal before acting on the COT signal.",
              },
            ].map((item, i) => (
              <FAQ key={i} q={item.q} a={item.a} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Inline icon shim (Building2 not in all versions) ─────────────────────────
function Building2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  );
}
