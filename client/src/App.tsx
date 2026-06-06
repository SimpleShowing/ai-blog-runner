import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Topics from "./pages/Topics";
import TopicDetail from "./pages/TopicDetail";
import Drafts from "./pages/Drafts";
import DraftDetail from "./pages/DraftDetail";
import Settings from "./pages/Settings";
import PublishLog from "./pages/PublishLog";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import DashboardLayout from "./components/DashboardLayout";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();

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
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/topics" component={() => <ProtectedRoute component={Topics} />} />
      <Route path="/topics/:id" component={() => <ProtectedRoute component={TopicDetail} />} />
      <Route path="/drafts" component={() => <ProtectedRoute component={Drafts} />} />
      <Route path="/drafts/:id" component={() => <ProtectedRoute component={DraftDetail} />} />
      <Route path="/publish-log" component={() => <ProtectedRoute component={PublishLog} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/login" component={Login} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" position="bottom-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
