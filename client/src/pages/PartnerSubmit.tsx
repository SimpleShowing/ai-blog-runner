import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, AlertTriangle, Link2, ExternalLink, Info } from "lucide-react";

type LinkType = "do_follow" | "internal" | "authoritative";

type DeclaredLink = {
  url: string;
  anchorText: string;
  linkType: LinkType;
};

type FormData = {
  partnerName: string;
  partnerEmail: string;
  partnerCompany: string;
  title: string;
  category: string;
  submissionType: "guest_post" | "link_insertion";
  extraDfLink: boolean;
  contentMode: "paste" | "google_docs" | "docx";
  contentText: string;
  googleDocsUrl: string;
  targetArticleUrl: string;
  declaredLinks: DeclaredLink[];
};

const CATEGORIES = [
  "Home Buying", "Home Selling", "Real Estate Tips", "Home Improvement",
  "Electrical", "Plumbing", "HVAC", "Roofing", "Landscaping",
  "Interior Design", "Kitchen & Bath", "Financing & Mortgages",
  "Market Trends", "Neighborhood Guides", "Moving Tips", "Other",
];

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  do_follow: "Do-Follow (your link)",
  internal: "Internal (simpleshowing.com)",
  authoritative: "Authoritative (external authority site)",
};

const LINK_TYPE_COLORS: Record<LinkType, string> = {
  do_follow: "bg-blue-50 text-blue-700 border-blue-200",
  internal: "bg-green-50 text-green-700 border-green-200",
  authoritative: "bg-purple-50 text-purple-700 border-purple-200",
};

function getPricing(type: "guest_post" | "link_insertion", extraDf: boolean): number {
  if (type === "link_insertion") return 125;
  return extraDf ? 175 : 150;
}

