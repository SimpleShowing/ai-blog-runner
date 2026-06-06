import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { FileText, ListChecks, CheckCircle2, Send, ArrowRight, Clock, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", `badge-${status}`)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", `badge-${priority}`)}>
      {priority}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</p>
          <p className="text-3xl font-semibold text-foreground mt-1">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: topics, isLoading: topicsLoading } = trpc.topics.list.useQuery();
  const { data: drafts, isLoading: draftsLoading } = trpc.drafts.list.useQuery();

  const topicStats = {
    total: topics?.length || 0,
    ideas: topics?.filter(t => t.status === "idea").length || 0,
    approved: topics?.filter(t => t.status === "approved").length || 0,
    inProgress: topics?.filter(t => ["brief_pending","brief_ready","draft_pending","draft_ready"].includes(t.status)).length || 0,
    inReview: topics?.filter(t => t.status === "in_review").length || 0,
    published: topics?.filter(t => t.status === "published").length || 0,
  };

  const draftStats = {
    total: drafts?.length || 0,
    inReview: drafts?.filter(d => d.status === "in_review").length || 0,
    approved: drafts?.filter(d => d.status === "approved").length || 0,
  };

  const recentTopics = topics?.slice(0, 6) || [];
  const reviewQueue = drafts?.filter(d => d.status === "in_review").slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Content Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          Overview of your content pipeline and publishing activity
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {topicsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total Topics" value={topicStats.total} icon={ListChecks} color="oklch(0.72 0.18 195)" />
            <StatCard label="In Progress" value={topicStats.inProgress} icon={Sparkles} color="oklch(0.78 0.18 280)" />
            <StatCard label="In Review" value={topicStats.inReview + draftStats.inReview} icon={Clock} color="oklch(0.78 0.14 75)" />
            <StatCard label="Published" value={topicStats.published} icon={TrendingUp} color="oklch(0.72 0.15 145)" />
          </>
        )}
      </div>

      {/* Pipeline stages */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Content Pipeline</h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { label: "Ideas", count: topicStats.ideas, color: "var(--muted-foreground)" },
            { label: "Approved", count: topicStats.approved, color: "oklch(0.60 0.18 240)" },
            { label: "In Progress", count: topicStats.inProgress, color: "oklch(0.72 0.18 280)" },
            { label: "In Review", count: topicStats.inReview, color: "oklch(0.78 0.14 75)" },
            { label: "Published", count: topicStats.published, color: "oklch(0.72 0.15 145)" },
          ].map((stage, i, arr) => (
            <div key={stage.label} className="flex items-center gap-2 flex-shrink-0">
              <div className="text-center">
                <div className="text-xl font-semibold" style={{ color: stage.color }}>{stage.count}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{stage.label}</div>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--border)" }} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Topics */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Topics</h2>
            <Link href="/topics">
              <a className="text-xs flex items-center gap-1 hover:text-primary transition-colors" style={{ color: "var(--muted-foreground)" }}>
                View all <ArrowRight className="w-3 h-3" />
              </a>
            </Link>
          </div>
          {topicsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : recentTopics.length === 0 ? (
            <div className="text-center py-8">
              <ListChecks className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--muted-foreground)" }} />
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No topics yet</p>
              <Link href="/topics">
                <Button size="sm" className="mt-3">Add your first topic</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTopics.map(topic => (
                <Link key={topic.id} href={`/topics/${topic.id}`}>
                  <a className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{topic.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{topic.targetMarket || "National"}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <PriorityBadge priority={topic.priority} />
                      <StatusBadge status={topic.status} />
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Review Queue */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Review Queue</h2>
            <Link href="/drafts">
              <a className="text-xs flex items-center gap-1 hover:text-primary transition-colors" style={{ color: "var(--muted-foreground)" }}>
                View all <ArrowRight className="w-3 h-3" />
              </a>
            </Link>
          </div>
          {draftsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : reviewQueue.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--muted-foreground)" }} />
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No drafts awaiting review</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reviewQueue.map(draft => (
                <Link key={draft.id} href={`/drafts/${draft.id}`}>
                  <a className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {draft.title || `Draft #${draft.id}`}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(draft.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={draft.status} />
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
