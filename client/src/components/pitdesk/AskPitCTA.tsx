/**
 * AskPitCTA — Canonical PitDesk component
 * ─────────────────────────────────────────────────────────────
 * A deep-link CTA button/banner that navigates to Pit Advisor
 * with a pre-filled prompt. Used on TickerAnalysis, DayTradingPicks,
 * SwingTradingPicks, and TradeUpload.
 *
 * Usage:
 *   import { AskPitCTA } from "@/components/pitdesk/AskPitCTA";
 *   <AskPitCTA prompt="Analyze NVDA Bull Put Spread..." />
 *   <AskPitCTA prompt="..." variant="banner" />
 *   <AskPitCTA prompt="..." variant="button" label="Ask Pit" />
 */

import { Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";

interface AskPitCTAProps {
  /** Pre-filled prompt text sent to Pit Advisor */
  prompt: string;
  /** Visual variant. "banner" = full-width card. "button" = inline button. */
  variant?: "banner" | "button";
  /** Override the button/banner label */
  label?: string;
  /** Override the sub-label shown in banner variant */
  subLabel?: string;
  className?: string;
}

export function AskPitCTA({
  prompt,
  variant = "banner",
  label = "Ask Pit Advisor for a full trade plan",
  subLabel,
  className = "",
}: AskPitCTAProps) {
  const [, navigate] = useLocation();

  const handleClick = () => {
    navigate(`${ROUTES.PIT_ADVISOR}?prompt=${encodeURIComponent(prompt)}`);
  };

  if (variant === "button") {
    return (
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors ${className}`}
      >
        <Sparkles className="w-4 h-4" />
        {label}
      </button>
    );
  }

  // Banner variant
  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 transition-colors text-left group ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 transition-colors">
        <Sparkles className="w-5 h-5 text-violet-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-violet-700">{label}</p>
        {subLabel && (
          <p className="text-xs text-violet-500 mt-0.5 truncate">{subLabel}</p>
        )}
      </div>
      <span className="text-violet-400 group-hover:text-violet-600 transition-colors text-lg">→</span>
    </button>
  );
}
