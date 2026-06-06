import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import { ArrowLeft, Sparkles, CheckCircle, FileText, Loader2, Edit3, Save, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium", `badge-${status}`)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function BriefSection({ title, content, onSave }: { title: string; content: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content);
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
        style={{ background: "var(--secondary)" }}
        onClick={() => setExpanded(e => !e)}
      >
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          {!editing && (
            <button
              className="p-1 rounded hover:bg-accent transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              onClick={e => { e.stopPropagation(); setEditing(true); setValue(content); }}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} />}
        </div>
      </div>
      {expanded && (
        <div className="p-4">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={value}
                onChange={e => setValue(e.target.value)}
                rows={8}
                className="bg-input border-border text-sm font-mono"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { onSave(value); setEditing(false); }}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none text-sm" style={{ color: "var(--foreground)" }}>
              <Streamdown>{content || "*No content yet*"}</Streamdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopicDetail() {
  const params = useParams<{ id: string }>();
  const topicId = parseInt(params.id || "0");
  const utils = trpc.useUtils();

  const { data: topic, isLoading: topicLoading } = trpc.topics.get.useQuery({ id: topicId });
  const { data: brief, isLoading: briefLoading } = trpc.briefs.getByTopic.useQuery({ topicId });
  const { data: drafts } = trpc.drafts.getByTopic.useQuery({ topicId });

  const generateBrief = trpc.briefs.generate.useMutation({
    onSuccess: () => {
      utils.briefs.getByTopic.invalidate({ topicId });
      utils.topics.get.invalidate({ id: topicId });
      toast.success("Brief generated successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBrief = trpc.briefs.update.useMutation({
    onSuccess: () => {
      utils.briefs.getByTopic.invalidate({ topicId });
      toast.success("Brief updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const approveBrief = trpc.briefs.approve.useMutation({
    onSuccess: () => {
      utils.briefs.getByTopic.invalidate({ topicId });
      utils.topics.get.invalidate({ id: topicId });
      toast.success("Brief approved — ready to generate draft");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateDraft = trpc.drafts.generate.useMutation({
    onSuccess: (data) => {
      utils.drafts.getByTopic.invalidate({ topicId });
      utils.topics.get.invalidate({ id: topicId });
      toast.success("Draft generated — review it in Drafts");
    },
    onError: (e) => toast.error(e.message),
  });

  const approveTopic = trpc.topics.approve.useMutation({
    onSuccess: () => {
      utils.topics.get.invalidate({ id: topicId });
      toast.success("Topic approved");
    },
  });

  if (topicLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground">Topic not found</p>
        <Link href="/topics"><Button className="mt-4">Back to Topics</Button></Link>
      </div>
    );
  }

  const canGenerateBrief = ["approved", "brief_pending", "draft_pending"].includes(topic.status) || topic.status === "idea";
  const canGenerateDraft = brief?.status === "approved" || topic.status === "draft_pending";
  const hasDrafts = (drafts?.length || 0) > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/topics">
        <a className="inline-flex items-center gap-1.5 text-sm hover:text-primary transition-colors" style={{ color: "var(--muted-foreground)" }}>
          <ArrowLeft className="w-4 h-4" /> Back to Topics
        </a>
      </Link>

      {/* Topic header */}
      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground leading-tight">{topic.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={topic.status} />
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {topic.contentPillar.replace(/_/g, " ")}
              </span>
              {topic.targetMarket && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>📍 {topic.targetMarket}</span>
              )}
              {topic.targetKeyword && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>🔑 {topic.targetKeyword}</span>
              )}
            </div>
            {topic.notes && (
              <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>{topic.notes}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {topic.status === "idea" && (
              <Button variant="outline" size="sm" onClick={() => approveTopic.mutate({ id: topicId })}>
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve
              </Button>
            )}
            {hasDrafts && (
              <Link href={`/drafts/${drafts![0].id}`}>
                <Button variant="outline" size="sm">
                  <FileText className="w-3.5 h-3.5 mr-1.5" /> View Draft
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Brief section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Content Brief</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              AI-generated research brief to guide the draft
            </p>
          </div>
          <div className="flex gap-2">
            {!brief || brief.status === "archived" ? (
              <Button
                size="sm"
                onClick={() => generateBrief.mutate({ topicId })}
                disabled={generateBrief.isPending}
                className="gap-2"
              >
                {generateBrief.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generateBrief.isPending ? "Generating…" : "Generate Brief"}
              </Button>
            ) : brief.status === "ready" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateBrief.mutate({ topicId })}
                  disabled={generateBrief.isPending}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Regenerate
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveBrief.mutate({ id: brief.id, topicId })}
                  disabled={approveBrief.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve Brief
                </Button>
              </>
            ) : brief.status === "approved" ? (
              <div className="flex items-center gap-2">
                <span className="badge-approved_for_publish inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium">
                  ✓ Brief Approved
                </span>
                <Button
                  size="sm"
                  onClick={() => generateDraft.mutate({ topicId, briefId: brief.id })}
                  disabled={generateDraft.isPending}
                  className="gap-2"
                >
                  {generateDraft.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  {generateDraft.isPending ? "Generating Draft…" : "Generate Draft"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {briefLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : !brief ? (
          <div className="text-center py-10 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm font-medium text-foreground">No brief yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {topic.status === "idea" ? "Approve the topic first, then generate a brief" : "Click 'Generate Brief' to create an AI-powered content brief"}
            </p>
          </div>
        ) : brief.status === "generating" ? (
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm text-foreground">Generating brief…</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>This usually takes 15–30 seconds</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { key: "serpNotes", title: "SERP Analysis & Angle" },
              { key: "outline", title: "Content Outline" },
              { key: "internalLinks", title: "Internal Link Suggestions" },
              { key: "faqs", title: "FAQ Questions" },
              { key: "citations", title: "Citation Sources" },
              { key: "ctaStrategy", title: "CTA Strategy" },
              { key: "differentiationAngle", title: "Differentiation Angle" },
            ].map(({ key, title }) => (
              <BriefSection
                key={key}
                title={title}
                content={(brief as any)[key] || ""}
                onSave={(value) => updateBrief.mutate({ id: brief.id, [key]: value })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drafts */}
      {hasDrafts && (
        <div className="glass-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Drafts</h2>
          <div className="space-y-2">
            {drafts!.map(draft => (
              <Link key={draft.id} href={`/drafts/${draft.id}`}>
                <a className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group">
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {draft.title || `Draft #${draft.id}`}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      v{draft.version} · {new Date(draft.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium", `badge-${draft.status}`)}>
                    {draft.status.replace(/_/g, " ")}
                  </span>
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
