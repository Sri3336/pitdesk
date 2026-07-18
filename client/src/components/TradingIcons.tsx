/**
 * TradingIcons.tsx — Custom SVG icons for PitDesk navigation
 *
 * Each icon is purpose-built to communicate the outcome, not just the tool.
 * No generic Lucide icons — these are bespoke trading visuals.
 */

import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Scan — Radar sweep with a signal blip. "Show me what's worth trading today." */
export function ScanIcon({ size = 24, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Radar arcs */}
      <path d="M12 12 L20 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.3" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.25" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.4" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.6" />
      {/* Sweep line */}
      <path d="M12 12 L19.5 7.5" stroke="currentColor" strokeWidth={strokeWidth + 0.5} strokeLinecap="round" />
      {/* Signal blip */}
      <circle cx="18" cy="7" r="1.5" fill="currentColor" />
      {/* Center dot */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** Analyze — Crosshair locked on a candlestick. "I have a ticker — what's the best trade?" */
export function AnalyzeIcon({ size = 24, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Candlestick body */}
      <rect x="10" y="8" width="4" height="8" rx="0.5" stroke="currentColor" strokeWidth={strokeWidth} />
      {/* Wicks */}
      <line x1="12" y1="5" x2="12" y2="8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1="12" y1="16" x2="12" y2="19" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Crosshair horizontal */}
      <line x1="3" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      <line x1="15.5" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      {/* Crosshair vertical */}
      <line x1="12" y1="3" x2="12" y2="4.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      <line x1="12" y1="19.5" x2="12" y2="21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      {/* Corner ticks */}
      <path d="M3 8 L3 3 L8 3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <path d="M21 8 L21 3 L16 3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <path d="M3 16 L3 21 L8 21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <path d="M21 16 L21 21 L16 21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  );
}

/** Lab — Payoff curve (hockey stick shape). "I want to test a specific structure." */
export function LabIcon({ size = 24, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Axes */}
      <line x1="3" y1="19" x2="21" y2="19" stroke="currentColor" strokeWidth={strokeWidth * 0.7} strokeLinecap="round" opacity="0.4" />
      <line x1="3" y1="3" x2="3" y2="19" stroke="currentColor" strokeWidth={strokeWidth * 0.7} strokeLinecap="round" opacity="0.4" />
      {/* Breakeven line (dashed) */}
      <line x1="3" y1="14" x2="21" y2="14" stroke="currentColor" strokeWidth={strokeWidth * 0.6} strokeDasharray="2 2" opacity="0.3" />
      {/* Payoff curve — flat loss then hockey stick up */}
      <path
        d="M3 14 L8 14 Q10 14 11 13 L14 8 L17 5 L21 3"
        stroke="currentColor"
        strokeWidth={strokeWidth + 0.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Fill under curve (profit zone) */}
      <path
        d="M11 13 L14 8 L17 5 L21 3 L21 19 L11 19 Z"
        fill="currentColor"
        opacity="0.08"
      />
      {/* Breakeven dot */}
      <circle cx="11" cy="14" r="1.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

/** Advisor — Brain with circuit traces. "Talk me through this trade." */
export function AdvisorIcon({ size = 24, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Brain outline — left hemisphere */}
      <path
        d="M12 4 C8 4 5 7 5 10 C5 11.5 5.5 12.8 6.5 13.8 C6 14.3 5.5 15 5.5 16 C5.5 17.7 6.8 19 8.5 19 L12 19"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Brain outline — right hemisphere */}
      <path
        d="M12 4 C16 4 19 7 19 10 C19 11.5 18.5 12.8 17.5 13.8 C18 14.3 18.5 15 18.5 16 C18.5 17.7 17.2 19 15.5 19 L12 19"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center divide */}
      <line x1="12" y1="4" x2="12" y2="19" stroke="currentColor" strokeWidth={strokeWidth * 0.6} strokeDasharray="2 1.5" opacity="0.4" />
      {/* Circuit nodes */}
      <circle cx="8" cy="10" r="1" fill="currentColor" opacity="0.7" />
      <circle cx="16" cy="10" r="1" fill="currentColor" opacity="0.7" />
      <circle cx="9" cy="14" r="1" fill="currentColor" opacity="0.7" />
      <circle cx="15" cy="14" r="1" fill="currentColor" opacity="0.7" />
      {/* Circuit traces */}
      <path d="M8 10 L9 14" stroke="currentColor" strokeWidth={strokeWidth * 0.7} opacity="0.5" />
      <path d="M16 10 L15 14" stroke="currentColor" strokeWidth={strokeWidth * 0.7} opacity="0.5" />
      <path d="M9 14 L12 16 L15 14" stroke="currentColor" strokeWidth={strokeWidth * 0.7} opacity="0.5" />
    </svg>
  );
}

