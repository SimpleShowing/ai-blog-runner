import { useState, useRef, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Play,
  Upload,
  FileUp,
  AlertCircle,
  CheckCircle,
  GripVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Wand2,
  Square,
  SquareCheck,
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

// ─── CSV parsing helpers ─────────────────────────────────────────────────────

type ParsedRow = {
  keyword: string;
  traffic: number;
  kwVolume: number;
  contentType: ContentType;
  source: "clever" | "houzeo" | "manual";
  sourceUrl?: string;
  // New optional Clever/Houzeo columns
  referringDomains?: number;
  numKeywords?: number;
  position?: number;
  previousTopKeyword?: string;
};

type ParseError = { row: number; message: string };

const CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
  informational: "informational",
  info: "informational",
  "article": "informational",
  "article > research": "informational",
  "article > how-to": "informational",
  "article > definition": "informational",
  "article > listicle": "informational",
  "article > guide": "informational",
  "article > review": "informational",
  "article > comparison": "comparison",
  "article > vs": "comparison",
  "lead gen": "lead_gen",
  lead_gen: "lead_gen",
  leadgen: "lead_gen",
  "lead-gen": "lead_gen",
  "lead generation": "lead_gen",
  affiliate: "affiliate",
  aff: "affiliate",
  comparison: "comparison",
  compare: "comparison",
  vs: "comparison",
};

function parseCSV(text: string): { rows: ParsedRow[]; errors: ParseError[] } {
  // Strip BOM if present
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, message: "File appears empty or has no data rows" }] };

  // Detect delimiter (tab preferred for Clever exports, else comma)
  const delim = lines[0].includes("\t") ? "\t" : ",";

  // Parse header — normalize to lowercase, strip quotes
  const headers = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/["'\uFEFF]/g, ""));

  // Map header names to field indices — broad matching for Clever/Houzeo variants
  const idx = {
    keyword:            headers.findIndex(h => ["keyword", "kw", "query", "term", "topic"].includes(h)),
    traffic:            headers.findIndex(h => ["traffic", "current traffic", "currenttraffic", "visits", "monthly traffic", "est. traffic", "estimated traffic", "organic traffic"].includes(h)),
    kwVolume:           headers.findIndex(h => ["kw volume", "kwvolume", "search volume", "sv"].includes(h)),
    contentType:        headers.findIndex(h => ["content type", "contenttype", "conent type", "type", "intent"].includes(h)),
    source:             headers.findIndex(h => ["source", "competitor", "origin"].includes(h)),
    sourceUrl:          headers.findIndex(h => ["url", "source url", "sourceurl", "link"].includes(h)),
    referringDomains:   headers.findIndex(h => ["referring domains", "referringdomains", "ref domains", "rd"].includes(h)),
    numKeywords:        headers.findIndex(h => ["# of keywords", "# keywords", "num keywords", "keywords", "current # of keywords"].includes(h)),
    position:           headers.findIndex(h => ["position", "rank", "serp position", "pos"].includes(h)),
    previousTopKeyword: headers.findIndex(h => ["previous top keyword", "prev keyword", "previous keyword", "prev top keyword"].includes(h)),
  };

  if (idx.keyword === -1) {
    return { rows: [], errors: [{ row: 0, message: `Could not find a keyword column. Headers found: ${headers.join(", ")}` }] };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ""));
    const keyword = cells[idx.keyword]?.trim();
    if (!keyword) continue;

    const trafficRaw = idx.traffic >= 0 ? cells[idx.traffic] : "";
    const kvRaw = idx.kwVolume >= 0 ? cells[idx.kwVolume] : trafficRaw;
    const traffic = parseInt(trafficRaw?.replace(/[^0-9]/g, "") || "0", 10) || 0;
    const kwVolume = parseInt(kvRaw?.replace(/[^0-9]/g, "") || "0", 10) || 0;

    const rawType = idx.contentType >= 0 ? cells[idx.contentType]?.toLowerCase().trim() : "";
    const contentType: ContentType = CONTENT_TYPE_ALIASES[rawType] ?? "informational";

    // Source: in Clever exports, the 'Source' column IS the article URL
    // Detect if the source cell is a URL (starts with http) and treat it as sourceUrl
    const rawSourceCell = idx.source >= 0 ? cells[idx.source]?.trim() : "";
    const rawUrlCell = idx.sourceUrl >= 0 ? cells[idx.sourceUrl]?.trim() : "";
    // If the source cell looks like a URL, use it as the sourceUrl
    const isSourceUrl = rawSourceCell.startsWith("http");
    const sourceUrl = (isSourceUrl ? rawSourceCell : rawUrlCell) || undefined;
    const rawSource = isSourceUrl ? sourceUrl ?? "" : rawSourceCell.toLowerCase();
    const source: "clever" | "houzeo" | "manual" =
      rawSource.includes("listwithclever") || rawSource.includes("clever") ? "clever" :
      rawSource.includes("houzeo") ? "houzeo" : "manual";

    // Optional enrichment columns
    const referringDomains = idx.referringDomains >= 0
      ? (parseInt(cells[idx.referringDomains]?.replace(/[^0-9]/g, "") || "", 10) || undefined)
      : undefined;
    const numKeywords = idx.numKeywords >= 0
      ? (parseInt(cells[idx.numKeywords]?.replace(/[^0-9]/g, "") || "", 10) || undefined)
      : undefined;
    const position = idx.position >= 0
      ? (parseInt(cells[idx.position]?.replace(/[^0-9]/g, "") || "", 10) || undefined)
      : undefined;
    const previousTopKeyword = idx.previousTopKeyword >= 0
      ? (cells[idx.previousTopKeyword]?.trim() || undefined)
      : undefined;

    rows.push({ keyword, traffic, kwVolume, contentType, source, sourceUrl,
      referringDomains, numKeywords, position, previousTopKeyword });
  }

  return { rows, errors };
}

