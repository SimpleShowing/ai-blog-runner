import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search, ExternalLink, CheckCircle2, XCircle, Clock, Eye,
  AlertTriangle, Link2, FileText, User, Mail, Building2,
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw,
} from "lucide-react";

type Submission = {
  id: number;
  partnerName: string;
  partnerEmail: string;
  partnerCompany: string | null;
  title: string;
  category: string | null;
  submissionType: "guest_post" | "link_insertion";
  contentText: string | null;
  googleDocsUrl: string | null;
  targetArticleUrl: string | null;
  declaredLinks: Array<{ url: string; anchorText: string }>;
  status: "pending" | "in_review" | "approved" | "rejected" | "published";
  reviewNotes: string | null;
  linkQaStatus: "pass" | "warn" | "fail" | null;
  linkQaDetails: string | null;
  wpPostId: number | null;
  wpPostUrl: string | null;
  createdAt: Date;
};

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  in_review: { label: "In Review", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Eye },
  approved: { label: "Approved", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  published: { label: "Published", color: "bg-purple-100 text-purple-800 border-purple-200", icon: CheckCircle2 },
};

const QA_CONFIG = {
  pass: { label: "Pass", color: "text-green-600", icon: ShieldCheck },
  warn: { label: "Warning", color: "text-yellow-600", icon: ShieldAlert },
  fail: { label: "Fail", color: "text-red-600", icon: ShieldX },
};