/** Journal — Open book with a P&L trend line. "Review my trades and learn." */
export function JournalIcon({ size = 24, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Book left page */}
      <path
        d="M12 5 L5 5 C4.4 5 4 5.4 4 6 L4 19 C4 19.6 4.4 20 5 20 L12 20"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Book right page */}
      <path
        d="M12 5 L19 5 C19.6 5 20 5.4 20 6 L20 19 C20 19.6 19.6 20 19 20 L12 20"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Spine */}
      <line x1="12" y1="5" x2="12" y2="20" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* P&L trend line on right page */}
      <path
        d="M14 15 L15.5 12 L17 13.5 L18.5 10"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* Text lines on left page */}
      <line x1="6" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth={strokeWidth * 0.7} strokeLinecap="round" opacity="0.5" />
      <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth={strokeWidth * 0.7} strokeLinecap="round" opacity="0.5" />
      <line x1="6" y1="15" x2="9" y2="15" stroke="currentColor" strokeWidth={strokeWidth * 0.7} strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** Playbook — Shield with a chess knight. "My rules, my style, my edge." */
export function PlaybookIcon({ size = 24, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Shield */}
      <path
        d="M12 3 L20 6.5 L20 12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 L4 6.5 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Chess knight — simplified */}
      <path
        d="M10 16 L10 14 C10 13 9 12 9 11 C9 9.5 10 8.5 11 8 L13 8 C13 8 14 9 14 10 L12.5 10 C12.5 10 13.5 11 13.5 12 L13.5 16 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <line x1="9.5" y1="16" x2="14.5" y2="16" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/** PitDesk Logo Mark — A-shaped shark fin */
export function PitDeskMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      {/* Shark fin / A shape */}
      <path
        d="M4 28 L16 4 L28 28"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Crossbar of A */}
      <path
        d="M9 20 L23 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Water line / base wave */}
      <path
        d="M2 28 Q8 25 16 28 Q24 31 30 28"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

/** QuickProof bar component — compact win rate visualization for strategy cards */
export function QuickProofBar({
  winRate,
  totalTrades,
  avgPnlPct,
  maxDrawdownPct,
  dataMonths,
  hasData,
}: {
  winRate: number;
  totalTrades: number;
  avgPnlPct: number;
  maxDrawdownPct: number;
  dataMonths: number;
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
        <span>No local data — run Historical Data sync</span>
      </div>
    );
  }

  const barColor =
    winRate >= 60 ? "bg-green-500" :
    winRate >= 45 ? "bg-yellow-500" :
    "bg-red-500";

  const label =
    winRate >= 60 ? "Strong" :
    winRate >= 45 ? "Mixed" :
    "Weak";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">Quick Proof</span>
        <span className="text-muted-foreground">{dataMonths}mo data · {totalTrades} trades</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Win rate bar */}
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(winRate, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-semibold tabular-nums ${
          winRate >= 60 ? "text-green-600" : winRate >= 45 ? "text-yellow-600" : "text-red-600"
        }`}>
          {winRate}% {label}
        </span>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>Avg P&L: <span className={avgPnlPct >= 0 ? "text-green-600" : "text-red-600"}>{avgPnlPct >= 0 ? "+" : ""}{avgPnlPct}%</span></span>
        <span>Max DD: <span className="text-red-600">-{maxDrawdownPct}%</span></span>
      </div>
    </div>
  );
}
