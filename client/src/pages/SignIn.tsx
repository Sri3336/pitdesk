import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { PitDeskLogo } from "@/components/PitDeskLogo";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Ticker tape ──────────────────────────────────────────────────────────────
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
          <span key={i} className="inline-flex items-center gap-1.5 text-xs font-mono">
            <span className="font-bold text-white/90 tracking-wide">{t.sym}</span>
            <span className="text-white/40">{t.val}</span>
            <span className={t.up ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{t.chg}</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }`}</style>
    </div>
  );
}

// ─── Custom SVG Icons ─────────────────────────────────────────────────────────
function RadarIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" strokeOpacity="0.3"/>
      <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.5" strokeOpacity="0.5"/>
      <circle cx="12" cy="12" r="2" fill={color}/>
      <line x1="12" y1="12" x2="19" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8"/>
      <circle cx="19" cy="5" r="1.5" fill={color}/>
    </svg>
  );
}

function CrosshairCandleIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="8" y="6" width="3" height="12" rx="1" fill={color} fillOpacity="0.8"/>
      <rect x="13" y="9" width="3" height="8" rx="1" fill={color} fillOpacity="0.5"/>
      <line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="2 2"/>
      <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="2 2"/>
      <circle cx="12" cy="12" r="2.5" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

function PayoffCurveIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M2 18 L8 18 L12 8 L16 8 L20 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="2" y1="18" x2="22" y2="18" stroke={color} strokeWidth="1" strokeOpacity="0.3"/>
      <circle cx="12" cy="8" r="2" fill={color}/>
      <line x1="12" y1="2" x2="12" y2="8" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" strokeOpacity="0.6"/>
    </svg>
  );
}

function BrainCircuitIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 4C8.5 4 6 6.5 6 9.5C6 11 6.5 12.3 7.5 13.2L7 17H17L16.5 13.2C17.5 12.3 18 11 18 9.5C18 6.5 15.5 4 12 4Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1"/>
      <line x1="9" y1="9" x2="15" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="12" x2="14" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="9" y="17" width="6" height="3" rx="1" fill={color} fillOpacity="0.6"/>
    </svg>
  );
}

// ─── Outcome card ─────────────────────────────────────────────────────────────
function OutcomeCard({ icon, headline, sub, color }: {
  icon: React.ReactNode; headline: string; sub: string; color: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl border transition-all duration-200"
      style={{ background: color + "08", borderColor: color + "25" }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: color + "20" }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-white leading-tight">{headline}</p>
        <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[55%] flex-col overflow-hidden relative"
        style={{ background: "linear-gradient(135deg, #080c10 0%, #0d1117 40%, #0a1628 100%)" }}>

        {/* Ambient glow orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-96 h-96 rounded-full blur-3xl opacity-20"
            style={{ background: "oklch(0.65 0.18 145)", top: "-10%", left: "-10%" }} />
          <div className="absolute w-64 h-64 rounded-full blur-3xl opacity-10"
            style={{ background: "oklch(0.55 0.22 270)", bottom: "20%", right: "5%" }} />
        </div>

        {/* Grid texture overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        {/* Ticker tape */}
        <TickerTape />

        {/* Main content */}
        <div className="flex-1 flex flex-col justify-center px-14 py-10 relative z-10">

          {/* Logo lockup */}
          <div className="flex items-center gap-3.5 mb-12">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-2.5 border border-white/10">
              <PitDeskLogo size={40} />
            </div>
            <div>
              <span className="text-2xl font-black tracking-tight text-white">PitDesk</span>
              <p className="text-[10px] text-white/30 font-semibold tracking-[0.2em] uppercase mt-0.5">Trading Intelligence</p>
            </div>
          </div>

          {/* Headline */}
          <div className="mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Your Personal Trading Edge
            </div>
            <h1 className="text-[2.6rem] font-black leading-[1.1] tracking-tight text-white mb-4">
              Know what to trade.<br />
              <span style={{ color: "oklch(0.72 0.18 145)" }}>Know why it wins.</span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed max-w-sm">
              Start with a ticker or a goal. PitDesk analyzes across 5 dimensions and tells you exactly what to do — in plain English.
            </p>
          </div>

          {/* Outcome cards */}
          <div className="grid grid-cols-2 gap-3 mt-8 mb-10">
            <OutcomeCard
              icon={<RadarIcon color="#22c55e" />}
              headline="Find the right trade today"
              sub="Ranked setups from your watchlist, ready to act on"
              color="#22c55e"
            />
            <OutcomeCard
              icon={<CrosshairCandleIcon color="#6366f1" />}
              headline="Best strategy for any ticker"
              sub="15 structures, Black-Scholes priced, liquidity checked"
              color="#6366f1"
            />
            <OutcomeCard
              icon={<PayoffCurveIcon color="#f59e0b" />}
              headline="See the payout before you trade"
              sub="Interactive payoff curve, breakevens, max risk — visual"
              color="#f59e0b"
            />
            <OutcomeCard
              icon={<BrainCircuitIcon color="#ec4899" />}
              headline="A coach that challenges bad setups"
              sub="5-dimension analysis, Playbook rules, plain-English verdict"
              color="#ec4899"
            />
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-8 pt-6 border-t border-white/10">
            {[
              { value: "15+", label: "Strategies" },
              { value: "60",  label: "Tickers tracked" },
              { value: "5",   label: "Analysis dimensions" },
              { value: "∞",   label: "Backtests" },
            ].map(s => (
              <div key={s.label}>
                <div className="text-xl font-black" style={{ color: "oklch(0.72 0.18 145)" }}>{s.value}</div>
                <div className="text-[10px] text-white/30 font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-14 py-4 border-t border-white/8 relative z-10">
          <p className="text-white/20 text-xs">For educational purposes only. Not financial advice.</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-6">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <PitDeskLogo size={40} />
            <div>
              <span className="text-xl font-black tracking-tight">PitDesk</span>
              <p className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase">Trading Intelligence</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-black text-foreground tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your trading intelligence dashboard</p>
          </div>

          <Card className="border border-border/60 shadow-sm bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Sign in</CardTitle>
              <CardDescription>Use your email or continue with Google</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Google first — it's the primary action */}
              <Button type="button" variant="outline"
                className="w-full h-11 font-semibold border-border hover:bg-accent transition-all active:scale-[0.97] bg-background"
                onClick={handleGoogleSignIn} disabled={!googleAuthData?.url}>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or sign in with email</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-semibold text-sm">Email</Label>
                  <Input
                    id="email" ref={emailRef} type="email" placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="font-semibold text-sm">Password</Label>
                    <a href="/forgot-password" className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password" ref={passwordRef} type={showPassword ? "text" : "password"}
                      placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password" className="h-11 pr-10 rounded-xl"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit"
                  className="w-full h-11 font-bold text-white rounded-xl transition-all active:scale-[0.97]"
                  style={{ background: "oklch(0.55 0.175 145)" }}
                  disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </span>
                  ) : "Sign in"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <a href="/register" className="font-bold text-green-600 hover:text-green-700 hover:underline">
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
