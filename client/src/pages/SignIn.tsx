import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, AlertCircle, TrendingUp, TrendingDown, Activity, Target, BarChart2, Zap } from "lucide-react";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Ticker tape data ─────────────────────────────────────────────────────────
const TICKERS = [
  { sym: "SPY",  val: "741.75",  chg: "+0.82%", up: true  },
  { sym: "QQQ",  val: "721.34",  chg: "+1.14%", up: true  },
  { sym: "NQ",   val: "30,618",  chg: "-0.33%", up: false },
  { sym: "VIX",  val: "17.44",   chg: "+4.21%", up: true  },
  { sym: "GLD",  val: "387.12",  chg: "-0.38%", up: false },
  { sym: "TLT",  val: "94.22",   chg: "+0.61%", up: true  },
  { sym: "NVDA", val: "210.69",  chg: "+2.94%", up: true  },
  { sym: "BTC",  val: "107,240", chg: "+2.14%", up: true  },
];

function TickerTape() {
  const items = [...TICKERS, ...TICKERS];
  return (
    <div className="overflow-hidden w-full py-2 border-b border-white/10"
      style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}>
      <div className="flex gap-8 whitespace-nowrap w-max"
        style={{ animation: "ticker 28s linear infinite" }}>
        {items.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs">
            <span className="font-bold text-white/90">{t.sym}</span>
            <span className="text-white/50">{t.val}</span>
            <span className={t.up ? "text-green-400" : "text-red-400"}>{t.chg}</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }`}</style>
    </div>
  );
}

// ─── Feature highlight ────────────────────────────────────────────────────────
function Feature({ icon: Icon, label, desc, color }: {
  icon: React.ElementType; label: string; desc: string; color: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: color + "30" }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-white/50 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SignIn() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      const returnPath = sessionStorage.getItem("auth-return-path") || "/";
      sessionStorage.removeItem("auth-return-path");
      setLocation(returnPath);
    },
    onError: (err) => {
      setError(err.message || "Invalid email or password.");
    },
  });

  const { data: googleAuthData } = trpc.auth.googleAuthUrl.useQuery();

  useEffect(() => {
    if (!loading && user) {
      const returnPath = sessionStorage.getItem("auth-return-path") || "/";
      sessionStorage.removeItem("auth-return-path");
      setLocation(returnPath);
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError === "google_auth_failed") setError("Google sign-in failed. Please try again.");
    else if (oauthError === "account_creation_failed") setError("Could not create account. Please try email/password sign-in.");
    else if (oauthError === "server_error") setError("A server error occurred. Please try again.");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailVal = emailRef.current?.value ?? email;
    const passwordVal = passwordRef.current?.value ?? password;
    if (!emailVal || !passwordVal) { setError("Please enter your email and password."); return; }
    loginMutation.mutate({ email: emailVal, password: passwordVal });
  };

  const handleGoogleSignIn = () => {
    if (googleAuthData?.url) window.location.href = googleAuthData.url;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[52%] flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden relative">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 30% 40%, oklch(0.60 0.175 145 / 12%), transparent)" }} />

        {/* Ticker tape */}
        <TickerTape />

        {/* Main content */}
        <div className="flex-1 flex flex-col justify-center px-12 py-10 relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-white rounded-2xl p-2 shadow-xl">
              <PitDeskLogo size={44} />
            </div>
            <div>
              <span className="text-2xl font-extrabold tracking-tight">PitDesk</span>
              <p className="text-[11px] text-white/40 font-medium tracking-widest uppercase mt-0.5">Trading Intelligence</p>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-extrabold leading-tight mb-4">
            Your Personal<br />
            <span style={{ color: "oklch(0.75 0.175 145)" }}>Trading Intelligence</span><br />
            Platform
          </h1>
          <p className="text-white/60 text-base leading-relaxed mb-8 max-w-sm">
            Multi-strategy analysis across 5 dimensions: Technical, Fundamental,
            Geopolitical, Sentiment, and Quantitative.
          </p>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <Feature icon={Activity}  label="PCR Signal Board"   desc="60 tickers, live COI heat map"    color="#22c55e" />
            <Feature icon={Target}    label="Options Analyzer"   desc="15 strategies + Black-Scholes"    color="#6366f1" />
            <Feature icon={BarChart2} label="Velez Scanner"      desc="Daily & intraday Fib signals"     color="#f59e0b" />
            <Feature icon={Zap}       label="Pit Advisor AI"     desc="5-dimension trade coaching"       color="#ec4899" />
          </div>

          {/* Stats */}
          <div className="flex gap-6">
            {[
              { label: "Strategies", value: "15+" },
              { label: "PCR Tickers", value: "60" },
              { label: "Scan Criteria", value: "9" },
              { label: "Fib Levels", value: "8" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-extrabold" style={{ color: "oklch(0.75 0.175 145)" }}>{s.value}</div>
                <div className="text-[11px] text-white/40 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-12 py-4 border-t border-white/10 relative z-10">
          <p className="text-white/30 text-xs">For educational purposes only. Not financial advice.</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <PitDeskLogo size={44} />
            <span className="text-xl font-bold tracking-tight">PitDesk</span>
          </div>

          <Card className="shadow-xl border-0 bg-card" style={{ boxShadow: "0 8px 40px oklch(0 0 0 / 8%), 0 1px 4px oklch(0 0 0 / 4%)" }}>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-extrabold">Sign in</CardTitle>
              <CardDescription>Access your trading intelligence dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-semibold">Email</Label>
                  <Input
                    id="email" ref={emailRef} type="email" placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="font-semibold">Password</Label>
                    <a href="/forgot-password" className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password" ref={passwordRef} type={showPassword ? "text" : "password"}
                      placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password" className="h-11 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit"
                  className="w-full h-11 font-semibold text-white transition-all active:scale-[0.97]"
                  style={{ background: "oklch(0.60 0.175 145)" }}
                  disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </span>
                  ) : "Sign in"}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button type="button" variant="outline"
                className="w-full h-11 font-semibold border-border hover:bg-accent transition-all active:scale-[0.97]"
                onClick={handleGoogleSignIn} disabled={!googleAuthData?.url}>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <a href="/register" className="font-semibold text-green-600 hover:text-green-700 hover:underline">
                  Create one
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
