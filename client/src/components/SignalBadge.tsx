import type { CotSignal } from "@shared/cotTypes";
import { cn } from "@/lib/utils";

interface SignalBadgeProps {
  signal: CotSignal;
  cotIndex?: number;
  size?: "sm" | "md" | "lg";
  showIndex?: boolean;
  className?: string;
}

const signalConfig: Record<CotSignal, { label: string; classes: string }> = {
  BULLISH: {
    label: "BULLISH",
    classes: "bg-green-100 text-green-800 border border-green-300",
  },
  BEARISH: {
    label: "BEARISH",
    classes: "bg-red-100 text-red-800 border border-red-300",
  },
  NEUTRAL: {
    label: "NEUTRAL",
    classes: "bg-gray-100 text-gray-600 border border-gray-300",
  },
  LOADING: {
    label: "LOADING",
    classes: "bg-gray-50 text-gray-400 border border-gray-200 animate-pulse",
  },
};

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5 rounded",
  md: "text-xs px-2 py-1 rounded-md",
  lg: "text-sm px-3 py-1.5 rounded-md font-semibold",
};

export function SignalBadge({
  signal,
  cotIndex,
  size = "md",
  showIndex = true,
  className,
}: SignalBadgeProps) {
  const config = signalConfig[signal];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium whitespace-nowrap",
        config.classes,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
      {showIndex && cotIndex !== undefined && (
        <span className="opacity-70">({cotIndex})</span>
      )}
    </span>
  );
}
