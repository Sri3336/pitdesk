import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";

import AuthGuard from "./components/AuthGuard";
import OwnerOnlyGuard from "./components/OwnerOnlyGuard";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages that manage their own full-height layout — no outer scroll wrapper
const FULL_HEIGHT_ROUTES = ["/pit-advisor"];

function ScrollableRoute({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isFullHeight = FULL_HEIGHT_ROUTES.some(
    r => location === r || location.startsWith(r + "/")
  );
  if (isFullHeight) return <>{children}</>;
  return <div className="h-full overflow-y-auto">{children}</div>;
}

// Auth pages (public — no AuthGuard)
const SignIn = lazy(() => import("./pages/SignIn"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Action pages (use ActionLayout — no sidebar)
const TickerAnalysis = lazy(() => import("./pages/TickerAnalysis"));
const DayTradingPicks = lazy(() => import("./pages/DayTradingPicks"));
const SwingTradingPicks = lazy(() => import("./pages/SwingTradingPicks"));

// Core pages
const Home = lazy(() => import("./pages/Home"));
const PitDeskHome = lazy(() => import("./pages/PitDeskHome"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Profile = lazy(() => import("./pages/Profile"));

// Scanner / Strategy pages
const VelezScanner = lazy(() => import("./pages/VelezScanner"));
const IntradayScanner = lazy(() => import("./pages/IntradayScanner"));
const IntradayTickerDetail = lazy(() => import("./pages/IntradayTickerDetail"));
const ScanAll = lazy(() => import("./pages/ScanAll"));
const CandlestickChart = lazy(() => import("./pages/CandlestickChart"));
const CatalystBreakoutWatch = lazy(() => import("./pages/CatalystBreakoutWatch"));
const VCPStrategy = lazy(() => import("./pages/VCPStrategy"));
const VcpAlerts = lazy(() => import("./pages/VcpAlerts"));
const IvrAlerts = lazy(() => import("./pages/IvrAlerts"));
const ICTSupplyZone = lazy(() => import("./pages/ICTSupplyZone"));

// Analysis pages
const Analyzer = lazy(() => import("./pages/Analyzer"));
const PCRDashboard = lazy(() => import("./pages/PCRDashboard"));
const PCRStrategy = lazy(() => import("./pages/PCRStrategy"));
const EarningsCalendar = lazy(() => import("./pages/EarningsCalendar"));
const History = lazy(() => import("./pages/History"));

// Intelligence / Execution pages
// AI Trading Agent uses TradeProposals page (same component as in old repo)
const TradeProposals = lazy(() => import("./pages/TradeProposals"));
const Performance = lazy(() => import("./pages/Performance"));

// Trade log
const TradeLog = lazy(() => import("./pages/TradeLog"));
const FibEmaAlerts = lazy(() => import("./pages/FibEmaAlerts"));

// Data / Reference pages
const OptionsFlow = lazy(() => import("./pages/OptionsFlow"));
const COTDashboard = lazy(() => import("./pages/COTDashboard"));
const COTAlerts = lazy(() => import("./pages/COTAlerts"));
const COTReference = lazy(() => import("./pages/COTReference").catch(() => ({ default: () => <ComingSoon title="COT Reference" /> })));
const COTMethodology = lazy(() => import("./pages/COTMethodology").catch(() => ({ default: () => <ComingSoon title="COT Methodology" /> })));
const WatchList = lazy(() => import("./pages/WatchList"));
const BrokerSettings = lazy(() => import("./pages/BrokerSettings"));
const Methodology = lazy(() => import("./pages/Methodology").catch(() => ({ default: () => <ComingSoon title="Methodology" /> })));
const Glossary = lazy(() => import("./pages/Glossary").catch(() => ({ default: () => <ComingSoon title="Glossary" /> })));
const HowTo = lazy(() => import("./pages/HowTo"));
const PitAdvisor = lazy(() => import("./pages/PitAdvisor"));
const TradeUpload = lazy(() => import("./pages/TradeUpload"));
const PreMarketChecklist = lazy(() => import("./pages/PreMarketChecklist"));
const MorningSession = lazy(() => import("./pages/MorningSession"));
const SwingWatchlist = lazy(() => import("./pages/SwingWatchlist"));
const LiquidityMap = lazy(() => import("./pages/LiquidityMap"));
const HistoricalData = lazy(() => import("./pages/HistoricalData"));
const Backtester = lazy(() => import("./pages/Backtester"));
const PositionSizer = lazy(() => import("./pages/PositionSizer"));
const SriPlaybook = lazy(() => import("./pages/SriPlaybook"));
const ExtensionSettings = lazy(() => import("./pages/ExtensionSettings"));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

function Router() {
  return (
    <Switch>
      {/* ── Public auth routes ─────────────────────────────────────────── */}
      <Route path="/signin">
        <Suspense fallback={<PageLoader />}>
          <SignIn />
        </Suspense>
      </Route>
      <Route path="/register">
        <Suspense fallback={<PageLoader />}>
          <Register />
        </Suspense>
      </Route>
      <Route path="/forgot-password">
        <Suspense fallback={<PageLoader />}>
          <ForgotPassword />
        </Suspense>
      </Route>
      <Route path="/reset-password">
        <Suspense fallback={<PageLoader />}>
          <ResetPassword />
        </Suspense>
      </Route>

      {/* ── Home landing page (no sidebar) ────────────────────────────── */}
      <Route path="/">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <Home />
          </Suspense>
        </AuthGuard>
      </Route>

      {/* ── Action pages (ActionLayout — slim top nav, no sidebar) ─────── */}
      <Route path="/ticker-analysis">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <TickerAnalysis />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/day-picks">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <DayTradingPicks />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/swing-picks">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <SwingTradingPicks />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/pit-advisor">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <PitAdvisor />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/trade-upload">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <TradeUpload />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/glossary">
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
            <Glossary />
          </Suspense>
        </AuthGuard>
      </Route>

      {/* ── Protected routes (require auth) ───────────────────────────── */}
      <Route>
        <AuthGuard>
          <DashboardLayout>
            <ScrollableRoute>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                {/* Dashboard */}
                <Route path="/dashboard" component={PitDeskHome} />

                {/* Scanners */}
                <Route path="/velez-scanner" component={VelezScanner} />
                <Route path="/intraday-scanner" component={IntradayScanner} />
                <Route path="/intraday-scanner/:ticker">{(params) => <IntradayTickerDetail ticker={params.ticker ?? ""} onClose={() => window.history.back()} />}</Route>
                <Route path="/scan-all" component={ScanAll} />
                <Route path="/charts" component={CandlestickChart} />

                {/* Strategies */}
                <Route path="/catalyst-watch" component={CatalystBreakoutWatch} />
                <Route path="/vcp-strategy" component={VCPStrategy} />
                <Route path="/vcp-alerts" component={VcpAlerts} />
                <Route path="/ivr-alerts" component={IvrAlerts} />
                <Route path="/ict-supply-zone" component={ICTSupplyZone} />

                {/* Analysis */}
                <Route path="/analyzer" component={Analyzer} />
                {/* Friendly URL aliases */}
                <Route path="/options-analyzer">{() => { window.location.replace("/analyzer"); return null; }}</Route>
                <Route path="/ai-agent">{() => { window.location.replace("/agent"); return null; }}</Route>
                <Route path="/history" component={History} />
                <Route path="/pcr-dashboard" component={PCRDashboard} />
                <Route path="/pcr-strategy" component={PCRStrategy} />
                <Route path="/earnings-calendar" component={EarningsCalendar} />
                <Route path="/fib-ema-alerts" component={FibEmaAlerts} />

                {/* Intelligence / Execution */}
                <Route path="/pre-market" component={PreMarketChecklist} />
                <Route path="/morning-session" component={MorningSession} />
                <Route path="/swing-watchlist" component={SwingWatchlist} />
                <Route path="/liquidity-map" component={LiquidityMap} />
                <Route path="/historical-data" component={HistoricalData} />
                <Route path="/backtester" component={Backtester} />
                <Route path="/position-sizer" component={PositionSizer} />
                <Route path="/sri-playbook">
                  {() => (
                    <OwnerOnlyGuard>
                      <Suspense fallback={<PageLoader />}><SriPlaybook /></Suspense>
                    </OwnerOnlyGuard>
                  )}
                </Route>
                <Route path="/extension-settings" component={ExtensionSettings} />
                <Route path="/agent" component={TradeProposals} />
                <Route path="/trade-proposals" component={TradeProposals} />
                <Route path="/performance" component={Performance} />
                <Route path="/trade-log" component={TradeLog} />

                {/* Data / Reference */}
                <Route path="/options-flow" component={OptionsFlow} />
                <Route path="/cot-dashboard" component={COTDashboard} />
                <Route path="/cot-alerts" component={COTAlerts} />
                <Route path="/cot-reference" component={COTReference} />
                <Route path="/cot-methodology" component={COTMethodology} />
                <Route path="/watchlist" component={WatchList} />
                <Route path="/broker-settings" component={BrokerSettings} />
                <Route path="/methodology" component={Methodology} />
                <Route path="/how-to" component={HowTo} />

                {/* Admin */}
                <Route path="/admin/users" component={AdminUsers} />
                <Route path="/profile" component={Profile} />

                <Route path="/404" component={NotFound} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
            </ScrollableRoute>
          </DashboardLayout>
        </AuthGuard>
      </Route>
    </Switch>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
      <div className="text-4xl">🚧</div>
      <div className="text-lg font-medium">{title}</div>
      <div className="text-sm">This page is coming soon.</div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
