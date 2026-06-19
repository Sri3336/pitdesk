import { Play, ChevronRight, BookOpen, BarChart2, Bell, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  {
    number: "01",
    icon: TrendingUp,
    title: "Enter a Ticker",
    description:
      "Type any US stock or ETF ticker (e.g. AAPL, SPY, TSLA), choose your target expiry — weekly, monthly, or 6 weeks — and set your account size.",
  },
  {
    number: "02",
    icon: BarChart2,
    title: "Read the Recommendation",
    description:
      "The engine evaluates 13 strategies simultaneously using Black-Scholes pricing and a 7-dimension composite score. The top-ranked strategy is shown with a radar chart breakdown.",
  },
  {
    number: "03",
    icon: BookOpen,
    title: "Check Regime Metrics",
    description:
      "Review IV Percentile Rank, RSI-14, and MACD. If market conditions are unfavourable, a Regime Alert banner warns you before you enter a trade.",
  },
  {
    number: "04",
    icon: Bell,
    title: "Track & Alert",
    description:
      "Save recommendations to the Performance Tracker, stress-test with Scenario Analysis, size positions by risk, and set IVR Alerts to be notified when IV hits your target.",
  },
];

export default function HowTo() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="px-6 py-14 max-w-5xl mx-auto text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          How It Works
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
          Watch the 2-minute explainer to see PitDesk in
          action, then follow the step-by-step guide below.
        </p>
        <Button size="lg" className="gap-2" onClick={() => setLocation("/")}>
          <Play className="h-4 w-4" />
          Start Analyzing Now
        </Button>
      </section>

      {/* Video embed */}
      <section className="px-6 pb-14 max-w-5xl mx-auto">
        <div className="relative rounded-xl overflow-hidden border border-border shadow-2xl bg-black aspect-video">
          <video
            controls
            preload="metadata"
            poster="https://d2xsxph8kpxj0f.cloudfront.net/118490340/BheE8kSKn5XamgVXMJ6CM6/scene8-QL6X9V7erzLyookKvuJUKs.webp"
            className="w-full h-full object-contain"
          >
            <source
              src="/manus-storage/final_video_639e4d84.mp4"
              type="video/mp4"
            />
            Your browser does not support the video tag.
          </video>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-3">
          2:03 · PitDesk — Full Feature Walkthrough
        </p>
      </section>

      {/* Step-by-step guide */}
      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold mb-8 text-center">
          Step-by-Step Guide
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.number} className="border-border bg-card">
                <CardContent className="p-6 flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-emerald-400 mb-1">
                      STEP {step.number}
                    </div>
                    <h3 className="font-semibold text-base mb-1">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-20 max-w-5xl mx-auto text-center">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-10">
          <h2 className="text-2xl font-bold mb-3">Ready to find your edge?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Run your first analysis in under 30 seconds. No spreadsheets, no
            guesswork — just data-driven strategy recommendations.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button size="lg" className="gap-2" onClick={() => setLocation("/")}>
              <Play className="h-4 w-4" />
              Open Analyzer
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={() => setLocation("/glossary")}>
              <BookOpen className="h-4 w-4" />
              Browse Glossary
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={() => setLocation("/methodology")}>
              <ChevronRight className="h-4 w-4" />
              Read Methodology
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
