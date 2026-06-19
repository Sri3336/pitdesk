import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  DollarSign,
  BarChart2,
  Newspaper,
  Zap,
  Globe,
  Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types (mirror server) ─────────────────────────────────────────────────────
type EventImpactLevel = "high" | "medium" | "low";
type EventCategory =
  | "earnings" | "dividend" | "split" | "analyst" | "news" | "technical"
  | "fed" | "cpi" | "nfp" | "ppi" | "fomc" | "other_macro";

interface MarketEvent {
  id: string;
  category: EventCategory;
  type: "micro" | "macro";
  title: string;
  date: string;
  daysAway: number;
  impactLevel: EventImpactLevel;
  estimatedMove?: string;
  strategyImplication: string;
  detail?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const impactColors: Record<EventImpactLevel, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const impactDot: Record<EventImpactLevel, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-green-500",
};

const categoryIcon: Record<EventCategory, React.ReactNode> = {
  earnings: <BarChart2 className="w-3.5 h-3.5" />,
  dividend: <DollarSign className="w-3.5 h-3.5" />,
  split: <Zap className="w-3.5 h-3.5" />,
  analyst: <TrendingUp className="w-3.5 h-3.5" />,
  news: <Newspaper className="w-3.5 h-3.5" />,
  technical: <BarChart2 className="w-3.5 h-3.5" />,
  fed: <Globe className="w-3.5 h-3.5" />,
  cpi: <Globe className="w-3.5 h-3.5" />,
  nfp: <Globe className="w-3.5 h-3.5" />,
  ppi: <Globe className="w-3.5 h-3.5" />,
  fomc: <Globe className="w-3.5 h-3.5" />,
  other_macro: <Globe className="w-3.5 h-3.5" />,
};

function formatDaysAway(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 0) return `In ${days}d`;
  return `${Math.abs(days)}d ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: MarketEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border rounded-lg p-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${impactDot[event.impactLevel]}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-600">{categoryIcon[event.category]}</span>
              <span className="text-sm font-medium text-slate-800 leading-tight">{event.title}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(event.date)}
              </span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${
                event.daysAway >= 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-500 border-slate-200"
              }`}>
                {formatDaysAway(event.daysAway)}
              </span>
              {event.estimatedMove && (
                <span className="text-xs text-slate-500">{event.estimatedMove}</span>
              )}
            </div>
          </div>
        </div>
        <Badge className={`text-xs flex-shrink-0 border ${impactColors[event.impactLevel]}`} variant="outline">
          {event.impactLevel.toUpperCase()}
        </Badge>
      </div>

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-600 leading-relaxed">{event.strategyImplication}</p>
          </div>
          {event.detail && event.detail !== event.title && (
            <p className="text-xs text-slate-400 italic pl-5">{event.detail}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overall Risk Banner ───────────────────────────────────────────────────────

function RiskBanner({ risk, rationale }: { risk: EventImpactLevel; rationale: string }) {
  const config = {
    high: { bg: "bg-red-50 border-red-200", text: "text-red-700", icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: "HIGH EVENT RISK" },
    medium: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, label: "MEDIUM EVENT RISK" },
    low: { bg: "bg-green-50 border-green-200", text: "text-green-700", icon: <TrendingUp className="w-4 h-4 text-green-500" />, label: "LOW EVENT RISK" },
  }[risk];

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${config.bg}`}>
      <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
      <div>
        <p className={`text-xs font-semibold tracking-wide ${config.text}`}>{config.label}</p>
        <p className={`text-xs mt-0.5 ${config.text} opacity-80`}>{rationale}</p>
      </div>
    </div>
  );
}

// ── Technical Outlook Strip ───────────────────────────────────────────────────

function TechnicalStrip({ outlook }: { outlook: { short: string; intermediate: string; long: string } }) {
  const dirIcon = (d: string) =>
    d === "Bullish" ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> :
    d === "Bearish" ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> :
    <Minus className="w-3.5 h-3.5 text-slate-400" />;

  const dirColor = (d: string) =>
    d === "Bullish" ? "text-green-700" : d === "Bearish" ? "text-red-600" : "text-slate-500";

  return (
    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
      {[
        { label: "Short-term", value: outlook.short },
        { label: "Intermediate", value: outlook.intermediate },
        { label: "Long-term", value: outlook.long },
      ].map(({ label, value }) => (
        <div key={label} className="text-center">
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <div className={`flex items-center justify-center gap-1 text-xs font-medium ${dirColor(value)}`}>
            {dirIcon(value)}
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Analyst Rating Strip ──────────────────────────────────────────────────────

function AnalystStrip({ rating }: { rating: { rating: string; targetPrice: number; provider: string } }) {
  const isBull = ["BUY", "STRONG_BUY", "OUTPERFORM", "OVERWEIGHT"].includes(rating.rating.toUpperCase());
  const isBear = ["SELL", "STRONG_SELL", "UNDERPERFORM", "UNDERWEIGHT"].includes(rating.rating.toUpperCase());
  const color = isBull ? "text-green-700 bg-green-50 border-green-200" : isBear ? "text-red-700 bg-red-50 border-red-200" : "text-slate-600 bg-slate-50 border-slate-200";

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${color}`}>
      <div>
        <p className="text-xs text-slate-400">Analyst Rating</p>
        <p className="text-sm font-semibold mt-0.5">{rating.rating}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-400">Price Target</p>
        <p className="text-sm font-semibold">${rating.targetPrice.toFixed(2)}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-400">Source</p>
        <p className="text-xs font-medium">{rating.provider}</p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface EventImpactPanelProps {
  ticker: string;
}

export function EventImpactPanel({ ticker }: EventImpactPanelProps) {
  const { data, isLoading, error } = trpc.analysis.getEvents.useQuery(
    { ticker },
    { enabled: !!ticker, staleTime: 5 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            Event Impact Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            Event Impact Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">Unable to load event data for {ticker}.</p>
        </CardContent>
      </Card>
    );
  }

  const { overallRisk, riskRationale, microEvents, macroEvents, analystRating, technicalOutlook } = data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            Event Impact Analysis
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Shows upcoming macro events (Fed, CPI, NFP) and micro events (earnings, dividends, analyst ratings) that may affect {ticker}'s price and implied volatility. Click any event to see strategy implications.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <Badge className={`text-xs border ${impactColors[overallRisk]}`} variant="outline">
            {overallRisk.toUpperCase()} RISK
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall risk banner */}
        <RiskBanner risk={overallRisk} rationale={riskRationale} />

        {/* Analyst + technical strips */}
        {analystRating && <AnalystStrip rating={analystRating} />}
        {technicalOutlook && <TechnicalStrip outlook={technicalOutlook} />}

        {/* Micro / Macro tabs */}
        <Tabs defaultValue="micro">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="micro" className="text-xs">
              Micro Events
              {microEvents.length > 0 && (
                <span className="ml-1.5 bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                  {microEvents.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="macro" className="text-xs">
              Macro Events
              {macroEvents.length > 0 && (
                <span className="ml-1.5 bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                  {macroEvents.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="micro" className="mt-3 space-y-2">
            {microEvents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No micro events found for {ticker}.</p>
            ) : (
              microEvents.map(event => <EventCard key={event.id} event={event} />)
            )}
          </TabsContent>

          <TabsContent value="macro" className="mt-3 space-y-2">
            <p className="text-xs text-slate-400 mb-2">
              Upcoming macro events that may affect broad market conditions and sector sentiment.
            </p>
            {macroEvents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No upcoming macro events.</p>
            ) : (
              macroEvents.map(event => <EventCard key={event.id} event={event} />)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
