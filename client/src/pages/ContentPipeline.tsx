import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ExternalLink,
  RefreshCw,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingBag,
  TrendingUp,
  Info,
  GitCompare,
  Rss,
  SkipForward,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Type helpers ─────────────────────────────────────────────────────────────

type ContentType = "informational" | "lead_gen" | "affiliate" | "comparison";
type TopicStatus = "pending" | "used" | "skipped";
type PostStatus = "generating" | "published" | "failed";

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  informational: "Informational",
  lead_gen: "Lead Gen",
  affiliate: "Affiliate",
  comparison: "Comparison",
};

const CONTENT_TYPE_ICONS: Record<ContentType, typeof Info> = {
  informational: Info,
  lead_gen: TrendingUp,
  affiliate: ShoppingBag,
  comparison: GitCompare,
};

const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  informational: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  lead_gen: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  affiliate: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  comparison: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

function ContentTypeBadge({ type }: { type: ContentType }) {
  const Icon = CONTENT_TYPE_ICONS[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${CONTENT_TYPE_COLORS[type]}`}>
      <Icon className="w-3 h-3" />
      {CONTENT_TYPE_LABELS[type]}
    </span>
  );
}

function PostStatusBadge({ status }: { status: PostStatus }) {
  if (status === "published") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
      <CheckCircle2 className="w-3 h-3" /> Published
    </span>
  );
  if (status === "failed") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
      <Clock className="w-3 h-3" /> Generating
    </span>
  );
}

function formatTraffic(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const { data: stats, isLoading } = trpc.blogPipeline.stats.useQuery();
  const utils = trpc.useUtils();
  const setupJob = trpc.blogPipeline.setupDailyJob.useMutation({
    onSuccess: (data) => {
      if (data.created) {
        toast.success(`Daily job created! Next run: ${data.nextExecutionAt ? new Date(data.nextExecutionAt).toLocaleString() : "scheduled"}`);
      } else {
        toast.info(`Daily job already active. Next run: ${data.nextExecutionAt ? new Date(data.nextExecutionAt).toLocaleString() : "scheduled"}`);
      }
      utils.blogPipeline.getDailyJobStatus.invalidate();
    },
    onError: (err) => toast.error(`Failed to setup job: ${err.message}`),
  });
  const { data: jobStatus } = trpc.blogPipeline.getDailyJobStatus.useQuery();

  if (isLoading) return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Pending Topics", value: stats?.pending ?? 0, color: "text-blue-600" },
          { label: "Used Topics", value: stats?.used ?? 0, color: "text-green-600" },
          { label: "Skipped Topics", value: stats?.skipped ?? 0, color: "text-slate-500" },
          { label: "Posts Generated", value: stats?.totalPosts ?? 0, color: "text-purple-600" },
          { label: "Posts Published", value: stats?.publishedPosts ?? 0, color: "text-emerald-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Daily job status */}
      <div className="flex items-center justify-between bg-card border rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${jobStatus?.isEnable ? "bg-emerald-500" : "bg-slate-400"}`} />
          <div>
            <span className="text-sm font-medium">Daily Post Generator</span>
            <span className="text-xs text-muted-foreground ml-2">
              {jobStatus
                ? `${jobStatus.isEnable ? "Active" : "Paused"} · Next: ${jobStatus.nextExecutionAt ? new Date(jobStatus.nextExecutionAt).toLocaleString() : "—"}`
                : "Not configured"}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setupJob.mutate()}
          disabled={setupJob.isPending}
        >
          {setupJob.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
          {jobStatus ? "Verify Job" : "Setup Daily Job"}
        </Button>
      </div>
    </div>
  );
}

