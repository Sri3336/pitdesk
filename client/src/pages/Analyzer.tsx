import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

export default function Analyzer() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-500" />
          Options Strategy Analyzer
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          13 strategies with Black-Scholes engine — coming soon
        </p>
      </div>
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground border border-dashed border-border rounded-xl">
        <div className="text-4xl">🚧</div>
        <div className="text-lg font-medium">Options Analyzer</div>
        <div className="text-sm text-center max-w-xs">
          Full options strategy analyzer with 13 strategies, Black-Scholes pricing, and Greeks dashboard coming soon.
        </div>
      </div>
    </div>
  );
}
