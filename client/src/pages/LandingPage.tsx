import React, { useState, useRef } from "react";
// Login goes to the custom email/password sign-in page
const LOGIN_PATH = "/signin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Newspaper,
  Shield,
  Search,
  Zap,
  ArrowRight,
} from "lucide-react";

// ── Railway-served visual assets ─────────────────────────────────────────────
const DOODLE_IMAGES = [
  "/brand-assets/landing/doodle_01_intro_b7892226.png",
  "/brand-assets/landing/doodle_02_daily_scan_ed1b1543.png",
  "/brand-assets/landing/doodle_03_phase_aaac6656.png",
  "/brand-assets/landing/doodle_04_confluence_1a2b5d08.png",
  "/brand-assets/landing/doodle_05_backtest_8582c938.png",
  "/brand-assets/landing/doodle_06_news_exit_56b06782.png",
];
const VIDEO_URL = "/brand-assets/landing/pitdesk_synced_final_6c504b6d.mp4";

// ── 6-Step data ─────────────────────────────────────────────────────────────
const STEPS = [
  {
    number: "01",
    icon: Search,
    title: "Daily Scan",
    color: "from-green-50 to-emerald-50 border-green-200",
    badge: "bg-green-100 text-green-800",
    iconColor: "text-green-600",
    description:
      "Every morning PitDesk scans 60 tickers and ranks them by confluence score. You don't pick a ticker — the system surfaces the best setup of the day.",
    stat: "60 tickers ranked daily",
    image: DOODLE_IMAGES[1],
  },
  {
    number: "02",
    icon: TrendingUp,
    title: "Phase Detection",
    color: "from-indigo-50 to-blue-50 border-indigo-200",
    badge: "bg-indigo-100 text-indigo-800",
    iconColor: "text-indigo-600",
    description:
      "Is the stock trending, consolidating, or coiling? Trending = Bear/Bull Spread. Consolidating = Iron Condor. Coiling = wait. Never sell premium into a squeeze.",
    stat: "3 phases, 3 strategies",
    image: DOODLE_IMAGES[2],
  },
  {
    number: "03",
    icon: Zap,
    title: "Confluence Score",
    color: "from-yellow-50 to-amber-50 border-yellow-200",
    badge: "bg-yellow-100 text-yellow-800",
    iconColor: "text-yellow-600",
    description:
      "Four tiers must agree — CTA Flow, PCR Signal, VWAP, and Trend. When all four align, the score hits 6/8 or higher. That's your green light.",
    stat: "4 tiers, 8-point score",
    image: DOODLE_IMAGES[3],
  },
  {
    number: "04",
    icon: BarChart3,
    title: "Backtest Tier",
    color: "from-purple-50 to-violet-50 border-purple-200",
    badge: "bg-purple-100 text-purple-800",
    iconColor: "text-purple-600",
    description:
      "Two years of data. 8,521 signals across 60 tickers. Tier A = 77% win rate, full size. Tier D = skip it, even if the setup looks perfect.",
    stat: "8,521 signals backtested",
    image: DOODLE_IMAGES[4],
  },
  {
    number: "05",
    icon: Newspaper,
    title: "News Pulse",
    color: "from-orange-50 to-red-50 border-orange-200",
    badge: "bg-orange-100 text-orange-800",
    iconColor: "text-orange-600",
    description:
      "The numbers tell you what the market is doing. News tells you why. One headline can invalidate a perfect chart. 30 seconds. Check it before you enter.",
    stat: "Live headlines + LLM sentiment",
    image: DOODLE_IMAGES[5],
  },
  {
    number: "06",
    icon: Shield,
    title: "Trade Monitor",
    color: "from-teal-50 to-cyan-50 border-teal-200",
    badge: "bg-teal-100 text-teal-800",
    iconColor: "text-teal-600",
    description:
      "Entry is solved. Exit is automated. Once you're in, PitDesk watches the confluence in real time. When the score drops or the phase changes — you get an alert: HOLD, REVIEW, or EXIT NOW.",
    stat: "Real-time exit alerts",
    image: DOODLE_IMAGES[0],
  },
];