// ─── Bulk Import Dialog ───────────────────────────────────────────────────────

function BulkImportDialog({ onImported, prominent }: { onImported: () => void; prominent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [fileName, setFileName] = useState("");
  const [defaultSource, setDefaultSource] = useState<"clever" | "houzeo" | "manual">("manual");
  const [defaultType, setDefaultType] = useState<ContentType>("informational");
  const fileRef = useRef<HTMLInputElement>(null);

  const seedTopics = trpc.blogPipeline.seedTopics.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.inserted} topics into the queue`);
      onImported();
      setOpen(false);
      setParsed(null);
      setFileName("");
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    // Sniff the first 4 bytes to detect UTF-16 LE BOM (FF FE) vs UTF-8
    const sniffer = new FileReader();
    sniffer.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(buf.slice(0, 4));
      const isUtf16LE = bytes[0] === 0xFF && bytes[1] === 0xFE;
      const encoding = isUtf16LE ? "utf-16le" : "utf-8";
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const { rows, errors } = parseCSV(text);
        setParsed(rows);
        setParseErrors(errors);
      };
      reader.readAsText(file, encoding);
    };
    sniffer.readAsArrayBuffer(file.slice(0, 4));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = () => {
    if (!parsed || parsed.length === 0) return;
    const topics = parsed.map(r => ({
      keyword: r.keyword,
      traffic: r.traffic,
      kwVolume: r.kwVolume,
      contentType: r.contentType === "informational" && defaultType !== "informational" ? defaultType : r.contentType,
      source: r.source === "manual" && defaultSource !== "manual" ? defaultSource : r.source,
      sourceUrl: r.sourceUrl,
      referringDomains: r.referringDomains,
      numKeywords: r.numKeywords,
      position: r.position,
      previousTopKeyword: r.previousTopKeyword,
    }));
    seedTopics.mutate({ topics });
  };

  const previewRows = parsed?.slice(0, 5) ?? [];

  return (
    <>
      {prominent ? (
        <Button onClick={() => setOpen(true)} className="gap-2 shrink-0">
          <Upload className="w-4 h-4" />
          Upload Topics
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Upload className="w-3.5 h-3.5" />
          Bulk Import
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setParsed(null); setFileName(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Import Topics from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV or TSV file. Only <code className="bg-muted px-1 rounded text-xs">keyword</code> is required.
              All other columns are optional: <code className="bg-muted px-1 rounded text-xs">current traffic</code>,{" "}
              <code className="bg-muted px-1 rounded text-xs">referring domains</code>,{" "}
              <code className="bg-muted px-1 rounded text-xs"># of keywords</code>,{" "}
              <code className="bg-muted px-1 rounded text-xs">position</code>,{" "}
              <code className="bg-muted px-1 rounded text-xs">previous top keyword</code>,{" "}
              <code className="bg-muted px-1 rounded text-xs">content type</code>,{" "}
              <code className="bg-muted px-1 rounded text-xs">source</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/60 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {fileName ? (
                <div className="flex flex-col items-center gap-2">
                  <FileUp className="w-8 h-8 text-primary" />
                  <p className="text-sm font-medium">{fileName}</p>
                  {parsed !== null && (
                    <p className="text-xs text-muted-foreground">{parsed.length} rows parsed</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="w-8 h-8" />
                  <p className="text-sm">Drop a CSV file here, or click to browse</p>
                  <p className="text-xs">Supports .csv, .tsv, .txt</p>
                </div>
              )}
            </div>

            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  {parseErrors.map((e, i) => <p key={i}>{e.message}</p>)}
                </div>
              </div>
            )}

            {/* Defaults for missing columns */}
            {parsed && parsed.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default source (for rows without a source column)</Label>
                  <Select value={defaultSource} onValueChange={(v) => setDefaultSource(v as any)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="clever">Clever</SelectItem>
                      <SelectItem value="houzeo">Houzeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default content type (for rows without a type column)</Label>
                  <Select value={defaultType} onValueChange={(v) => setDefaultType(v as any)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="informational">Informational</SelectItem>
                      <SelectItem value="lead_gen">Lead Gen</SelectItem>
                      <SelectItem value="affiliate">Affiliate</SelectItem>
                      <SelectItem value="comparison">Comparison</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Preview (first {previewRows.length} of {parsed!.length} rows)
                </p>
<div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Keyword</TableHead>
                        <TableHead className="text-xs w-20">Traffic</TableHead>
                        <TableHead className="text-xs w-16">Pos.</TableHead>
                        <TableHead className="text-xs w-16">Ref. D</TableHead>
                        <TableHead className="text-xs w-16"># KWs</TableHead>
                        <TableHead className="text-xs w-32">Content Type</TableHead>
                        <TableHead className="text-xs w-20">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs max-w-[180px]">
                            <div className="truncate">{row.keyword}</div>
                            {row.previousTopKeyword && (
                              <div className="text-muted-foreground truncate" title={`Prev: ${row.previousTopKeyword}`}>
                                ↳ {row.previousTopKeyword}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">{row.traffic > 0 ? formatTraffic(row.traffic) : "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{row.position ?? "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{row.referringDomains ?? "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{row.numKeywords ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            <ContentTypeBadge type={row.contentType} />
                          </TableCell>
                          <TableCell className="text-xs capitalize">{row.source}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {parsed!.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">…and {parsed!.length - 5} more rows</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={!parsed || parsed.length === 0 || seedTopics.isPending}
              className="gap-1.5"
            >
              {seedTopics.isPending
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <CheckCircle className="w-3.5 h-3.5" />}
              {seedTopics.isPending ? "Importing…" : `Import ${parsed?.length ?? 0} Topics`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
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

  const generateNow = trpc.blogPipeline.generateNow.useMutation({
    onSuccess: (data) => {
      if (!data.ok && "skipped" in data) {
        const msg = data.skipped === "wp-credentials-missing"
          ? "WordPress credentials not configured. Please add them in Settings."
          : "No pending topics in the queue. Add topics first.";
        toast.warning(msg);
      } else if (data.ok) {
        toast.success(
          <span>
            Published: <strong>{data.title}</strong>
            {data.wpPostUrl && (
              <a href={data.wpPostUrl} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
                View post
              </a>
            )}
          </span>
        );
        utils.blogPipeline.stats.invalidate();
        utils.blogPipeline.listPosts.invalidate();
        utils.blogPipeline.listTopics.invalidate();
      }
    },
    onError: (err) => toast.error(`Generation failed: ${err.message}`),
  });

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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => generateNow.mutate()}
            disabled={generateNow.isPending}
            className="gap-1.5"
          >
            {generateNow.isPending
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Play className="w-3 h-3" />}
            {generateNow.isPending ? "Generating…" : "Generate Now"}
          </Button>
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
    </div>
  );
}

// ─── Topic Queue Tab ──────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

type TopicRow = {
  id: number;
  keyword: string;
  contentType: string;
  traffic: number;
  source: string;
  status: string;
  priority: number;
  sourceUrl?: string | null;
  // Enrichment columns from Clever/Houzeo
  referringDomains?: number | null;
  numKeywords?: number | null;
  position?: number | null;
  previousTopKeyword?: string | null;
};

function SortableTopicRow({
  topic,
  onRestore,
  onGenerateDraft,
  isUpdating,
  isGenerating,
  isDragDisabled,
  isSelected,
  onToggleSelect,
}: {
  topic: TopicRow;
  onRestore: (id: number) => void;
  onGenerateDraft: (id: number) => void;
  isUpdating: boolean;
  isGenerating: boolean;
  isDragDisabled: boolean;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: topic.id, disabled: isDragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  // Extract hostname from sourceUrl for display
  const sourceLabel = (() => {
    if (!topic.sourceUrl) return topic.source || null;
    try {
      return new URL(topic.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return topic.source || null;
    }
  })();

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "bg-muted" : ""} ${isSelected ? "bg-primary/5" : ""}`}
    >
      {/* Checkbox */}
      <TableCell className="w-8 px-2">
        <button
          onClick={() => onToggleSelect(topic.id)}
          className="text-muted-foreground hover:text-foreground p-1 rounded"
          title={isSelected ? "Deselect" : "Select"}
        >
          {isSelected
            ? <SquareCheck className="w-4 h-4 text-primary" />
            : <Square className="w-4 h-4" />}
        </button>
      </TableCell>
      {/* Drag handle — only shown for pending topics on page 0 */}
      <TableCell className="w-8 px-2">
        {!isDragDisabled ? (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-6 inline-block" />
        )}
      </TableCell>
      <TableCell className="font-medium max-w-xs">
        <div className="truncate">{topic.keyword}</div>
        {topic.previousTopKeyword && (
          <div className="text-xs text-muted-foreground truncate" title={`Prev: ${topic.previousTopKeyword}`}>
            ↳ {topic.previousTopKeyword}
          </div>
        )}
      </TableCell>
      <TableCell>
        <ContentTypeBadge type={topic.contentType as ContentType} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatTraffic(topic.traffic)}
      </TableCell>
      {/* Position: lower = better ranking */}
      <TableCell className="text-right tabular-nums">
        {topic.position != null ? (
          <span className={`text-xs font-medium ${
            topic.position <= 5 ? "text-green-600" :
            topic.position <= 20 ? "text-yellow-600" : "text-muted-foreground"
          }`}>
            #{topic.position}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="text-xs text-muted-foreground">
          {topic.referringDomains != null ? topic.referringDomains : "—"}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="text-xs text-muted-foreground">
          {topic.numKeywords != null ? topic.numKeywords.toLocaleString() : "—"}
        </span>
      </TableCell>
      {/* Source — hyperlink when sourceUrl is available */}
      <TableCell>
        {topic.sourceUrl ? (
          <a
            href={topic.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
            title={topic.sourceUrl}
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[80px]">{sourceLabel}</span>
          </a>
        ) : (
          <span className="text-xs text-muted-foreground capitalize">{topic.source || "—"}</span>
        )}
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
              className="h-7 px-2 text-xs gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
              onClick={() => onGenerateDraft(topic.id)}
              disabled={isUpdating || isGenerating}
              title="Generate a draft post for this topic now"
            >
              {isGenerating
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Wand2 className="w-3 h-3" />}
              <span className="hidden sm:inline">Draft</span>
            </Button>
          )}
          {topic.status === "skipped" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onRestore(topic.id)}
              disabled={isUpdating}
              title="Restore to pending"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

type SortCol = "traffic" | "position" | "referringDomains" | "numKeywords" | "keyword";

function SortableHead({
  col,
  label,
  sortBy,
  sortDir,
  onSort,
  className = "",
  title,
}: {
  col: SortCol;
  label: string;
  sortBy: SortCol | null;
  sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
  className?: string;
  title?: string;
}) {
  const active = sortBy === col;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className} title={title}>
      <button
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-foreground font-semibold" : "text-muted-foreground"
        } ${className.includes("text-right") ? "ml-auto" : ""}`}
      >
        {label}
        <Icon className={`w-3 h-3 flex-shrink-0 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

