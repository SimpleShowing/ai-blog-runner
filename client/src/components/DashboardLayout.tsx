import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Link, useLocation } from "wouter";
import { Loader2, LayoutDashboard, ListChecks, FileText, Send, Settings, LogOut, ChevronRight, Sparkles, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/topics", icon: ListChecks, label: "Topic Queue" },
  { href: "/drafts", icon: FileText, label: "Drafts & Review" },
  { href: "/publish-log", icon: Send, label: "Publish Log" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/login"; },
  });

  return (
    <aside
      className={cn(
        "flex flex-col h-full transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
      style={{ background: "var(--sidebar-background)", borderRight: "1px solid var(--sidebar-border)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--sidebar-primary)" }}>
          <Sparkles className="w-4 h-4" style={{ color: "var(--sidebar-primary-foreground)" }} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">SimpleShowing</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Content Ops</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-1 rounded hover:bg-accent transition-colors"
          style={{ color: "var(--muted-foreground)" }}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <a className={cn("sidebar-item", isActive && "active")} title={collapsed ? label : undefined}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="text-xs font-medium" style={{ background: "var(--sidebar-accent)", color: "var(--sidebar-foreground)" }}>
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{user?.name || "User"}</p>
              <p className="text-xs capitalize" style={{ color: "var(--muted-foreground)" }}>{user?.role}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => logout.mutate()}
              className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8 min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
