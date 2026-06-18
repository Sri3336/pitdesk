import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      sessionStorage.setItem("auth-return-path", window.location.pathname);
      setLocation("/signin");
    }
  }, [user, loading, setLocation]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return null;
  return <>{children}</>;
}
