import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare, Send,
  Loader2, ShieldCheck, AlertTriangle, RefreshCw, Sparkles, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { useAuth } from "@/_core/hooks/useAuth";

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    generating: "bg-blue-500/10 text-blue-400",
    draft: "bg-zinc-500/10 text-zinc-400",
    in_review: "bg-amber-500/10 text-amber-400",
    approved: "bg-green-500/10 text-green-400",
    rejected: "bg-red-500/10 text-red-400",
    published: "bg-emerald-500/10 text-emerald-400",
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium", colorMap[status] || "bg-zinc-500/10 text-zinc-400")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function QAItem({ label, result }: { label: string; result: { passed: boolean; note?: string } }) {
  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-lg border", result.passed ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5")}>
      {result.passed
        ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-400" />
        : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
      }
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {result.note && <p className="text-xs mt-0.5 text-muted-foreground">{result.note}</p>}
      </div>
    </div>
  );
}

export default function DraftDetail() {
  const params = useParams<{ id: string }>();
  const draftId = parseInt(params.id || "0");
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [comment, setComment] = useState("");
  const [activeTab, setActiveTab] = useState("content");

  const { data: draft, isLoading } = trpc.drafts.get.useQuery({ id: draftId });
  const { data: qa, isLoading: qaLoading } = trpc.qa.getLatest.useQuery({ draftId });
  const { data: comments, isLoading: commentsLoading } = trpc.comments.list.useQuery({ draftId });

  const runQA = trpc.qa.run.useMutation({
    onSuccess: () => {
      utils.qa.getLatest.invalidate({ draftId });
      toast.success("QA check complete");
    },
    onError: (e) => toast.error(e.message),
  });

  const submitForReview = trpc.drafts.submitForReview.useMutation({
    onSuccess: () => {
      utils.drafts.get.invalidate({ id: draftId });
      toast.success("Draft submitted for review");
    },
    onError: (e) => toast.error(e.message),
  });

  const approveDraft = trpc.drafts.approve.useMutation({
    onSuccess: () => {
      utils.drafts.get.invalidate({ id: draftId });
      toast.success("Draft approved — ready to publish");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectDraft = trpc.drafts.reject.useMutation({
    onSuccess: () => {
      utils.drafts.get.invalidate({ id: draftId });
      toast.success("Draft sent back for revision");
    },
    onError: (e) => toast.error(e.message),
  });

  const addComment = trpc.comments.create.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ draftId });
      setComment("");
      toast.success("Comment added");
    },
    onError: (e) => toast.error(e.message),
  });

  const publishToWP = trpc.wordpress.push.useMutation({
    onSuccess: () => {
      utils.drafts.get.invalidate({ id: draftId });
      toast.success("Published to WordPress as draft!");
    },
    onError: (e) => toast.error(`WordPress error: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Draft not found</p>
        <Link href="/drafts"><Button className="mt-4">Back to Drafts</Button></Link>
      </div>
    );
  }

  // Build QA display from the details JSON
  const qaDetails = qa?.details ? (() => {
    try { return JSON.parse(qa.details); } catch { return null; }
  })() : null;

  const qaChecks: Array<{ label: string; passed: boolean; note?: string }> = [];
  if (qaDetails?.checks) {
    const c = qaDetails.checks;
    const checkMap: Record<string, string> = {
      titleH1Check: "Title / H1 Structure",
      metaDescCheck: "Meta Description",
      internalLinksCheck: "Internal Links",
      citationCheck: "Source Citations",
      wordCountCheck: "Word Count",
      ctaCheck: "CTA Presence",
      readabilityCheck: "Readability Score",
      cannibalizationCheck: "Cannibalization Risk",
    };
    for (const [key, label] of Object.entries(checkMap)) {
      const val = c[key];
      if (val) {
        qaChecks.push({
          label,
          passed: val === "pass",
          note: val === "warn" ? "Needs attention" : val === "fail" ? "Fix required" : undefined,
        });
      }
    }
  }

  const topicId = draft.topicId;
  const canPublish = draft.status === "approved";
  const canApprove = draft.status === "in_review" && user?.role === "admin";
  const canSubmit = draft.status === "draft";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link href="/drafts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Drafts
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground leading-tight">
              {draft.title || `Draft #${draft.id}`}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={draft.status} />
              <span className="text-xs text-muted-foreground">v{draft.version}</span>
              <span className="text-xs text-muted-foreground">
                Updated {new Date(draft.updatedAt).toLocaleDateString()}
              </span>
              {qa?.readabilityScore !== null && qa?.readabilityScore !== undefined && (
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-md",
                  qa.readabilityScore >= 60 ? "bg-green-500/10 text-green-400"
                    : qa.readabilityScore >= 40 ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                )}>
                  Readability: {qa.readabilityScore}/100
                </span>
              )}
            </div>
            {draft.seoTitle && (
              <p className="text-xs mt-2 text-muted-foreground">
                SEO: {draft.seoTitle}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap flex-shrink-0">
            {canSubmit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => submitForReview.mutate({ id: draftId, topicId })}
                disabled={submitForReview.isPending}
              >
                {submitForReview.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                Submit for Review
              </Button>
            )}
            {canApprove && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => rejectDraft.mutate({ id: draftId, topicId })}
                  disabled={rejectDraft.isPending}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveDraft.mutate({ id: draftId, topicId })}
                  disabled={approveDraft.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve
                </Button>
              </>
            )}
            {canPublish && (
              <Button
                size="sm"
                onClick={() => publishToWP.mutate({ draftId, topicId, wpPostStatus: "draft" })}
                disabled={publishToWP.isPending}
                className="gap-2"
              >
                {publishToWP.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                {publishToWP.isPending ? "Publishing…" : "Push to WordPress"}
              </Button>
            )}
            {draft.wpPostUrl && (
              <a href={draft.wpPostUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-2">
                  <ExternalLink className="w-3.5 h-3.5" /> View in WP
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="seo">SEO Metadata</TabsTrigger>
          <TabsTrigger value="qa">
            QA Check
            {qaChecks.some(c => !c.passed) && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="comments">
            Comments
            {(comments?.length || 0) > 0 && (
              <span className="ml-1.5 text-xs bg-primary/20 text-primary rounded-full px-1.5">{comments!.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-6">
            {draft.content ? (
              <div className="prose prose-sm prose-invert max-w-none text-foreground">
                <Streamdown>{draft.content}</Streamdown>
              </div>
            ) : (
              <div className="text-center py-10">
                <Sparkles className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No content yet</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Rank Math SEO Fields</h2>
              <p className="text-xs text-muted-foreground mt-1">
                These fields are populated in Rank Math when the post is pushed to WordPress.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                { label: "SEO Title", value: draft.seoTitle, maxLen: 60 },
                { label: "Meta Description", value: draft.metaDescription, maxLen: 155 },
                { label: "Focus Keyword", value: draft.focusKeyword },
                { label: "Canonical URL", value: draft.canonicalUrl },
                { label: "Slug", value: draft.slug },
              ].map(({ label, value, maxLen }) => (
                <div key={label} className="p-3 rounded-lg border border-border bg-secondary">
                  <p className="text-xs font-medium mb-1 text-muted-foreground">{label}</p>
                  <p className="text-sm text-foreground">
                    {value || <span className="text-muted-foreground italic">Not set</span>}
                  </p>
                  {maxLen && value && (
                    <p className={cn("text-xs mt-1", value.length > maxLen ? "text-red-400" : "text-green-400")}>
                      {value.length}/{maxLen} characters
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* QA Tab */}
        <TabsContent value="qa" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Quality Assurance</h2>
                {qaDetails?.wordCount && (
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    Word count: <span className="font-medium text-foreground">{qaDetails.wordCount.toLocaleString()}</span>
                    {" · "}
                    Internal links: <span className="font-medium text-foreground">{qaDetails.internalLinkCount ?? 0}</span>
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runQA.mutate({ draftId })}
                disabled={runQA.isPending}
              >
                {runQA.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                {qa ? "Re-run QA" : "Run QA Check"}
              </Button>
            </div>

            {qaLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : qaChecks.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-xl">
                <ShieldCheck className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No QA results yet</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Run a QA check to validate SEO, readability, and content quality
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {qaChecks.map((check) => (
                  <QAItem key={check.label} label={check.label} result={check} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h2 className="text-sm font-semibold text-foreground">Editorial Comments</h2>

            {commentsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : !comments || comments.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-xl">
                <MessageSquare className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No comments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg border border-border bg-secondary">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-primary text-primary-foreground">
                        {String(c.authorId).charAt(0)}
                      </div>
                      <span className="text-xs font-medium text-foreground">Editor #{c.authorId}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                      {c.type && c.type !== "comment" && (
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          c.type === "approval_note" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
                        )}>
                          {c.type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Textarea
                placeholder="Add a comment or revision note…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="bg-input border-border text-sm"
              />
              <Button
                size="sm"
                onClick={() => addComment.mutate({ draftId, content: comment })}
                disabled={!comment.trim() || addComment.isPending}
              >
                {addComment.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5 mr-1.5" />}
                Add Comment
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
