import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Search, FileText, ArrowRight, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "published", label: "Published" },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", `badge-${status}`)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function Drafts() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: drafts, isLoading } = trpc.drafts.list.useQuery();

  const filtered = (drafts || []).filter(d => {
    const matchSearch = !search || (d.title || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Drafts & Review</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          {drafts?.length || 0} total · {drafts?.filter(d => d.status === "in_review").length || 0} awaiting review
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
          <Input
            placeholder="Search drafts…"
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

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm font-medium text-foreground">No drafts found</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              Generate a draft from an approved topic brief
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--muted-foreground)" }}>Version</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: "var(--muted-foreground)" }}>Updated</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {filtered.map(draft => (
                <tr key={draft.id} className="hover:bg-accent/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <Link href={`/drafts/${draft.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block max-w-sm">
                        {draft.title || `Draft #${draft.id}`}
                      </Link>
                      {draft.seoTitle && (
                        <p className="text-xs truncate max-w-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          SEO: {draft.seoTitle}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>v{draft.version}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                      <Clock className="w-3 h-3" />
                      {new Date(draft.updatedAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={draft.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/drafts/${draft.id}`} className="inline-flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary" style={{ color: "var(--muted-foreground)" }}>
                      Review <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