// ── Video Player ─────────────────────────────────────────────────────────────
function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white group cursor-pointer" onClick={toggle}>
      <video
        ref={videoRef}
        src={VIDEO_URL}
        className="w-full aspect-video object-cover"
        onEnded={() => setPlaying(false)}
        playsInline
      />
      {/* Play/Pause overlay */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
          playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
        }`}
      >
        <div className="w-16 h-16 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
          {playing ? (
            <Pause className="w-7 h-7 text-gray-800" />
          ) : (
            <Play className="w-7 h-7 text-gray-800 ml-1" />
          )}
        </div>
      </div>
      {/* Duration badge */}
      {!playing && (
        <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs font-medium px-2 py-1 rounded">
          1:52
        </div>
      )}
    </div>
  );
}

// ── Step Card ────────────────────────────────────────────────────────────────
function StepCard({ step, index }: { step: typeof STEPS[0]; index: number }) {
  const Icon = step.icon;
  const isEven = index % 2 === 0;

  return (
    <div
      className={`flex flex-col ${isEven ? "md:flex-row" : "md:flex-row-reverse"} gap-8 items-center`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Image */}
      <div className="w-full md:w-1/2">
        <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100">
          <img
            src={step.image}
            alt={`Step ${step.number}: ${step.title}`}
            className="w-full aspect-video object-cover bg-white"
            loading="lazy"
          />
        </div>
      </div>

      {/* Content */}
      <div className="w-full md:w-1/2 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-5xl font-black text-gray-100 leading-none select-none tabular-nums">{step.number}</span>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${step.color}`}>
            <Icon className={`w-4 h-4 ${step.iconColor}`} />
            <span className={`text-sm font-semibold ${step.iconColor}`}>{step.title}</span>
          </div>
        </div>
        <p className="text-gray-700 text-base leading-relaxed">{step.description}</p>
        <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${step.badge}`}>
          <span>{step.stat}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/brand-assets/pitdesk-icon-v3.png" alt="PitDesk" className="h-7 w-7" />
            <span className="font-black text-lg tracking-tight text-gray-900">PitDesk</span>
          </div>
          <a href={LOGIN_PATH}>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-semibold">
              Open PitDesk <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-28 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-semibold px-3 py-1">
            Personal Trading Intelligence Platform
          </Badge>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-gray-900 leading-tight">
            The{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-green-600">6-Step</span>
              <span
                className="absolute bottom-1 left-0 right-0 h-3 bg-green-100 -z-0 rounded"
                aria-hidden
              />
            </span>{" "}
            Trade Filter
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Know what to trade. Know why it wins.
            <br />
            Six questions. If all six point the same direction, you enter.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a href={LOGIN_PATH}>
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 h-12 text-base shadow-lg shadow-green-200">
                Open PitDesk <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
            <a href="#how-it-works">
              <Button size="lg" variant="outline" className="h-12 text-base font-semibold text-gray-700 border-gray-200 hover:bg-gray-50">
                See How It Works <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
          </div>
          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />60 tickers scanned daily</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />8,521 backtested signals</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />2 years of data</span>
          </div>
        </div>
      </section>

      {/* ── Video Section ─────────────────────────────────────────────────── */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-6">
            Watch the 2-minute explainer
          </p>
          <VideoPlayer />
        </div>
      </section>

      {/* ── 6-Step Framework ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">
              How It Works
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Six filters. One decision. Every trade goes through the same process.
            </p>
          </div>

          <div className="space-y-20">
            {STEPS.map((step, i) => (
              <StepCard key={step.number} step={step} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-gray-900 text-white">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/brand-assets/pitdesk-icon-v3.png" alt="PitDesk" className="h-10 w-10" />
            <span className="font-black text-2xl tracking-tight">PitDesk</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black leading-tight">
            Entry is solved.<br />
            <span className="text-green-400">Exit is automated.</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Two years of backtest data. 8,521 signals. 60 tickers.<br />
            The edge is in the filter, not the feeling.
          </p>
          <a href={LOGIN_PATH}>
            <Button
              size="lg"
              className="bg-green-500 hover:bg-green-400 text-white font-bold px-10 h-13 text-lg shadow-xl shadow-green-900/30 mt-2"
            >
              Open PitDesk <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </a>
          <p className="text-gray-600 text-sm">trading.akulaz.ai</p>
        </div>
      </section>
    </div>
  );
}
