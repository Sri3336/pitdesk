import { Link } from "wouter";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, BookOpen, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalBadge } from "@/components/SignalBadge";

export default function COTMethodology() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back nav */}
      <Link href="/cot">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          COT Dashboard
        </Button>
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">COT Methodology</h1>
        </div>
        <p className="text-sm text-gray-500">
          Larry Williams' Commitment of Traders approach — using commercial hedger positioning as a contrarian signal
        </p>
      </div>

      {/* What is COT */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What is the COT Report?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-3">
          <p>
            The <strong>Commitment of Traders (COT) report</strong> is published weekly by the U.S. Commodity Futures
            Trading Commission (CFTC). It breaks down the open interest in futures markets into three trader
            categories:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="font-semibold text-blue-800 mb-1">Commercial Hedgers</p>
              <p className="text-xs text-blue-700">
                Producers, processors, and merchants who use futures to hedge real business exposure.
                Considered "smart money" — they know their industry best.
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="font-semibold text-amber-800 mb-1">Non-Commercial (Speculators)</p>
              <p className="text-xs text-amber-700">
                Large hedge funds and managed money. Trend-followers who are often wrong at extremes.
                Their extreme positioning is a contrarian indicator.
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <p className="font-semibold text-gray-700 mb-1">Non-Reportable</p>
              <p className="text-xs text-gray-600">
                Small traders below reporting thresholds. Generally considered noise and not used
                in the Williams methodology.
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Data source: CFTC Socrata API (free, public). Reports are released every Friday at 3:30 PM ET,
            reflecting positions as of the prior Tuesday.
          </p>
        </CardContent>
      </Card>

      {/* COT Index Formula */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Larry Williams COT Index Formula</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-4">
          <p>
            Larry Williams popularized using the <strong>commercial net position</strong> (longs minus shorts)
            as the primary signal, normalized into a 0–100 index over a rolling lookback window.
          </p>

          {/* Formula box */}
          <div className="bg-gray-900 text-green-400 font-mono text-sm rounded-lg p-4 space-y-2">
            <div className="text-gray-400 text-xs">// Step 1: Compute commercial net position each week</div>
            <div>CommNet = CommercialLong − CommercialShort</div>
            <div className="mt-2 text-gray-400 text-xs">// Step 2: Find min/max over 52-week lookback</div>
            <div>Min = MIN(CommNet, 52 weeks)</div>
            <div>Max = MAX(CommNet, 52 weeks)</div>
            <div className="mt-2 text-gray-400 text-xs">// Step 3: Normalize to 0–100</div>
            <div>COT Index = (Current − Min) / (Max − Min) × 100</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-green-200 bg-green-50 rounded-md p-3 text-center">
              <SignalBadge signal="BULLISH" cotIndex={75} size="lg" className="mb-2" />
              <p className="text-xs text-green-700">
                COT Index ≥ 75. Commercials are near their most bullish positioning in 52 weeks.
                High-probability long setup.
              </p>
            </div>
            <div className="border border-gray-200 bg-gray-50 rounded-md p-3 text-center">
              <SignalBadge signal="NEUTRAL" cotIndex={50} size="lg" className="mb-2" />
              <p className="text-xs text-gray-600">
                COT Index 25–74. No strong directional signal from commercials.
                Use other indicators.
              </p>
            </div>
            <div className="border border-red-200 bg-red-50 rounded-md p-3 text-center">
              <SignalBadge signal="BEARISH" cotIndex={25} size="lg" className="mb-2" />
              <p className="text-xs text-red-700">
                COT Index ≤ 25. Commercials are near their most bearish positioning in 52 weeks.
                High-probability short setup.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Why commercials */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Why Focus on Commercial Hedgers?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-3">
          <p>
            Williams' key insight is that <strong>commercial hedgers are contrarian by nature</strong>. A gold
            miner hedges (sells futures) when prices are high and buys futures when prices are low to lock in
            production costs. Their extreme positioning therefore tends to precede reversals.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <TrendingUp className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800 text-xs">Bullish Setup (COT ≥ 75)</p>
                <p className="text-green-700 text-xs mt-1">
                  Commercials are net long at extreme levels → they expect prices to rise.
                  Speculators are likely net short (contrarian confirmation).
                  Look for long entries on pullbacks.
                </p>
              </div>
            </div>
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <TrendingDown className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 text-xs">Bearish Setup (COT ≤ 25)</p>
                <p className="text-red-700 text-xs mt-1">
                  Commercials are net short at extreme levels → they expect prices to fall.
                  Speculators are likely net long (contrarian confirmation).
                  Look for short entries on rallies.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trading implications */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trading Implications for Options</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">COT Signal</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Directional Bias</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Options Strategies</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Avoid</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">
                    <SignalBadge signal="BULLISH" size="sm" showIndex={false} />
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-green-700 font-medium">Long / Bullish</td>
                  <td className="border border-gray-200 px-3 py-2">Long calls, Bull call spreads, Cash-secured puts, Synthetic longs</td>
                  <td className="border border-gray-200 px-3 py-2 text-red-600">Naked calls, Bear spreads</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2">
                    <SignalBadge signal="NEUTRAL" size="sm" showIndex={false} />
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-gray-600">Range-bound</td>
                  <td className="border border-gray-200 px-3 py-2">Iron condors, Short strangles, Calendar spreads</td>
                  <td className="border border-gray-200 px-3 py-2 text-gray-500">Strong directional bets</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">
                    <SignalBadge signal="BEARISH" size="sm" showIndex={false} />
                  </td>
                  <td className="border border-gray-200 px-3 py-2 text-red-700 font-medium">Short / Bearish</td>
                  <td className="border border-gray-200 px-3 py-2">Long puts, Bear put spreads, Covered calls, Synthetic shorts</td>
                  <td className="border border-gray-200 px-3 py-2 text-red-600">Naked puts, Bull spreads</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Limitations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Limitations & Caveats
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-2">
          <ul className="space-y-2 list-disc list-inside text-gray-600">
            <li>
              <strong>COT is a timing tool, not a trigger.</strong> A bullish COT reading can persist for weeks
              before prices move. Always confirm with price action (breakouts, trend confirmation).
            </li>
            <li>
              <strong>3-day data lag.</strong> Reports reflect positions as of Tuesday, released Friday.
              Fast-moving markets can shift significantly in that window.
            </li>
            <li>
              <strong>Works best in commodity markets.</strong> Gold, crude oil, grains, and currencies have
              the longest track records. Equity index COT is less reliable due to hedging complexity.
            </li>
            <li>
              <strong>52-week lookback is standard</strong> but can be adjusted. Shorter windows (26 weeks)
              are more sensitive; longer windows (3 years) are more conservative.
            </li>
            <li>
              <strong>Not a standalone system.</strong> Combine with technical analysis (trend, support/resistance,
              volume) and fundamental catalysts for highest-probability setups.
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* References */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">References</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-1">
          <p>
            <strong>Larry Williams</strong> — "Trade Stocks and Commodities with the Insiders: Secrets of the COT Report" (2005)
          </p>
          <p>
            <strong>CFTC</strong> —{" "}
            <a
              href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Official COT Report page
            </a>
          </p>
          <p>
            <strong>Data API</strong> —{" "}
            <a
              href="https://publicreporting.cftc.gov/resource/jun7-fc8e.json"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              CFTC Socrata API (free, no auth)
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
