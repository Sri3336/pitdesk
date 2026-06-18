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

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      const returnPath = sessionStorage.getItem("auth-return-path") || "/";
      sessionStorage.removeItem("auth-return-path");
      setLocation(returnPath);
    }
  }, [user, loading, setLocation]);

  // Check for error from Google OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError === "google_auth_failed") {
      setError("Google sign-in failed. Please try again.");
    } else if (oauthError === "account_creation_failed") {
      setError("Could not create account. Please try email/password sign-in.");
    } else if (oauthError === "server_error") {
      setError("A server error occurred. Please try again.");
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Read directly from DOM to handle browser autofill which bypasses React onChange
    const emailVal = emailRef.current?.value ?? email;
    const passwordVal = passwordRef.current?.value ?? password;
    if (!emailVal || !passwordVal) {
      setError("Please enter your email and password.");
      return;
    }
    loginMutation.mutate({ email: emailVal, password: passwordVal });
  };

  const handleGoogleSignIn = () => {
    if (googleAuthData?.url) {
      window.location.href = googleAuthData.url;
    }
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
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="flex items-center gap-3">
          <PitDeskLogo size={40} />
          <span className="text-xl font-bold tracking-tight">PitDesk</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Your Personal<br />
            <span className="text-green-400">Trading Intelligence</span><br />
            Platform
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed">
            Multi-strategy analysis across 5 dimensions: Technical, Fundamental,
            Geopolitical, Sentiment, and Quantitative.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: "Strategies", value: "13+" },
              { label: "PCR Tickers", value: "60" },
              { label: "EMA Periods", value: "4" },
              { label: "Fib Levels", value: "8" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-green-400">{stat.value}</div>
                <div className="text-sm text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-500 text-sm">
          For educational purposes only. Not financial advice.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <PitDeskLogo size={40} />
            <span className="text-xl font-bold tracking-tight">PitDesk</span>
          </div>

          <Card className="shadow-lg border-0 bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
              <CardDescription>
                Access your trading intelligence dashboard
              </CardDescription>
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
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    ref={emailRef}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a
                      href="/forgot-password"
                      className="text-xs font-medium text-green-600 hover:text-green-700 hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-green-500 hover:bg-green-600 text-white font-medium"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </span>
                  ) : (
                    "Sign in"
                  )}
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

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 font-medium border-border hover:bg-accent"
                onClick={handleGoogleSignIn}
                disabled={!googleAuthData?.url}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <a
                  href="/register"
                  className="font-medium text-green-600 hover:text-green-700 hover:underline"
                >
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
