import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import AuthGuard from "./components/AuthGuard";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Auth pages (public — no AuthGuard)
const SignIn = lazy(() => import("./pages/SignIn"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Protected pages
const Home = lazy(() => import("./pages/Home"));
const VelezScanner = lazy(() => import("./pages/VelezScanner"));
const TradeLog = lazy(() => import("./pages/TradeLog"));
const FibEmaAlerts = lazy(() => import("./pages/FibEmaAlerts"));
const PCRDashboard = lazy(() => import("./pages/PCRDashboard"));
const Analyzer = lazy(() => import("./pages/Analyzer"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Profile = lazy(() => import("./pages/Profile"));

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

      {/* ── Protected routes (require auth) ───────────────────────────── */}
      <Route>
        <AuthGuard>
          <DashboardLayout>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/velez-scanner" component={VelezScanner} />
                <Route path="/trade-log" component={TradeLog} />
                <Route path="/fib-ema-alerts" component={FibEmaAlerts} />
                <Route path="/pcr-dashboard" component={PCRDashboard} />
                <Route path="/analyzer" component={Analyzer} />
                <Route path="/admin/users" component={AdminUsers} />
                <Route path="/profile" component={Profile} />
                {/* Stub routes — coming soon */}
                <Route path="/pcr-strategy" component={() => <ComingSoon title="PCR Strategy" />} />
                <Route path="/vcp-strategy" component={() => <ComingSoon title="VCP Strategy" />} />
                <Route path="/catalyst-watch" component={() => <ComingSoon title="Catalyst Watch" />} />
                <Route path="/ivr-alerts" component={() => <ComingSoon title="IVR Alerts" />} />
                <Route path="/vcp-alerts" component={() => <ComingSoon title="VCP Alerts" />} />
                <Route path="/agent" component={() => <ComingSoon title="AI Agent" />} />
                <Route path="/performance" component={() => <ComingSoon title="Performance Tracker" />} />
                <Route path="/earnings-calendar" component={() => <ComingSoon title="Earnings Calendar" />} />
                <Route path="/scan-all" component={() => <ComingSoon title="Scan All" />} />
                <Route path="/watchlist" component={() => <ComingSoon title="Watchlist" />} />
                <Route path="/methodology" component={() => <ComingSoon title="Methodology" />} />
                <Route path="/glossary" component={() => <ComingSoon title="Glossary" />} />
                <Route path="/how-to" component={() => <ComingSoon title="How-To Guide" />} />
                <Route path="/404" component={NotFound} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
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
