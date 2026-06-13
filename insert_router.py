#!/usr/bin/env python3
import sys

ROUTER_CODE = '''
// ─── Post Refresh Router ─────────────────────────────────────────────────────

import { postRefreshLog } from "../drizzle/schema";

const KEYWORD_MAP: Record<string, string[]> = {
  "72sold-reviews": ["72sold reviews", "72sold complaints", "72sold vs traditional agent", "is 72sold legit", "72sold fees"],
  "houzeo-review": ["houzeo reviews", "houzeo fees", "houzeo vs simpleshowing", "flat fee mls georgia", "houzeo complaints"],
  "opendoor-vs-zillow": ["opendoor vs zillow offers", "opendoor fees", "zillow offers alternative", "ibuyer comparison", "sell home fast atlanta"],
  "a-comprehensive-guide-to-fridge-dimensions-in-inches": ["fridge dimensions", "refrigerator dimensions inches", "standard fridge size", "how tall is a refrigerator"],
  "room-soundproofing": ["how to soundproof a room", "room soundproofing", "soundproof walls cheap", "soundproofing materials"],
  "is-midtown-atlanta-safe": ["is midtown atlanta safe", "midtown atlanta crime rate", "safest neighborhoods atlanta", "living in midtown atlanta"],
  "achieving-perfect-orange-peel-texture": ["orange peel wall texture", "how to orange peel texture", "orange peel texture spray", "wall texture techniques"],
  "wealthiest-counties-in-florida": ["wealthiest counties florida", "richest counties in florida", "best counties to live in florida"],
};

const NOINDEX_SLUGS = new Set([
  "does-roundup-go-bad-or-expire-solved",
  "sae-30-vs-5w-30-which-to-use-in-your-lawn-mower",
  "does-black-wire-go-to-gold-or-silver",
  "black-wire-to-gold-screw",
  "when-to-use-17-17-17-fertilizer-how-to-use-triple-17",
  "transfer-money-from-venmo-to-cash-app",
  "does-grass-seed-expire-or-go-bad-plus-3-simple-steps-to-check",
]);

function triagePost(slug: string, position: number, traffic: number): "refresh" | "noindex" | "keep" | "redirect" {
  if (NOINDEX_SLUGS.has(slug)) return "noindex";
  if (position >= 1 && position <= 10 && traffic > 50) return "keep";
  if (position >= 11 && position <= 50) return "refresh";
  if (position > 50 && traffic < 10) return "noindex";
  return "refresh";
}

async function rewriteWithClaude(title: string, content: string, slug: string, targetKeywords: string[], anthropicKey: string): Promise<string> {
  const prompt = `You are an expert real estate content writer for SimpleShowing.com, a discount real estate brokerage operating in Georgia, Florida, and Texas that offers a 1% listing fee and buyer rebates up to $15,000.

Rewrite the following blog post to:
1. Target these keywords naturally (no stuffing): ${targetKeywords.join(", ")}
2. Add 2-3 authoritative external links to reputable sources (NAR data, government housing stats, consumer finance sites)
3. Add 1-2 internal links to simpleshowing.com pages where relevant (use: https://www.simpleshowing.com/sell or https://www.simpleshowing.com/home-valuation)
4. Update any outdated statistics or references to reflect 2025/2026 data
5. Improve the intro to hook readers in the first 2 sentences with the primary keyword
6. Add a clear CTA at the end pointing to SimpleShowing services
7. Keep the same general structure but make it more comprehensive and authoritative
8. Target length: 1,200-1,800 words
9. Format: HTML for WordPress (h2, h3, p, ul, li, strong, a tags). NO h1 tags.

BRAND VOICE: Friendly, expert, transparent. Second-person (you/your). Real numbers. No hype.

Current post title: ${title}

Current content:
${content.slice(0, 8000)}

Return ONLY the rewritten HTML. No markdown, no preamble.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`Anthropic API failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as any;
  return data.content[0].text as string;
}

const postRefreshRouter = router({
  listPosts: adminProcedure
    .input(z.object({ page: z.number().default(1), perPage: z.number().default(30) }))
    .query(async () => {
      const wpUrl = await getSetting("wp_url");
      const wpUsername = await getSetting("wp_username");
      const wpAppPassword = await getSetting("wp_app_password");
      if (!wpUrl || !wpUsername || !wpAppPassword) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WordPress credentials not configured in Settings" });
      const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
      const apiBase = wpUrl.replace(/\\/$/, "") + "/wp-json/wp/v2";
      const response = await fetch(`${apiBase}/posts?per_page=100&status=publish&_fields=id,slug,title,link,date_modified`, { headers: { Authorization: `Basic ${credentials}` } });
      if (!response.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `WP API error: ${response.status}` });
      const posts = await response.json() as Array<{ id: number; slug: string; title: { rendered: string }; link: string; date_modified: string }>;
      const db = await getDb();
      const refreshed = db ? await db.select({ wpPostId: postRefreshLog.wpPostId, action: postRefreshLog.action, processedAt: postRefreshLog.processedAt }).from(postRefreshLog) : [];
      const refreshedMap = new Map(refreshed.map(r => [r.wpPostId, r]));
      return posts.map(p => {
        const decision = triagePost(p.slug, 99, 0);
        const existing = refreshedMap.get(p.id);
        return { id: p.id, slug: p.slug, title: p.title.rendered, link: p.link, dateModified: p.date_modified, decision, hasKeywordMap: !!KEYWORD_MAP[p.slug], isNoindexSlug: NOINDEX_SLUGS.has(p.slug), alreadyProcessed: !!existing, lastAction: existing?.action ?? null, lastProcessedAt: existing?.processedAt ?? null };
      });
    }),

  refreshPost: adminProcedure
    .input(z.object({ wpPostId: z.number(), slug: z.string(), title: z.string(), ahrefsPosition: z.number().optional(), ahrefsTraffic: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [wpUrl, wpUsername, wpAppPassword] = await Promise.all([getSetting("wp_url"), getSetting("wp_username"), getSetting("wp_app_password")]);
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!wpUrl || !wpUsername || !wpAppPassword) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WordPress credentials not configured" });
      if (!anthropicKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ANTHROPIC_API_KEY not set in environment" });
      const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
      const apiBase = wpUrl.replace(/\\/$/, "") + "/wp-json/wp/v2";
      const postResp = await fetch(`${apiBase}/posts/${input.wpPostId}?_fields=id,slug,title,content`, { headers: { Authorization: `Basic ${credentials}` } });
      if (!postResp.ok) throw new TRPCError({ code: "NOT_FOUND", message: `WP post ${input.wpPostId} not found` });
      const post = await postResp.json() as any;
      const originalContent = post.content?.rendered ?? "";
      const targetKeywords = KEYWORD_MAP[input.slug] ?? ["real estate", "home buying", "simpleshowing"];
      const db = await getDb();
      let logId: number | undefined;
      if (db) {
        const [inserted] = await db.insert(postRefreshLog).values({ wpPostId: input.wpPostId, wpPostUrl: `${wpUrl}/blog/${input.slug}`, title: input.title, slug: input.slug, action: "refresh", decision: "refresh", targetKeywords: JSON.stringify(targetKeywords), originalContent, ahrefsPosition: input.ahrefsPosition, ahrefsTraffic: input.ahrefsTraffic, status: "processing", processedBy: ctx.user.id }).returning({ id: postRefreshLog.id });
        logId = inserted?.id;
      }
      let newContent: string;
      try {
        newContent = await rewriteWithClaude(input.title, originalContent, input.slug, targetKeywords, anthropicKey);
      } catch (err: any) {
        if (db && logId) await db.update(postRefreshLog).set({ status: "failed", errorMessage: err.message }).where(eq(postRefreshLog.id, logId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Claude rewrite failed: ${err.message}` });
      }
      const updateResp = await fetch(`${apiBase}/posts/${input.wpPostId}`, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }, body: JSON.stringify({ content: newContent, status: "publish", meta: { rank_math_focus_keyword: targetKeywords[0] } }) });
      if (!updateResp.ok) {
        const errText = await updateResp.text();
        if (db && logId) await db.update(postRefreshLog).set({ status: "failed", errorMessage: errText }).where(eq(postRefreshLog.id, logId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `WP update failed: ${errText}` });
      }
      if (db && logId) await db.update(postRefreshLog).set({ newContent, status: "done", processedAt: new Date() }).where(eq(postRefreshLog.id, logId));
      return { ok: true, wpPostId: input.wpPostId, slug: input.slug, targetKeywords, preview: newContent.slice(0, 400) + "..." };
    }),

  noindexPost: adminProcedure
    .input(z.object({ wpPostId: z.number(), slug: z.string(), title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [wpUrl, wpUsername, wpAppPassword] = await Promise.all([getSetting("wp_url"), getSetting("wp_username"), getSetting("wp_app_password")]);
      if (!wpUrl || !wpUsername || !wpAppPassword) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WordPress credentials not configured" });
      const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
      const updateResp = await fetch(`${wpUrl.replace(/\\/$/, "")}/wp-json/wp/v2/posts/${input.wpPostId}`, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "draft" }) });
      if (!updateResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `WP update failed: ${updateResp.status}` });
      const db = await getDb();
      if (db) await db.insert(postRefreshLog).values({ wpPostId: input.wpPostId, title: input.title, slug: input.slug, action: "noindex", decision: "noindex", status: "done", processedBy: ctx.user.id, processedAt: new Date() });
      return { ok: true, wpPostId: input.wpPostId };
    }),

  getHistory: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(postRefreshLog).orderBy(postRefreshLog.createdAt);
    }),
});

'''

MARKER = '// ─── App Router ──────────────────────────────────────────────────────'
APPROUTER_LINE = '  blogPipeline: blogPipelineRouter,'
NEW_APPROUTER_LINE = '  blogPipeline: blogPipelineRouter,\n  postRefresh: postRefreshRouter,'

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

if 'postRefreshRouter' in content:
    print("postRefreshRouter already exists in file — skipping insertion")
    sys.exit(0)

# Insert router code before the App Router marker
content = content.replace(MARKER, ROUTER_CODE + '\n' + MARKER)

# Add postRefresh to appRouter
content = content.replace(APPROUTER_LINE, NEW_APPROUTER_LINE)

with open(filepath, 'w') as f:
    f.write(content)

print("Done! postRefreshRouter inserted successfully.")