function TopicQueueTab() {
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Local optimistic order for drag — only active when showing pending page 0 with no active sort
  const [localOrder, setLocalOrder] = useState<TopicRow[] | null>(null);
  // Selection state for bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Track which topic is currently being generated
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  // Toggle sort: same col flips direction; new col defaults to desc (except keyword → asc)
  function handleSort(col: SortCol) {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir(col === "keyword" ? "asc" : "desc");
    }
    setLocalOrder(null);
    setPage(0);
  }

  function clearSort() {
    setSortBy(null);
    setSortDir("desc");
    setPage(0);
  }

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.blogPipeline.listTopics.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    contentType: typeFilter === "all" ? undefined : typeFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sortBy: sortBy ?? undefined,
    sortDir: sortBy ? sortDir : undefined,
  });

  // Sync local order when server data changes (and no active drag)
  const serverTopics = data?.topics as TopicRow[] | undefined;
  const displayTopics: TopicRow[] = localOrder ?? serverTopics ?? [];

  const updateStatus = trpc.blogPipeline.updateTopicStatus.useMutation({
    onSuccess: () => {
      setLocalOrder(null);
      utils.blogPipeline.listTopics.invalidate();
      utils.blogPipeline.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reorder = trpc.blogPipeline.reorderTopics.useMutation({
    onError: (err) => {
      toast.error(`Reorder failed: ${err.message}`);
      setLocalOrder(null); // revert optimistic
    },
  });

  const deleteTopics = trpc.blogPipeline.deleteTopics.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} topic${data.deleted !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setLocalOrder(null);
      utils.blogPipeline.listTopics.invalidate();
      utils.blogPipeline.stats.invalidate();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const [bulkGenerateProgress, setBulkGenerateProgress] = useState<{ current: number; total: number } | null>(null);

  const bulkGenerate = trpc.blogPipeline.bulkGenerateTopics.useMutation({
    onSuccess: (data) => {
      setBulkGenerateProgress(null);
      setSelectedIds(new Set());
      if (data.succeeded > 0) {
        toast.success(`Generated ${data.succeeded} post${data.succeeded !== 1 ? "s" : ""} successfully${data.failed > 0 ? `, ${data.failed} failed` : ""}`, { duration: 8000 });
      } else {
        toast.error(`All ${data.failed} generation${data.failed !== 1 ? "s" : ""} failed`);
      }
      utils.blogPipeline.listTopics.invalidate();
      utils.blogPipeline.stats.invalidate();
      utils.blogPipeline.listPosts.invalidate();
    },
    onError: (err) => {
      setBulkGenerateProgress(null);
      toast.error(`Bulk generation failed: ${err.message}`);
    },
  });

  function handleBulkGenerate() {
    const ids = Array.from(selectedIds);
    setBulkGenerateProgress({ current: 0, total: ids.length });
    bulkGenerate.mutate({ topicIds: ids });
  }

  const generateForTopic = trpc.blogPipeline.generateForTopic.useMutation({
    onSuccess: (data) => {
      setGeneratingId(null);
      toast.success(`Draft published: "${data.title}"`, { duration: 6000 });
      utils.blogPipeline.listTopics.invalidate();
      utils.blogPipeline.stats.invalidate();
      utils.blogPipeline.listPosts.invalidate();
    },
    onError: (err) => {
      setGeneratingId(null);
      toast.error(`Generation failed: ${err.message}`);
    },
  });

  function handleToggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === displayTopics.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayTopics.map(t => t.id)));
    }
  }

  function handleGenerateDraft(id: number) {
    setGeneratingId(id);
    generateForTopic.mutate({ topicId: id });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Drag is only enabled when filtering pending topics on page 0 with no active column sort
  const dragEnabled = statusFilter === "pending" && page === 0 && sortBy === null;

  const sortableIds = useMemo(
    () => displayTopics.map(t => t.id),
    [displayTopics]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = displayTopics.findIndex(t => t.id === active.id);
    const newIndex = displayTopics.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(displayTopics, oldIndex, newIndex);
    setLocalOrder(reordered);

    // Assign descending priority values so the top item gets the highest number
    const maxPriority = reordered.length;
    const items = reordered.map((t, i) => ({
      id: t.id,
      priority: maxPriority - i,
    }));
    reorder.mutate({ items });
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-4">
      {/* Filters + Bulk Import */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); setLocalOrder(null); }}>
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

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setPage(0); setLocalOrder(null); }}>
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

        {dragEnabled && (
          <span className="text-xs text-muted-foreground self-center flex items-center gap-1">
            <GripVertical className="w-3 h-3" />
            Drag rows to reorder
          </span>
        )}

      </div>

      {/* Bulk action toolbar — shown when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/60 border border-border rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="default"
            className="h-7 gap-1"
            onClick={handleBulkGenerate}
            disabled={bulkGenerate.isPending || generatingId !== null}
          >
            {bulkGenerate.isPending
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Wand2 className="w-3 h-3" />}
            {bulkGenerate.isPending && bulkGenerateProgress
              ? `Generating ${bulkGenerateProgress.current + 1} of ${bulkGenerateProgress.total}...`
              : `Generate ${selectedIds.size > 1 ? `${selectedIds.size} posts` : "post"}`}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 gap-1"
            onClick={() => deleteTopics.mutate({ ids: Array.from(selectedIds) })}
            disabled={deleteTopics.isPending || bulkGenerate.isPending}
          >
            {deleteTopics.isPending
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Trash2 className="w-3 h-3" />}
            Delete
          </Button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Active sort indicator */}
      {sortBy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sorted by <strong className="text-foreground">{sortBy === "referringDomains" ? "Ref. Domains" : sortBy === "numKeywords" ? "# Keywords" : sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}</strong> ({sortDir === "asc" ? "low → high" : "high → low"})</span>
          <button onClick={clearSort} className="underline hover:text-foreground">Clear sort</button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {/* Checkbox select-all */}
              <TableHead className="w-8 px-2">
                <button
                  onClick={handleSelectAll}
                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                  title={selectedIds.size === displayTopics.length && displayTopics.length > 0 ? "Deselect all" : "Select all"}
                >
                  {selectedIds.size > 0 && selectedIds.size === displayTopics.length
                    ? <SquareCheck className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4" />}
                </button>
              </TableHead>
              {/* Drag handle column */}
              <TableHead className="w-8 px-2" />
              <SortableHead col="keyword" label="Keyword" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="" />
              <TableHead className="w-36">Content Type</TableHead>
              <SortableHead col="traffic" label="Traffic" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-20 text-right" />
              <SortableHead col="position" label="Pos." sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-16 text-right" title="SERP position on competitor site" />
              <SortableHead col="referringDomains" label="Ref. D" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-16 text-right" title="Referring domains to source page" />
              <SortableHead col="numKeywords" label="# KWs" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-16 text-right" title="Number of keywords ranking for source page" />
              <TableHead className="w-24">Source</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : displayTopics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  No topics found
                </TableCell>
              </TableRow>
            ) : dragEnabled ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  {displayTopics.map((topic) => (
                    <SortableTopicRow
                      key={topic.id}
                      topic={topic}
                      onRestore={(id) => updateStatus.mutate({ id, status: "pending" })}
                      onGenerateDraft={handleGenerateDraft}
                      isUpdating={updateStatus.isPending}
                      isGenerating={generatingId === topic.id}
                      isDragDisabled={false}
                      isSelected={selectedIds.has(topic.id)}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              displayTopics.map((topic) => (
                <SortableTopicRow
                  key={topic.id}
                  topic={topic}
                  onRestore={(id) => updateStatus.mutate({ id, status: "pending" })}
                  onGenerateDraft={handleGenerateDraft}
                  isUpdating={updateStatus.isPending}
                  isGenerating={generatingId === topic.id}
                  isDragDisabled={true}
                  isSelected={selectedIds.has(topic.id)}
                  onToggleSelect={handleToggleSelect}
                />
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
              onClick={() => { setPage(p => Math.max(0, p - 1)); setLocalOrder(null); }}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); setLocalOrder(null); }}
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
  const utils = trpc.useUtils();

  return (
    <div className="p-6 space-y-6">
      {/* Page header with prominent Upload CTA */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Content Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Automated daily blog post generation from competitor keyword data
          </p>
        </div>
        <BulkImportDialog
          onImported={() => {
            utils.blogPipeline.listTopics.invalidate();
            utils.blogPipeline.stats.invalidate();
          }}
          prominent
        />
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
  );
}
