import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, AlertTriangle, FileText, Link2, ExternalLink } from "lucide-react";

type FormData = {
  partnerName: string;
  partnerEmail: string;
  partnerCompany: string;
  title: string;
  category: string;
  submissionType: "guest_post" | "link_insertion";
  contentMode: "paste" | "google_docs";
  contentText: string;
  googleDocsUrl: string;
  targetArticleUrl: string;
  declaredLinks: Array<{ url: string; anchorText: string }>;
};

const CATEGORIES = [
  "Home Buying", "Home Selling", "Real Estate Tips", "Home Improvement",
  "Electrical", "Plumbing", "HVAC", "Roofing", "Landscaping",
  "Interior Design", "Kitchen & Bath", "Financing & Mortgages",
  "Market Trends", "Neighborhood Guides", "Moving Tips", "Other",
];

export default function PartnerSubmit() {
  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      submissionType: "guest_post",
      contentMode: "paste",
      declaredLinks: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "declaredLinks" });

  const submissionType = watch("submissionType");
  const contentMode = watch("contentMode");

  const submitMutation = trpc.partnerSubmissions.submit.useMutation({
    onSuccess: (data) => {
      setSubmissionId(data.id);
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error("Submission failed: " + err.message);
    },
  });

  const onSubmit = (data: FormData) => {
    submitMutation.mutate({
      partnerName: data.partnerName,
      partnerEmail: data.partnerEmail,
      partnerCompany: data.partnerCompany || undefined,
      title: data.title,
      category: data.category || undefined,
      submissionType: data.submissionType,
      contentText: data.contentMode === "paste" ? data.contentText || undefined : undefined,
      googleDocsUrl: data.contentMode === "google_docs" ? data.googleDocsUrl || undefined : undefined,
      targetArticleUrl: data.submissionType === "link_insertion" ? data.targetArticleUrl || undefined : undefined,
      declaredLinks: data.declaredLinks,
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-lg">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Submission Received!</h2>
            <p className="text-slate-600">
              Thank you for your submission. Our team will review your article and get back to you
              within 2–3 business days.
            </p>
            {submissionId && (
              <p className="text-sm text-slate-500">
                Reference ID: <span className="font-mono font-semibold text-slate-700">#{submissionId}</span>
              </p>
            )}
            <Separator />
            <p className="text-sm text-slate-500">
              Questions? Email us at{" "}
              <a href="mailto:hello@simpleshowing.com" className="text-blue-600 hover:underline">
                hello@simpleshowing.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-teal-600 flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">SimpleShowing Partner Portal</h1>
            <p className="text-sm text-slate-500">Guest Post &amp; Link Insertion Submissions</p>
          </div>
          <div className="ml-auto">
            <a
              href="https://www.simpleshowing.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-slate-500 hover:text-teal-600 flex items-center gap-1 transition-colors"
            >
              simpleshowing.com <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        {/* Intro card */}
        <Card className="border-teal-200 bg-teal-50/60">
          <CardContent className="pt-5 pb-5">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-teal-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-teal-800 space-y-1">
                <p className="font-semibold">Before you submit, please note:</p>
                <ul className="list-disc list-inside space-y-0.5 text-teal-700">
                  <li>All content must be original and relevant to real estate or home improvement.</li>
                  <li>You must declare all do-follow outbound links in the form below.</li>
                  <li>Links to gambling, adult, pharmaceutical, or unrelated sites will be rejected.</li>
                  <li>Our team reviews all submissions within 2–3 business days.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Partner Info */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="partnerName">Full Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="partnerName"
                    placeholder="Jane Smith"
                    {...register("partnerName", { required: "Name is required" })}
                  />
                  {errors.partnerName && <p className="text-xs text-red-500">{errors.partnerName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="partnerEmail">Email Address <span className="text-red-500">*</span></Label>
                  <Input
                    id="partnerEmail"
                    type="email"
                    placeholder="jane@agency.com"
                    {...register("partnerEmail", {
                      required: "Email is required",
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email" },
                    })}
                  />
                  {errors.partnerEmail && <p className="text-xs text-red-500">{errors.partnerEmail.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partnerCompany">Company / Agency <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  id="partnerCompany"
                  placeholder="Acme SEO Agency"
                  {...register("partnerCompany")}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submission Type */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submission Type</CardTitle>
              <CardDescription>Choose whether you are submitting a full guest post or requesting a link insertion into an existing SimpleShowing article.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["guest_post", "link_insertion"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setValue("submissionType", type)}
                    className={`rounded-lg border-2 p-4 text-left transition-all ${
                      submissionType === type
                        ? "border-teal-500 bg-teal-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="font-semibold text-sm text-slate-900">
                      {type === "guest_post" ? "Guest Post" : "Link Insertion"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {type === "guest_post"
                        ? "Submit a full original article to be published on the SimpleShowing blog."
                        : "Request a do-follow link inserted into an existing SimpleShowing article."}
                    </div>
                  </button>
                ))}
              </div>

              {submissionType === "link_insertion" && (
                <div className="space-y-1.5">
                  <Label htmlFor="targetArticleUrl">Target SimpleShowing Article URL <span className="text-red-500">*</span></Label>
                  <Input
                    id="targetArticleUrl"
                    placeholder="https://www.simpleshowing.com/blog/..."
                    {...register("targetArticleUrl", {
                      required: submissionType === "link_insertion" ? "Target article URL is required" : false,
                    })}
                  />
                  {errors.targetArticleUrl && <p className="text-xs text-red-500">{errors.targetArticleUrl.message}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Article Details */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Article Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Article Title <span className="text-red-500">*</span></Label>
                <Input
                  id="title"
                  placeholder="10 Ways to Save on Your Home Renovation"
                  {...register("title", { required: "Title is required" })}
                />
                {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Category <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Select onValueChange={(v) => setValue("category", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {submissionType === "guest_post" && (
                <>
                  {/* Content mode toggle */}
                  <div className="space-y-1.5">
                    <Label>Article Content</Label>
                    <div className="flex gap-2">
                      {(["paste", "google_docs"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setValue("contentMode", mode)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                            contentMode === mode
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
                          }`}
                        >
                          {mode === "paste" ? "Paste Content" : "Google Docs Link"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {contentMode === "paste" ? (
                    <div className="space-y-1.5">
                      <Textarea
                        placeholder="Paste your full article content here. HTML, Markdown, or plain text are all accepted."
                        rows={12}
                        className="font-mono text-sm resize-y"
                        {...register("contentText")}
                      />
                      <p className="text-xs text-slate-400">Minimum 300 words recommended.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Input
                        placeholder="https://docs.google.com/document/d/..."
                        {...register("googleDocsUrl")}
                      />
                      <p className="text-xs text-slate-400">Make sure the document is set to &quot;Anyone with the link can view&quot;.</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Declared Links */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Declare All Do-Follow Outbound Links
              </CardTitle>
              <CardDescription>
                You must list every do-follow link you want included. Undisclosed links found during review will result in rejection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.length === 0 && (
                <p className="text-sm text-slate-400 italic">No links declared yet. Click &quot;Add Link&quot; to add one.</p>
              )}
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder="https://example.com/page"
                      {...register(`declaredLinks.${index}.url`, {
                        required: "URL is required",
                        pattern: { value: /^https?:\/\/.+/, message: "Must be a valid URL" },
                      })}
                    />
                    <Input
                      placeholder="Anchor text (e.g. best HVAC tips)"
                      {...register(`declaredLinks.${index}.anchorText`, { required: "Anchor text is required" })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ url: "", anchorText: "" })}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Link
              </Button>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center justify-between pb-10">
            <p className="text-xs text-slate-400">
              By submitting, you confirm this content is original and you have the right to publish it.
            </p>
            <Button
              type="submit"
              disabled={isSubmitting || submitMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white px-8"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Article"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
