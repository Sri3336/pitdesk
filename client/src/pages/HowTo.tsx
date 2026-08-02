import { Play, ChevronRight, BookOpen, BarChart2, Bell, TrendingUp, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const YOUTUBE_VIDEO_ID = "SLp6xOHDiEA";

const CHAPTERS = [
  { time: "0:00", label: "Introduction — why most traders lose" },
  { time: "0:18", label: "The Thesis — price action + 2–3 indicators" },
  { time: "0:45", label: "CTA Flow — the $360B 50-day MA trigger" },
  { time: "1:15", label: "Navigation — 3 places to find the card" },
  { time: "1:35", label: "The Verdict — GO / CAUTION / NO-GO" },
  { time: "2:00", label: "Signal Checklist — 7 signals explained" },
  { time: "2:30", label: "Conflict Warning — CTA vs trend" },
  { time: "2:50", label: "ATR Strike Sizing — strangle & spread widths" },
  { time: "3:05", label: "Refresh Button — intraday VWAP & volume" },
  { time: "3:18", label: "Summary — the 3-step workflow" },
];

const STEPS = [
  {
    number: "01",
    icon: TrendingUp,
    title: "Open the Trade Setup Card",
    description:
      "Type any US ticker on the Home page Quick-Look widget, the Ticker Analysis page, or the Goal Scan results. The card loads in seconds with a full signal analysis.",
  },
  {
    number: "02",
    icon: BarChart2,
    title: "Read the Verdict",
    description:
      "GO / CAUTION / NO-GO at the top — a 10-point score across 7 signals: Trend, CTA Flow (50-day MA), Volume, VWAP, RSI, IV Rank, and MA20. The execution summary tells you exactly what to do.",
  },
  {
    number: "03",
    icon: CheckCircle2,
    title: "Check the Signal Checklist",
    description:
      "7 rows with colored dots — green (confirmed), yellow (neutral), red (against you). Check the CTA Flow panel for the $360B systematic fund alignment. Watch for the orange Conflict Warning.",
  },
  {
    number: "04",
    icon: Bell,
    title: "Size and Execute",
    description:
      "Use the ATR Strike Sizing box: 1.5x ATR for strangle width, 1x ATR for spread width. Hit Refresh before entry to get the latest intraday VWAP and relative volume.",
  },
];

export default function HowTo() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="px-6 py-12 max-w-5xl mx-auto text-center">
        <Badge variant="outline" className="mb-4 text-green-600 border-green-300 bg-green-50">
          Featured Tutorial
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Trade Setup Card — Step-by-Step Guide
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">
          Learn how to use PitDesk's signal confirmation system: price action first, CTA flow second, one verdict to act on.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button size="lg" className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => setLocation("/ticker-analysis")}>
            <Play className="h-4 w-4" />
            Open Ticker Analysis
          </Button>
          <Button size="lg" variant="outline" className="gap-2" onClick={() => window.open(`https://youtu.be/${YOUTUBE_VIDEO_ID}`, "_blank")}>
            <ExternalLink className="h-4 w-4" />
            Watch on YouTube
          </Button>
        </div>
      </section>

      {/* Featured Video */}
      <section className="px-6 pb-10 max-w-5xl mx-auto">
        <div className="rounded-xl overflow-hidden border border-border shadow-2xl bg-black aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0&modestbranding=1`}
            title="PitDesk — Trade Setup Card: Step-by-Step Walkthrough"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
        <div className="flex items-center justify-between mt-3 px-1">
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            4:36 · Trade Setup Card — Full Walkthrough
          </p>
          <a
            href={`https://youtu.be/${YOUTUBE_VIDEO_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Open on YouTube
          </a>
        </div>
      </section>

      {/* Chapter List */}
      <section className="px-6 pb-12 max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold mb-4">Video Chapters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHAPTERS.map((ch, i) => (
            <a
              key={i}
              href={`https://youtu.be/${YOUTUBE_VIDEO_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-green-400 hover:bg-green-50/5 transition-colors group"
            >
              <span className="text-xs font-mono text-green-500 w-10 shrink-0">{ch.time}</span>
              <span className="text-sm text-foreground group-hover:text-green-600 transition-colors">{ch.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0 group-hover:text-green-500" />
            </a>
          ))}
        </div>
      </section>

      {/* Step-by-step guide */}
      <section className="px-6 pb-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold mb-2 text-center">The 4-Step Workflow</h2>
        <p className="text-center text-muted-foreground text-sm mb-8">Follow these steps every time you evaluate a trade</p>
        <div className="grid gap-5 md:grid-cols-2">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.number} className="border-border bg-card">
                <CardContent className="p-6 flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-green-500 mb-1">STEP {step.number}</div>
                    <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Quick Reference */}
      <section className="px-6 pb-16 max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold mb-4">Quick Reference</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 bg-green-50/10 p-4">
            <div className="text-2xl font-black text-green-600 mb-1">GO</div>
            <div className="text-sm font-medium text-foreground mb-1">Score 7–10 / 10</div>
            <p className="text-xs text-muted-foreground">All systems aligned. Execute at full size.</p>
          </div>
          <div className="rounded-xl border border-yellow-200 bg-yellow-50/10 p-4">
            <div className="text-2xl font-black text-yellow-600 mb-1">CAUTION</div>
            <div className="text-sm font-medium text-foreground mb-1">Score 4–6 / 10</div>
            <p className="text-xs text-muted-foreground">Mixed signals. Reduce size or wait for one more confirmation.</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/10 p-4">
            <div className="text-2xl font-black text-red-600 mb-1">NO-GO</div>
            <div className="text-sm font-medium text-foreground mb-1">Score 0–3 / 10</div>
            <p className="text-xs text-muted-foreground">Signals fighting each other. Do not enter.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-20 max-w-5xl mx-auto text-center">
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-10">
          <h2 className="text-2xl font-bold mb-3">Ready to trade with conviction?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Open the Trade Setup Card for any ticker. Price action first. CTA flow second. One verdict to act on.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button size="lg" className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => setLocation("/ticker-analysis")}>
              <Play className="h-4 w-4" />
              Open Ticker Analysis
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={() => setLocation("/goal-scan")}>
              <BarChart2 className="h-4 w-4" />
              Run Goal Scan
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={() => setLocation("/glossary")}>
              <BookOpen className="h-4 w-4" />
              Browse Glossary
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
