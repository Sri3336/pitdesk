/**
 * PageScroll — wraps any page that lives inside DashboardLayout's
 * `main` element (which is overflow-hidden to support full-height chat pages).
 * Apply this to every page EXCEPT PitAdvisor and any other full-height chat UI.
 */
export default function PageScroll({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`h-full overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}