// ─── Topic Queue Tab ──────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function TopicQueueTab() {
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [page, setPage] = useState(0);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.blogPipeline.listTopics.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    contentType: typeFilter === "all" ? undefined : typeFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const updateStatus = trpc.blogPipeline.updateTopicStatus.useMutation({
    onSuccess: () => {
      utils.blogPipeline.listTopics.invalidate();
      utils.blogPipeline.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="informational">Informational</SelectItem>
            <SelectItem value="lead_gen">Lead Gen</SelectItem>
            <SelectItem value="affiliate">Affiliate</SelectItem>
            <SelectItem value="comparison">Comparison</SelectItem>
          </SelectContent>
        </Select>

        {data && (
          <span className="text-sm text-muted-foreground self-center">
            {data.total.toLocaleString()} topics
          </span>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead className="w-36">Content Type</TableHead>
              <TableHead className="w-24 text-right">Traffic</TableHead>
              <TableHead className="w-24">Source</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.topics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No topics found
                </TableCell>
              </TableRow>
            ) : (
              data?.topics.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium max-w-xs">
                    <div className="truncate">{topic.keyword}</div>
                    {topic.sourceUrl && (
                      <a
                        href={topic.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Source
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <ContentTypeBadge type={topic.contentType as ContentType} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTraffic(topic.traffic)}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground capitalize">{topic.source}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium capitalize ${
                      topic.status === "pending" ? "text-blue-600" :
                      topic.status === "used" ? "text-green-600" : "text-slate-500"
                    }`}>
                      {topic.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {topic.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => updateStatus.mutate({ id: topic.id, status: "skipped" })}
                          disabled={updateStatus.isPending}
                          title="Skip this topic"
                        >
                          <SkipForward className="w-3 h-3" />
                        </Button>
                      )}
                      {topic.status === "skipped" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => updateStatus.mutate({ id: topic.id, status: "pending" })}
                          disabled={updateStatus.isPending}
                          title="Restore to pending"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Generated Posts Tab ──────────────────────────────────────────────────────

function GeneratedPostsTab() {
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [affiliateOnly, setAffiliateOnly] = useState(false);
  const [page, setPage] = useState(0);

  const { data, isLoading } = trpc.blogPipeline.listPosts.useQuery({
    contentType: typeFilter === "all" ? undefined : typeFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    affiliateFlag: affiliateOnly ? true : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="informational">Informational</SelectItem>
            <SelectItem value="lead_gen">Lead Gen</SelectItem>
            <SelectItem value="affiliate">Affiliate</SelectItem>
            <SelectItem value="comparison">Comparison</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="generating">Generating</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={affiliateOnly ? "default" : "outline"}
          onClick={() => { setAffiliateOnly(v => !v); setPage(0); }}
          className="gap-1.5"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Affiliate Only
        </Button>

        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total.toLocaleString()} posts
          </span>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title / Keyword</TableHead>
              <TableHead className="w-36">Content Type</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Flags</TableHead>
              <TableHead className="w-40">Published</TableHead>
              <TableHead className="w-20 text-right">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Rss className="w-8 h-8 opacity-30" />
                    <p>No posts generated yet</p>
                    <p className="text-xs">Posts will appear here once the daily job runs</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="max-w-xs">
                    <div className="font-medium truncate">{post.title || "—"}</div>
                    {post.keyword && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{post.keyword}</div>
                    )}
                    {post.errorMessage && (
                      <div className="text-xs text-red-500 truncate mt-0.5" title={post.errorMessage}>
                        Error: {post.errorMessage.slice(0, 60)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <ContentTypeBadge type={post.contentType as ContentType} />
                  </TableCell>
                  <TableCell>
                    <PostStatusBadge status={post.status as PostStatus} />
                  </TableCell>
                  <TableCell>
                    {post.affiliateFlag && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                        <ShoppingBag className="w-3 h-3" />
                        Links Needed
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {post.wpPostUrl && (
                      <a
                        href={post.wpPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContentPipeline() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Content Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Automated daily blog post generation from competitor keyword data
          </p>
        </div>

        <StatsBar />

        <Tabs defaultValue="topics">
          <TabsList>
            <TabsTrigger value="topics">Topic Queue</TabsTrigger>
            <TabsTrigger value="posts">Generated Posts</TabsTrigger>
          </TabsList>

          <TabsContent value="topics" className="mt-4">
            <TopicQueueTab />
          </TabsContent>

          <TabsContent value="posts" className="mt-4">
            <GeneratedPostsTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
