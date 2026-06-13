import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  RefreshCw, EyeOff, CheckCircle, AlertCircle, Clock,
  TrendingUp, Trash2, ExternalLink, RotateCcw
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Decision = "refresh" | "noindex" | "keep" | "redirect";

type WpPost = {
  id: number;
  slug: string;
  title: string;
  link: string;
  dateModified: string;
  decision: Decision;
  hasKeywordMap: boolean;
  isNoindexSlug: boolean;
  alreadyProcessed: boolean;
  lastAction: string | null;
  lastProcessedAt: string | Date | null;
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: Decision }) {
  const map: Record<Decision, { label: string; className: string }> = {
    refresh: { label: "Refresh", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    noindex: { label: "Noindex", className: "bg-red-500/15 text-red-400 border-red-500/30" },
    keep: { label: "Keep", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    redirect: { label: "Redirect", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  };
  const { label, className } = map[decision] ?? map.keep;
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-semibold ${color ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PostRefresh() {
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"triage" | "history">("triage");

  const { data: posts, isLoading, refetch } = trpc.postRefresh.listPosts.useQuery({ page: 1, perPage: 100 });
  const { data: history } = trpc.postRefresh.getHistory.useQuery();

  const refreshMutation = trpc.postRefresh.refreshPost.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ Refreshed: post ${data.wpPostId}`, {
        description: `Keywords: ${data.targetKeywords.slice(0, 2).join(", ")}`,
      });
      refetch();
    },
    onError: (err) => {
      toast.error("Refresh failed", { description: err.message });
    },
  });

  const noindexMutation = trpc.postRefresh.noindexPost.useMutation({
    onSuccess: () => {
      toast.success("Post set to draft (noindexed)");
      refetch();
    },
    onError: (err) => {
      toast.error("Noindex failed", { description: err.message });
    },
  });

  const handleRefresh = async (post: WpPost) => {
    setProcessingIds(prev => new Set(prev).add(post.id));
    try {
      await refreshMutation.mutateAsync({
        wpPostId: post.id,
        slug: post.slug,
        title: post.title,
      });
    } finally {
      setProcessingIds(prev => { const s = new Set(prev); s.delete(post.id); return s; });
    }
  };

  const handleNoindex = async (post: WpPost) => {
    setProcessingIds(prev => new Set(prev).add(post.id));
    try {
      await noindexMutation.mutateAsync({
        wpPostId: post.id,
        slug: post.slug,
        title: post.title,
      });
    } finally {
      setProcessingIds(prev => { const s = new Set(prev).add(post.id); s.delete(post.id); return s; });
    }
  };

  // Stats
  const total = posts?.length ?? 0;
  const toRefresh = posts?.filter(p => p.decision === "refresh" && !p.alreadyProcessed).length ?? 0;
  const toNoindex = posts?.filter(p => p.decision === "noindex" && !p.alreadyProcessed).length ?? 0;
  const done = posts?.filter(p => p.alreadyProcessed).length ?? 0;

  // Priority order: refresh first (high-value), then noindex, then keep
  const priorityOrder: Record<Decision, number> = { refresh: 0, noindex: 1, redirect: 2, keep: 3 };
  const sortedPosts = [...(posts ?? [])].sort((a, b) => {
    // Unprocessed first
    if (a.alreadyProcessed !== b.alreadyProcessed) return a.alreadyProcessed ? 1 : -1;
    // Then by decision priority
    return (priorityOrder[a.decision] ?? 3) - (priorityOrder[b.decision] ?? 3);
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Post Refresh Agent</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Triage existing posts — refresh with Claude, noindex off-topic content, or keep top performers.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total posts" value={total} />
        <StatCard label="To refresh" value={toRefresh} color="text-emerald-400" sub="Pos 11–50, winnable" />
        <StatCard label="To noindex" value={toNoindex} color="text-red-400" sub="Off-topic / no traffic" />
        <StatCard label="Processed" value={done} color="text-blue-400" sub="This session" />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="triage">Post Triage</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Triage tab ── */}
        <TabsContent value="triage" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading posts from WordPress...
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Post title</th>
                        <th className="text-left px-4 py-3 font-medium w-24">Decision</th>
                        <th className="text-left px-4 py-3 font-medium w-20">Keywords</th>
                        <th className="text-left px-4 py-3 font-medium w-24">Status</th>
                        <th className="text-right px-4 py-3 font-medium w-40">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPosts.map(post => {
                        const isProcessing = processingIds.has(post.id);
                        return (
                          <tr
                            key={post.id}
                            className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${post.alreadyProcessed ? "opacity-50" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <a
                                  href={post.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-foreground hover:text-primary truncate max-w-xs"
                                  title={post.title}
                                >
                                  {post.title.replace(/<[^>]+>/g, "")}
                                </a>
                                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{post.slug}</p>
                            </td>
                            <td className="px-4 py-3">
                              <DecisionBadge decision={post.decision} />
                            </td>
                            <td className="px-4 py-3">
                              {post.hasKeywordMap ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                                  <TrendingUp className="h-3 w-3 mr-1" /> Yes
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">Auto</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {post.alreadyProcessed ? (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>{post.lastAction}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" /> Pending
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {!post.alreadyProcessed && (
                                  <>
                                    {post.decision === "refresh" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                        disabled={isProcessing}
                                        onClick={() => handleRefresh(post)}
                                      >
                                        {isProcessing ? (
                                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                        ) : (
                                          <RefreshCw className="h-3 w-3 mr-1" />
                                        )}
                                        Refresh
                                      </Button>
                                    )}
                                    {post.decision === "noindex" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                                        disabled={isProcessing}
                                        onClick={() => handleNoindex(post)}
                                      >
                                        <EyeOff className="h-3 w-3 mr-1" /> Noindex
                                      </Button>
                                    )}
                                    {/* Always allow override actions */}
                                    {post.decision !== "refresh" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-muted-foreground"
                                        disabled={isProcessing}
                                        onClick={() => handleRefresh(post)}
                                        title="Force refresh anyway"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {post.decision !== "noindex" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-muted-foreground"
                                        disabled={isProcessing}
                                        onClick={() => handleNoindex(post)}
                                        title="Force noindex anyway"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                                {post.alreadyProcessed && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-muted-foreground"
                                    disabled={isProcessing}
                                    onClick={() => handleRefresh(post)}
                                    title="Re-refresh"
                                  >
                                    <RotateCcw className="h-3 w-3 mr-1" /> Re-run
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Refresh history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!history || history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No posts processed yet. Start triaging in the Post Triage tab.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Post</th>
                      <th className="text-left px-4 py-3 font-medium">Action</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">Processed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map(log => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium truncate max-w-xs" title={log.title ?? ""}>{log.title}</p>
                          <p className="text-xs text-muted-foreground">{log.slug}</p>
                        </td>
                        <td className="px-4 py-3">
                          <DecisionBadge decision={log.action as Decision} />
                        </td>
                        <td className="px-4 py-3">
                          {log.status === "done" ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle className="h-3.5 w-3.5" /> Done
                            </span>
                          ) : log.status === "failed" ? (
                            <span className="flex items-center gap-1 text-xs text-red-400">
                              <AlertCircle className="h-3.5 w-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" /> {log.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {log.processedAt ? new Date(log.processedAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                          }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