export default function PartnerSubmit() {
  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [docxUploading, setDocxUploading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);

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
      extraDfLink: false,
      contentMode: "paste",
      declaredLinks: [
        { url: "", anchorText: "", linkType: "do_follow" },
        { url: "", anchorText: "", linkType: "internal" },
        { url: "", anchorText: "", linkType: "authoritative" },
      ],
    },
  });

  const { fields, append, remove, update } = useFieldArray({ control, name: "declaredLinks" });

  const submissionType = watch("submissionType");
  const contentMode = watch("contentMode");
  const extraDfLink = watch("extraDfLink");
  const declaredLinks = watch("declaredLinks");

  const price = getPricing(submissionType, extraDfLink);

  // Validation helpers for guest_post link requirements
  const hasDoFollow = declaredLinks.some(l => l.linkType === "do_follow");
  const hasInternal = declaredLinks.some(l => l.linkType === "internal");
  const hasAuthoritative = declaredLinks.some(l => l.linkType === "authoritative");
  const doFollowCount = declaredLinks.filter(l => l.linkType === "do_follow").length;
  const expectedDfCount = extraDfLink ? 2 : 1;

  const submitMutation = trpc.partnerSubmissions.submit.useMutation({
    onSuccess: (data) => {
      setSubmissionId(data.id);
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error("Submission failed: " + err.message);
    },
  });

  const handleDocxUpload = async (file: File): Promise<string | null> => {
    setDocxUploading(true);
    setDocxError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/docx", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      return json.text as string;
    } catch (err) {
      setDocxError(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setDocxUploading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    // Guest post link validation
    if (data.submissionType === "guest_post") {
      const df = data.declaredLinks.filter(l => l.linkType === "do_follow").length;
      const internal = data.declaredLinks.filter(l => l.linkType === "internal").length;
      const auth = data.declaredLinks.filter(l => l.linkType === "authoritative").length;
      const expectedDf = data.extraDfLink ? 2 : 1;
      if (df !== expectedDf) {
        toast.error(`You must declare exactly ${expectedDf} do-follow link${expectedDf > 1 ? "s" : ""}.`);
        return;
      }
      if (internal < 1) {
        toast.error("You must declare at least 1 internal SimpleShowing link.");
        return;
      }
      if (auth < 1) {
        toast.error("You must declare at least 1 authoritative external link.");
        return;
      }
    }

    let finalContentText = data.contentMode === "paste" ? data.contentText || undefined : undefined;
    if (data.contentMode === "docx") {
      if (!docxFile) { toast.error("Please select a .docx file to upload."); return; }
      const extracted = await handleDocxUpload(docxFile);
      if (!extracted) return;
      finalContentText = extracted;
    }

    submitMutation.mutate({
      partnerName: data.partnerName,
      partnerEmail: data.partnerEmail,
      partnerCompany: data.partnerCompany || undefined,
      title: data.title,
      category: data.category || undefined,
      submissionType: data.submissionType,
      extraDfLink: data.extraDfLink,
      contentText: finalContentText,
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
            <h2 className="text-2xl font-bold text-white">Submission Received!</h2>
            <p className="text-slate-300">
              Thank you for your submission. Our team will review your article and get back to you
              within 2–3 business days.
            </p>
            {submissionId && (
              <p className="text-sm text-slate-400">
                Reference ID: <span className="font-mono font-semibold text-slate-200">#{submissionId}</span>
              </p>
            )}
            <Separator />
            <p className="text-sm text-slate-400">
              Questions? Email us at{" "}
              <a href="mailto:hello@simpleshowing.com" className="text-blue-400 hover:underline">
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
          <img
            src="/ss-icon.png"
            alt="SimpleShowing"
            className="h-9 w-9 rounded-lg object-contain"
          />
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
                  <li>All content must be original and relevant to real estate, home improvement/decor, finance, or other related topics.</li>
                  <li>Guest posts require 1 internal SimpleShowing link and 1 authoritative external link.</li>
                  <li>You must declare all do-follow outbound links in the form below.</li>
                  <li>Links to gambling, adult, pharmaceutical, or unrelated sites will be rejected.</li>
                  <li>Payment is due upon publication — you will receive an invoice when your article goes live.</li>
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

          {/* Submission Type + Pricing */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submission Type &amp; Pricing</CardTitle>
              <CardDescription>Payment is invoiced after your article is published — no upfront payment required.</CardDescription>
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
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-slate-900">
                        {type === "guest_post" ? "Guest Post" : "Link Insertion"}
                      </div>
                      <span className="text-sm font-bold text-teal-700">
                        {type === "link_insertion" ? "$125" : (extraDfLink && submissionType === "guest_post" ? "$175" : "$150")}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {type === "guest_post"
                        ? "Submit a full original article (1 DF link + internal + authoritative)."
                        : "Request a do-follow link inserted into an existing SimpleShowing article."}
                    </div>
                  </button>
                ))}
              </div>

              {/* Extra DF link add-on — guest post only */}
              {submissionType === "guest_post" && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Add a 2nd do-follow link <span className="text-teal-700 font-semibold">+$25</span></p>
                    <p className="text-xs text-slate-500 mt-0.5">Includes a second do-follow link in your article. Total: <strong>$175</strong></p>
                  </div>
                  <Switch
                    checked={extraDfLink}
                    onCheckedChange={(v) => setValue("extraDfLink", v)}
                  />
                </div>
              )}

              {/* Price summary */}
              <div className="flex items-center justify-between rounded-lg bg-teal-600 text-white px-4 py-3">
                <span className="text-sm font-medium">Your total (due after publication)</span>
                <span className="text-xl font-bold">${price}</span>
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
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select
                  onValueChange={(v) => setValue("category", v, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  {...register("category", { required: "Please select a category" })}
                />
                {errors.category && <p className="text-xs text-red-500">{errors.category.message}</p>}
              </div>

              {submissionType === "guest_post" && (
                <>
                  {/* Content mode toggle */}
                  <div className="space-y-1.5">
                    <Label>Article Content</Label>
                    <div className="flex gap-2">
                      {(["paste", "google_docs", "docx"] as const).map((mode) => (
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
                          {mode === "paste" ? "Paste Content" : mode === "google_docs" ? "Google Docs Link" : "Upload .docx"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {contentMode === "paste" && (
                    <div className="space-y-1.5">
                      <Textarea
                        placeholder="Paste your full article content here. HTML, Markdown, or plain text are all accepted."
                        rows={12}
                        className="font-mono text-sm resize-y"
                        {...register("contentText")}
                      />
                      <p className="text-xs text-slate-400">Minimum 300 words recommended.</p>
                    </div>
                  )}
                  {contentMode === "google_docs" && (
                    <div className="space-y-1.5">
                      <Input
                        placeholder="https://docs.google.com/document/d/..."
                        {...register("googleDocsUrl")}
                      />
                      <p className="text-xs text-slate-400">Make sure the document is set to &quot;Anyone with the link can view&quot;.</p>
                    </div>
                  )}
                  {contentMode === "docx" && (
                    <div className="space-y-1.5">
                      <input
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setDocxFile(f);
                          setDocxError(null);
                        }}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                      />
                      {docxFile && (
                        <p className="text-xs text-teal-700">Selected: {docxFile.name}</p>
                      )}
                      {docxError && (
                        <p className="text-xs text-red-500">{docxError}</p>
                      )}
                      <p className="text-xs text-slate-400">Maximum file size: 10 MB. Only .docx format is accepted.</p>
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
                Declare All Links
              </CardTitle>
              <CardDescription>
                {submissionType === "guest_post"
                  ? `Guest posts require: ${expectedDfCount} do-follow link${expectedDfCount > 1 ? "s" : ""} (yours), 1 internal SimpleShowing link, and 1 authoritative external link.`
                  : "Declare the do-follow link you want inserted."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Link requirement checklist for guest posts */}
              {submissionType === "guest_post" && (
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${doFollowCount >= expectedDfCount ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {doFollowCount >= expectedDfCount ? "✓" : "○"} {expectedDfCount} do-follow link{expectedDfCount > 1 ? "s" : ""}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${hasInternal ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {hasInternal ? "✓" : "○"} 1 internal link
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${hasAuthoritative ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {hasAuthoritative ? "✓" : "○"} 1 authoritative link
                  </span>
                </div>
              )}

              {fields.length === 0 && (
                <p className="text-sm text-slate-400 italic">No links declared yet. Click &quot;Add Link&quot; to add one.</p>
              )}

              {fields.map((field, index) => (
                <div key={field.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5 flex-wrap">
                      {(["do_follow", "internal", "authoritative"] as LinkType[]).map((lt) => (
                        <button
                          key={lt}
                          type="button"
                          onClick={() => update(index, { ...field, ...watch(`declaredLinks.${index}`), linkType: lt })}
                          className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-all ${
                            watch(`declaredLinks.${index}.linkType`) === lt
                              ? LINK_TYPE_COLORS[lt]
                              : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {lt === "do_follow" ? "Do-Follow" : lt === "internal" ? "Internal" : "Authoritative"}
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0 h-7 w-7"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder={
                        watch(`declaredLinks.${index}.linkType`) === "internal"
                          ? "https://www.simpleshowing.com/blog/..."
                          : "https://example.com/page"
                      }
                      {...register(`declaredLinks.${index}.url`, {
                        required: "URL is required",
                        pattern: { value: /^https?:\/\/.+/, message: "Must be a valid URL" },
                        validate: (val) => {
                          const lt = watch(`declaredLinks.${index}.linkType`);
                          if (lt === "internal" && !val.includes("simpleshowing.com")) {
                            return "Internal links must point to simpleshowing.com";
                          }
                          return true;
                        },
                      })}
                    />
                    <Input
                      placeholder="Anchor text (e.g. best HVAC tips)"
                      {...register(`declaredLinks.${index}.anchorText`, { required: "Anchor text is required" })}
                    />
                  </div>
                  {errors.declaredLinks?.[index]?.url && (
                    <p className="text-xs text-red-500">{errors.declaredLinks[index]?.url?.message}</p>
                  )}
                  {watch(`declaredLinks.${index}.linkType`) === "internal" && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Must link to a page on simpleshowing.com
                    </p>
                  )}
                  {watch(`declaredLinks.${index}.linkType`) === "authoritative" && (
                    <p className="text-xs text-purple-600 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Should be a well-known authority site (Wikipedia, .gov, major publications, etc.)
                    </p>
                  )}
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ url: "", anchorText: "", linkType: "do_follow" })}
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
              By submitting, you confirm this content is original and you have the right to publish it. Payment of <strong>${price}</strong> is due upon publication.
            </p>
            <Button
              type="submit"
              disabled={isSubmitting || submitMutation.isPending || docxUploading}
              className="bg-teal-600 hover:bg-teal-700 text-white px-8"
            >
              {submitMutation.isPending || docxUploading ? "Submitting..." : "Submit Article"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
