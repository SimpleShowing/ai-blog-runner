import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  CreditCard,
  ExternalLink,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysOverdue(publishedAt: Date | string | null | undefined): number {
  if (!publishedAt) return 0;
  const ms = Date.now() - new Date(publishedAt).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  if (status === "paid") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Paid
      </Badge>
    );
  }
  if (status === "refunded") {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1">
        <AlertTriangle className="w-3 h-3" /> Refunded
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/15 text-red-600 border-red-500/30 gap-1">
      <Clock className="w-3 h-3" /> Unpaid
    </Badge>
  );
}

function ReminderBadge({
  day3,
  day5,
  day7,
}: {
  day3: string | null | undefined;
  day5: string | null | undefined;
  day7: string | null | undefined;
}) {
  const sent = [day3 && "D3", day5 && "D5", day7 && "D7"].filter(Boolean);
  if (sent.length === 0) return <span className="text-muted-foreground text-xs">None sent</span>;
  return (
    <div className="flex gap-1">
      {sent.map((d) => (
        <Badge key={d} variant="outline" className="text-xs px-1.5 py-0">
          {d}
        </Badge>
      ))}
    </div>
  );
}

// ─── All Payments Tab ─────────────────────────────────────────────────────────

function AllPaymentsTab() {
  const { data, isLoading } = trpc.payments.list.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <CreditCard className="w-10 h-10 opacity-30" />
        <p className="text-sm">No published partner submissions yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Partner</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Paid On</TableHead>
            <TableHead>Reminders</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((sub) => (
            <TableRow key={sub.id}>
              <TableCell>
                <div className="text-sm font-medium">{sub.partnerName}</div>
                <div className="text-xs text-muted-foreground">{sub.partnerEmail}</div>
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm">{sub.title}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs capitalize">
                  {sub.submissionType.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">{formatCents(sub.amountCents)}</TableCell>
              <TableCell>
                <PaymentStatusBadge status={sub.paymentStatus} />
              </TableCell>
              <TableCell className="text-sm">{formatDate(sub.publishedAt)}</TableCell>
              <TableCell className="text-sm">{formatDate(sub.paidAt)}</TableCell>
              <TableCell>
                <ReminderBadge
                  day3={sub.reminderDay3TaskUid}
                  day5={sub.reminderDay5TaskUid}
                  day7={sub.reminderDay7TaskUid}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {sub.stripePaymentLinkUrl && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              navigator.clipboard.writeText(sub.stripePaymentLinkUrl!);
                              toast.success("Payment link copied");
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy payment link</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => window.open(sub.stripePaymentLinkUrl!, "_blank")}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open payment link</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {sub.wpPostUrl && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => window.open(sub.wpPostUrl!, "_blank")}
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View live article</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Unpaid / Overdue Tab ─────────────────────────────────────────────────────

function UnpaidTab() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.payments.listUnpaid.useQuery();

  const extendGrace = trpc.partnerSubmissions.extendGrace.useMutation({
    onSuccess: () => {
      toast.success("Grace period extended — reminder sequence paused.");
      utils.payments.listUnpaid.invalidate();
      utils.payments.list.invalidate();
    },
    onError: () => toast.error("Failed to extend grace period."),
  });

  const markRemoved = trpc.partnerSubmissions.markRemovedUnpaid.useMutation({
    onSuccess: () => {
      toast.success("Submission marked as removed due to non-payment.");
      utils.payments.listUnpaid.invalidate();
      utils.payments.list.invalidate();
    },
    onError: () => toast.error("Failed to mark as removed."),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-60" />
        <p className="text-sm font-medium">All published articles have been paid.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Partner</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Days Overdue</TableHead>
            <TableHead>Reminders Sent</TableHead>
            <TableHead>Grace</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((sub) => {
            const overdue = daysOverdue(sub.publishedAt);
            const isRemoved = sub.status !== "published";
            return (
              <TableRow key={sub.id} className={isRemoved ? "opacity-60" : ""}>
                <TableCell>
                  <div className="text-sm font-medium">{sub.partnerName}</div>
                  <div className="text-xs text-muted-foreground">{sub.partnerEmail}</div>
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-sm">{sub.title}</TableCell>
                <TableCell className="font-mono text-sm">{formatCents(sub.amountCents)}</TableCell>
                <TableCell className="text-sm">{formatDate(sub.publishedAt)}</TableCell>
                <TableCell>
                  <span
                    className={
                      overdue >= 7
                        ? "text-red-600 font-semibold text-sm"
                        : overdue >= 5
                        ? "text-amber-600 font-medium text-sm"
                        : "text-muted-foreground text-sm"
                    }
                  >
                    {overdue}d
                  </span>
                </TableCell>
                <TableCell>
                  <ReminderBadge
                    day3={sub.reminderDay3TaskUid}
                    day5={sub.reminderDay5TaskUid}
                    day7={sub.reminderDay7TaskUid}
                  />
                </TableCell>
                <TableCell>
                  {sub.paymentGraceExtended ? (
                    <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">
                      Extended
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {sub.stripePaymentLinkUrl && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                navigator.clipboard.writeText(sub.stripePaymentLinkUrl!);
                                toast.success("Payment link copied");
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy payment link</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {!sub.paymentGraceExtended && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={extendGrace.isPending}
                              onClick={() => extendGrace.mutate({ id: sub.id, extend: true })}
                            >
                              <ShieldAlert className="w-3 h-3 mr-1" />
                              Extend Grace
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Pause reminder sequence for this submission</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {sub.status === "published" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              disabled={markRemoved.isPending}
                              onClick={() => {
                                if (confirm(`Remove "${sub.title}" from WordPress due to non-payment?`)) {
                                  markRemoved.mutate({ id: sub.id });
                                }
                              }}
                            >
                              Mark Removed
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Set WP post to draft and mark as removed</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Payments() {
  const [tab, setTab] = useState("unpaid");
  const { data: unpaid } = trpc.payments.listUnpaid.useQuery();

  return (
    <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Payments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track partner submission payments, reminder cadences, and overdue invoices.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="unpaid" className="gap-2">
              Unpaid / Overdue
              {unpaid && unpaid.length > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 h-4 min-w-4">
                  {unpaid.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="unpaid">
            <UnpaidTab />
          </TabsContent>

          <TabsContent value="all">
            <AllPaymentsTab />
          </TabsContent>
        </Tabs>
    </div>
  );
}