function StatusBadge({ status }: { status: Submission["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function QaBadge({ status }: { status: "pass" | "warn" | "fail" | null }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const cfg = QA_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

export default function PartnerSubmissions() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: submissions = [], isLoading } = trpc.partnerSubmissions.list.useQuery();

  const startReview = trpc.partnerSubmissions.startReview.useMutation({
    onSuccess: () => { utils.partnerSubmissions.list.invalidate(); toast.success("Marked as In Review"); },
  });

  const approve = trpc.partnerSubmissions.approve.useMutation({
    onSuccess: () => {
      utils.partnerSubmissions.list.invalidate();
      toast.success("Submission approved");
      if (selected) setSelected(null);
    },
  });

  const reject = trpc.partnerSubmissions.reject.useMutation({
    onSuccess: () => {
      utils.partnerSubmissions.list.invalidate();
      toast.success("Submission rejected");
      setShowRejectDialog(false);
      setRejectNotes("");
      if (selected) setSelected(null);
    },
  });

  const runQa = trpc.partnerSubmissions.runLinkQa.useMutation({
    onSuccess: (data) => {
      utils.partnerSubmissions.list.invalidate();
      toast.success(`QA complete: ${data.linkQaStatus.toUpperCase()}${data.flagged.length > 0 ? ` — ${data.flagged.length} flagged` : ""}`);
    },
  });

  const filtered = submissions.filter((s) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.partnerName.toLowerCase().includes(q) ||
      s.partnerEmail.toLowerCase().includes(q) ||
      (s.partnerCompany ?? "").toLowerCase().includes(q)
    );
  });

  const handleOpenDetail = (sub: Submission) => {
    setSelected(sub);
    if (sub.status === "pending") {
      startReview.mutate({ id: sub.id });
    }
  };

  const handleReject = (id: number) => {
    setRejectTarget(id);
    setRejectNotes("");
    setShowRejectDialog(true);
  };

  const confirmReject = () => {
    if (!rejectTarget || !rejectNotes.trim()) return;
    reject.mutate({ id: rejectTarget, reviewNotes: rejectNotes });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Partner Submissions</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Review guest posts and link insertion requests from affiliate partners.
            </p>
          </div>
          <a
            href="/submit"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            <ExternalLink className="h-4 w-4" />
            View Submission Form
          </a>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = submissions.filter((s) => s.status === key).length;
            const Icon = cfg.icon;
            return (
              <Card key={key} className="shadow-sm">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-slate-500">{cfg.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{count}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by title, partner, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Submission</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Partner</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Link QA</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Submitted</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading...</td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      {search ? "No submissions match your search." : "No submissions yet."}
                    </td>
                  </tr>
                )}
                {filtered.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleOpenDetail(sub as Submission)}
                        className="text-left hover:text-teal-600 transition-colors"
                      >
                        <p className="font-medium text-slate-900 line-clamp-1">{sub.title}</p>
                        {sub.category && <p className="text-xs text-slate-400">{sub.category}</p>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{sub.partnerName}</p>
                      <p className="text-xs text-slate-400">{sub.partnerEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-600">
                        {sub.submissionType === "guest_post" ? "Guest Post" : "Link Insertion"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <QaBadge status={sub.linkQaStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleOpenDetail(sub as Submission)}
                        >
                          Review
                        </Button>
                        {sub.status === "pending" || sub.status === "in_review" ? (
                          <>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => approve.mutate({ id: sub.id })}
                              disabled={approve.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleReject(sub.id)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {sub.wpPostUrl && (
                          <a href={sub.wpPostUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                              <ExternalLink className="h-3 w-3" /> WP
                            </Button>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Detail Dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg pr-8">{selected.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-slate-400">
                  {selected.submissionType === "guest_post" ? "Guest Post" : "Link Insertion"}
                </span>
                {selected.category && (
                  <Badge variant="outline" className="text-xs">{selected.category}</Badge>
                )}
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Partner info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="h-4 w-4 text-slate-400" />
                  <span>{selected.partnerName}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <a href={`mailto:${selected.partnerEmail}`} className="hover:text-teal-600">{selected.partnerEmail}</a>
                </div>
                {selected.partnerCompany && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span>{selected.partnerCompany}</span>
                  </div>
                )}
                {selected.targetArticleUrl && (
                  <div className="flex items-center gap-2 text-slate-600 col-span-2">
                    <Link2 className="h-4 w-4 text-slate-400" />
                    <a href={selected.targetArticleUrl} target="_blank" rel="noopener noreferrer" className="hover:text-teal-600 truncate">
                      {selected.targetArticleUrl}
                    </a>
                  </div>
                )}
              </div>

              <Separator />

              {/* Link QA */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Link2 className="h-4 w-4" /> Declared Links
                    <QaBadge status={selected.linkQaStatus} />
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => runQa.mutate({ id: selected.id })}
                    disabled={runQa.isPending}
                  >
                    <RefreshCw className={`h-3 w-3 ${runQa.isPending ? "animate-spin" : ""}`} />
                    Re-run QA
                  </Button>
                </div>
                {selected.linkQaDetails && (
                  <p className={`text-xs mb-2 ${selected.linkQaStatus === "fail" ? "text-red-600" : "text-slate-500"}`}>
                    {selected.linkQaDetails}
                  </p>
                )}
                {selected.declaredLinks.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No links declared.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selected.declaredLinks.map((link, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1.5">
                        <Link2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex-1">
                          {link.url}
                        </a>
                        <span className="text-slate-500 flex-shrink-0">"{link.anchorText}"</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Content */}
              {selected.googleDocsUrl && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Google Docs Link
                  </h4>
                  <a
                    href={selected.googleDocsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {selected.googleDocsUrl} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {selected.contentText && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Article Content
                  </h4>
                  <div className="bg-slate-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {selected.contentText}
                    </pre>
                  </div>
                </div>
              )}

              {/* Review notes */}
              {selected.reviewNotes && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">Review Notes</h4>
                  <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    {selected.reviewNotes}
                  </p>
                </div>
              )}

              {/* WP link if published */}
              {selected.wpPostUrl && (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-purple-700">Published:</span>
                  <a href={selected.wpPostUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline truncate">
                    {selected.wpPostUrl}
                  </a>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              {(selected.status === "pending" || selected.status === "in_review") && (
                <>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleReject(selected.id)}
                  >
                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => approve.mutate({ id: selected.id })}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    {approve.isPending ? "Approving..." : "Approve"}
                  </Button>
                </>
              )}
              {selected.status === "approved" && (
                <p className="text-sm text-slate-500 italic">
                  Approved — copy the content into a new draft to push to WordPress.
                </p>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">Please provide a reason for rejection. This will be visible to the team.</p>
            <Textarea
              placeholder="e.g. Contains a link to a gambling site. Please remove and resubmit."
              rows={4}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmReject}
              disabled={!rejectNotes.trim() || reject.isPending}
            >
              {reject.isPending ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
