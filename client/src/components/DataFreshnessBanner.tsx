import { AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataFreshnessBannerProps {
  latestDate: string;
  dataAge: number; // days since last report
  className?: string;
}

export function DataFreshnessBanner({ latestDate, dataAge, className }: DataFreshnessBannerProps) {
  // 999 is a sentinel value from the backend meaning "data unavailable" — show a neutral message
  if (dataAge >= 999 || !latestDate) {
    return (
      <div className={cn("flex items-center gap-2 text-sm px-3 py-2 rounded-md border bg-gray-50 border-gray-200 text-gray-500", className)}>
        <Clock className="h-4 w-4 shrink-0" />
        <span>CFTC data unavailable — will update when next report is released.</span>
      </div>
    );
  }

  const isStale = dataAge > 10;
  const isVeryStale = dataAge > 21;

  const formattedDate = new Date(latestDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm px-3 py-2 rounded-md border",
        isVeryStale
          ? "bg-red-50 border-red-200 text-red-700"
          : isStale
          ? "bg-amber-50 border-amber-200 text-amber-700"
          : "bg-green-50 border-green-200 text-green-700",
        className
      )}
    >
      {isVeryStale ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : isStale ? (
        <Clock className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle className="h-4 w-4 shrink-0" />
      )}
      <span>
        CFTC data as of <strong>{formattedDate}</strong>
        {isVeryStale
          ? ` — ${dataAge} days old. Data may be significantly delayed.`
          : isStale
          ? ` — ${dataAge} days old. Check CFTC for latest release.`
          : ` — ${dataAge} day${dataAge === 1 ? "" : "s"} old. Data is current.`}
      </span>
    </div>
  );
}
