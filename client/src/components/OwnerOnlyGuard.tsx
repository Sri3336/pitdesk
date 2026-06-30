import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Shield } from "lucide-react";

// The owner's database user ID — only this user can access owner-only pages.
const OWNER_USER_ID = 1; // Sridhar Akula (akulasridhar@gmail.com)

export default function OwnerOnlyGuard({ children }: { children: React.ReactNode }) {
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

  if (Number(user.id) !== OWNER_USER_ID) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="rounded-full bg-muted p-4">
          <Shield className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          This page is private and only accessible to the platform owner.
        </p>
        <button
          className="text-sm text-primary underline underline-offset-2"
          onClick={() => setLocation("/")}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
