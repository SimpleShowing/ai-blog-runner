import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Plus, Search, Filter, ArrowRight, Loader2, Trash2, Pause, CheckCircle, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

const PILLARS = [
  { value: "buyer_guides", label: "Buyer Guides" },
  { value: "seller_guides", label: "Seller Guides" },
  { value: "commission_savings", label: "Commission Savings" },
  { value: "market_reports", label: "Market Reports" },
  { value: "comparison_pages", label: "Comparison Pages" },
  { value: "local_seo", label: "Local SEO" },
  { value: "how_to", label: "How-To" },
  { value: "other", label: "Other" },
];

const GOALS = [
  { value: "home_valuation", label: "Home Valuation" },
  { value: "commission_savings", label: "Commission Savings" },
  { value: "buyer_rebate", label: "Buyer Rebate" },
  { value: "book_consultation", label: "Book Consultation" },
  { value: "general_awareness", label: "General Awareness" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All Topics" },
  { value: "idea", label: "Ideas" },
  { value: "approved", label: "Approved" },
  { value: "brief_ready", label: "Brief Ready" },
  { value: "draft_ready", label: "Draft Ready" },
  { value: "in_review", label: "In Review" },
  { value: "approved_for_publish", label: "Ready to Publish" },
  { value: "published", label: "Published" },
  { value: "paused", label: "Paused" },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", `badge-${status}`)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: "oklch(0.65 0.20 25)",
    medium: "oklch(0.78 0.14 75)",
    low: "oklch(0.58 0.010 264)",
  };
  return (
    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[priority] || colors.medium }} title={priority} />
  );
}

export default function Topics() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState({
    title: "",
    contentPillar: "other" as const,
    targetMarket: "",
    conversionGoal: "general_awareness" as const,
    priority: "medium" as const,
    targetKeyword: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: topics, isLoading } = trpc.topics.list.useQuery();
  const createTopic = trpc.topics.create.useMutation({
    onSuccess: () => {
      utils.topics.list.invalidate();
      setShowAddDialog(false);
      setForm({ title: "", contentPillar: "other", targetMarket: "", conversionGoal: "general_awareness", priority: "medium", targetKeyword: "", notes: "" });
      toast.success("Topic added to queue");
    },
    onError: (e) => toast.error(e.message),
  });
  const approveTopic = trpc.topics.approve.useMutation({
    onSuccess: () => { utils.topics.list.invalidate(); toast.success("Topic approved"); },
  });
  const pauseTopic = trpc.topics.pause.useMutation({
    onSuccess: () => { utils.topics.list.invalidate(); toast.success("Topic paused"); },
  });
  const deleteTopic = trpc.topics.delete.useMutation({
    onSuccess: () => { utils.topics.list.invalidate(); toast.success("Topic deleted"); },
  });

  const filtered = (topics || []).filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.targetKeyword || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Topic Queue</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            {topics?.length || 0} topics · {topics?.filter(t => t.status === "idea").length || 0} ideas · {topics?.filter(t => t.status === "approved").length || 0} approved
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Topic
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
          <Input
            placeholder="Search topics or keywords…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Filter className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm font-medium text-foreground">No topics found</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {search || statusFilter !== "all" ? "Try adjusting your filters" : "Add your first topic to get started"}
            </p>
            {!search && statusFilter === "all" && (
              <Button size="sm" className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Topic
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Topic</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--muted-foreground)" }}>Pillar</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: "var(--muted-foreground)" }}>Market</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {filtered.map(topic => (
                <tr key={topic.id} className="hover:bg-accent/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <PriorityDot priority={topic.priority} />
                      <div className="min-w-0">
                        <Link href={`/topics/${topic.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block max-w-xs">
                          {topic.title}
                        </Link>
                        {topic.targetKeyword && (
                          <p className="text-xs truncate max-w-xs" style={{ color: "var(--muted-foreground)" }}>
                            🔑 {topic.targetKeyword}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {PILLARS.find(p => p.value === topic.contentPillar)?.label || topic.contentPillar}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {topic.targetMarket || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={topic.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/topics/${topic.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {topic.status === "idea" && (
                            <DropdownMenuItem onClick={() => approveTopic.mutate({ id: topic.id })}>
                              <CheckCircle className="w-3.5 h-3.5 mr-2" /> Approve
                            </DropdownMenuItem>
                          )}
                          {topic.status !== "paused" && (
                            <DropdownMenuItem onClick={() => pauseTopic.mutate({ id: topic.id })}>
                              <Pause className="w-3.5 h-3.5 mr-2" /> Pause
                            </DropdownMenuItem>
                          )}
                          {user?.role === "admin" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => { if (confirm("Delete this topic?")) deleteTopic.mutate({ id: topic.id }); }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Topic Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add New Topic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Topic Title *</label>
              <Input
                placeholder="e.g. How to sell your home without a realtor in Atlanta"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="bg-input border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Content Pillar</label>
                <Select value={form.contentPillar} onValueChange={v => setForm(f => ({ ...f, contentPillar: v as any }))}>
                  <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PILLARS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Priority</label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                  <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Target Market</label>
                <Input
                  placeholder="e.g. Atlanta, GA"
                  value={form.targetMarket}
                  onChange={e => setForm(f => ({ ...f, targetMarket: e.target.value }))}
                  className="bg-input border-border"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Conversion Goal</label>
                <Select value={form.conversionGoal} onValueChange={v => setForm(f => ({ ...f, conversionGoal: v as any }))}>
                  <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GOALS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Target Keyword</label>
              <Input
                placeholder="e.g. sell home without realtor Atlanta"
                value={form.targetKeyword}
                onChange={e => setForm(f => ({ ...f, targetKeyword: e.target.value }))}
                className="bg-input border-border"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Notes</label>
              <Input
                placeholder="Optional notes or context…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-input border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createTopic.mutate(form)}
              disabled={!form.title.trim() || createTopic.isPending}
            >
              {createTopic.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add Topic
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
