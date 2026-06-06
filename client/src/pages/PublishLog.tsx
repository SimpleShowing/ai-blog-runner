import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, ExternalLink, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PublishLog() {
  const { data: logs, isLoading } = trpc.wordpress.getAllLogs.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Publish Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          History of all WordPress publishing attempts from this dashboard.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No publish attempts yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Approved drafts pushed to WordPress will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Draft</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">WP Post ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">WP Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Rank Math</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Pushed At</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Link</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors hover:bg-secondary/50",
                    !log.success && "bg-red-500/5"
                  )}
                >
                  <td className="px-4 py-3">
                    {log.success ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-foreground font-medium">Draft #{log.draftId}</span>
                    {log.errorMessage && (
                      <p className="text-xs text-red-400 mt-0.5 max-w-xs truncate">{log.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {log.wpPostId || <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {log.wpStatus ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400">
                        {log.wpStatus}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.rankMathPopulated ? (
                      <span className="text-xs text-green-400 font-medium">Populated</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.pushedAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {log.wpPostUrl ? (
                      <a
                        href={log.wpPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
