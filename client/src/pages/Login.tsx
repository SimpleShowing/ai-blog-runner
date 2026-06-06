import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { useEffect } from "react";

export default function Login() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      window.location.href = "/";
    }
  }, [user, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-5" style={{ background: "var(--primary)", filter: "blur(80px)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-5" style={{ background: "var(--primary)", filter: "blur(80px)" }} />
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.25 0.008 264) 1px, transparent 0)",
          backgroundSize: "32px 32px",
          opacity: 0.4,
        }} />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto px-6">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: "var(--primary)" }}>
            <Sparkles className="w-7 h-7" style={{ color: "var(--primary-foreground)" }} />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">SimpleShowing</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Content Operations Dashboard</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <h2 className="text-lg font-semibold text-foreground mb-1">Sign in to continue</h2>
          <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
            Access is restricted to authorized team members only.
          </p>

          <Button
            className="w-full gap-2 font-medium"
            size="lg"
            onClick={() => { window.location.href = getLoginUrl(); }}
          >
            Sign in with Manus
            <ArrowRight className="w-4 h-4" />
          </Button>

          <p className="text-xs text-center mt-5" style={{ color: "var(--muted-foreground)" }}>
            Only invited editors and the account owner can access this tool.
          </p>
        </div>
      </div>
    </div>
  );
}
