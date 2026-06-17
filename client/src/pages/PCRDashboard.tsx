import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart2, RefreshCw, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PCRResult {
  ticker: string;
  pcr: number;
  callVolume: number;
  putVolume: number;
  signal: "bullish" | "bearish" | "neutral";
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function signalBadge(signal: string) {
  if (signal === "bullish") return <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]"><TrendingUp className="h-2.5 w-2.5 mr-0.5" />Bullish</Badge>;
  if (signal === "bearish") return <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]"><TrendingDown className="h-2.5 w-2.5 mr-0.5" />Bearish</Badge>;
  return <Badge variant="outline" className="text-[10px]">Neutral</Badge>;
}

export default function PCRDashboard() {
  const [started, setStarted] = useState(false);
  const pcrQuery = trpc.pcr.scan.useQuery(undefined, { enabled: started, staleTime: 5 * 60 * 1000 });
  const results = (pcrQuery.data as PCRResult[] | undefined) ?? [];

  const handleScan = () => {
    setStarted(true);
    pcrQuery.refetch();
    toast.info("Fetching PCR data for 60 tickers…");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-purple-500" />
            PCR Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Put/Call ratio for 60 tickers — PCR &lt; 0.7 = bullish, PCR &gt; 1.0 = bearish
          </p>
        </div>
        <Button onClick={handleScan} disabled={pcrQuery.isFetching} className="bg-green-500 hover:bg-green-600 text-white shrink-0">
          {pcrQuery.isFetching ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          {pcrQuery.isFetching ? "Loading…" : "Load PCR Data"}
        </Button>
      </div>

      {!started ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <BarChart2 className="h-8 w-8 text-purple-300" />
          <div className="text-sm font-medium">Click "Load PCR Data" to fetch Put/Call ratios</div>
        </div>
      ) : pcrQuery.isFetching ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin text-purple-500 mr-2" />
          Loading PCR data for 60 tickers…
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <div className="text-sm">No PCR data available</div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">PCR</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Call Vol</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Put Vol</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Signal</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.ticker} className="border-b border-border hover:bg-accent/30">
                  <td className="px-3 py-2.5 font-bold">{r.ticker}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmt(r.pcr)}</td>
                  <td className="px-3 py-2.5 text-right text-green-600">{r.callVolume.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-red-500">{r.putVolume.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-center">{signalBadge(r.signal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
