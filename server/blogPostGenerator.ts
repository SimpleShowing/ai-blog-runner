/**
 * Automated daily blog post generator.
 * Called by Manus Heartbeat cron at 8:00 AM UTC every day.
 *
 * Workflow:
 * 1. Authenticate the cron request
 * 2. Pick the highest-traffic pending topic from blog_topics
 * 3. Generate a full ~1,500-2,000 word post via LLM
 * 4. Publish to WordPress (live status)
 * 5. Mark topic as used, save generated_posts record
 * 6. Notify owner
 */
import { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { generateImage } from "./_core/imageGeneration";
import { storageGetSignedUrl } from "./storage";
import {
  getNextPendingBlogTopic,
  updateBlogTopicStatus,
  createGeneratedPost,
  updateGeneratedPost,
  getSetting,
  getDb,
  createDraft,
} from "./db";
import { blogTopics } from "../drizzle/schema";
import type { BlogTopic } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── CTA strategy by content type ────────────────────────────────────────────

function getCtaStrategy(contentType: BlogTopic["contentType"]): string {
  switch (contentType) {
    case "lead_gen":
      return `Include 1-2 natural CTAs pointing to SimpleShowing's home valuation tool (https://www.simpleshowing.com/home-valuation) or seller listing page (https://www.simpleshowing.com/sell). Frame them as helpful next steps, not hard sells. Example: "If you're thinking about selling, get a free instant home valuation at SimpleShowing."`;
    case "affiliate":
      return `Include 1 soft internal link to a relevant SimpleShowing page (e.g. https://www.simpleshowing.com/blog or https://www.simpleshowing.com/home-valuation). Do NOT include any affiliate product links — those will be inserted manually after publication. Add a note at the end of the post: [AFFILIATE LINKS NEEDED — insert relevant Amazon/CJ product links here].`;
    case "comparison":
      return `Include 1-2 mentions of SimpleShowing as a transparent, low-commission alternative. Link to https://www.simpleshowing.com/sell or https://www.simpleshowing.com/home-valuation where natural. Keep the comparison fair and factual.`;
    case "informational":
    default:
      return `Include exactly 1 internal link to a relevant SimpleShowing page (https://www.simpleshowing.com/blog, https://www.simpleshowing.com/home-valuation, or https://www.simpleshowing.com/sell) where it fits naturally. Do not force a CTA — let the content speak for itself.`;
  }
}

// ─── Build the LLM system prompt ─────────────────────────────────────────────

function buildSystemPrompt(topic: BlogTopic): string {
  const ctaStrategy = getCtaStrategy(topic.contentType);

  return `You are a professional real estate content writer for SimpleShowing, a tech-enabled real estate brokerage that helps buyers and sellers save money on commissions.

BRAND VOICE:
- Friendly, expert, and transparent
- Second-person (you/your) throughout
- Avoid jargon; explain terms when used
- Use real numbers, statistics, and examples where possible
- No hype or exaggerated claims (e.g., never say "guaranteed" or "lowest price guaranteed")

CONTENT RULES:
- Write NATIONAL content only — no state-specific, city-specific, or regional focus
- Target length: 1,500–2,000 words
- NO author byline
- NO H1 heading in the body (the post title is the H1 in WordPress)
- Use H2 and H3 headings to structure the article
- Include a brief intro paragraph, 4-6 main sections, and a conclusion
- Write in HTML format suitable for WordPress (use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <a> tags)
- Include a meta description (150-160 characters) at the very end, formatted as: META_DESCRIPTION: [your meta description here]

CTA / INTERNAL LINK STRATEGY:
${ctaStrategy}

CONTENT TYPE: ${topic.contentType}
${topic.contentType === "affiliate" ? "⚠️ AFFILIATE FLAG: This post will need affiliate links inserted manually after publication. Add the placeholder comment [AFFILIATE LINKS NEEDED] at the appropriate location." : ""}

SEO:
- Naturally include the target keyword in the first paragraph and at least 2-3 headings
- Use semantic variations of the keyword throughout
- Write for humans first, search engines second`;
}

// ─── Upload featured image to WP ─────────────────────────────────────────────

async function uploadFeaturedImageToWp(
  title: string,
  apiBase: string,
  credentials: string,
): Promise<number | undefined> {
  try {
    const imagePrompt = `Professional real estate blog featured image for an article titled "${title}". Clean, modern, photorealistic. No text overlays.`;
    const { url: storageRelUrl } = await generateImage({ prompt: imagePrompt });
    if (!storageRelUrl) return undefined;

    const key = storageRelUrl.replace(/^\/manus-storage\//, "");
    const s3Url = await storageGetSignedUrl(key);
    const imgResp = await fetch(s3Url);
    if (!imgResp.ok) return undefined;
    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const mediaResp = await fetch(`${apiBase}/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${slug}.png"`,
      },
      body: new Uint8Array(imgBuffer),
    });
    if (!mediaResp.ok) return undefined;
    const mediaData = (await mediaResp.json()) as { id: number };
    return mediaData.id || undefined;
  } catch {
    console.warn("[BlogGen] Featured image upload failed (non-fatal)");
    return undefined;
  }
}

// ─── Resolve WP category IDs ─────────────────────────────────────────────────

async function resolveWpCategoryIds(
  categoryNames: string[],
  apiBase: string,
  credentials: string,
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of categoryNames) {
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const searchResp = await fetch(`${apiBase}/categories?search=${encodeURIComponent(name)}&per_page=5`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (searchResp.ok) {
        const cats = (await searchResp.json()) as Array<{ id: number; slug: string; name: string }>;
        const match = cats.find(c => c.slug === slug || c.name.toLowerCase() === name.toLowerCase());
        if (match) { ids.push(match.id); continue; }
      }
      const createResp = await fetch(`${apiBase}/categories`, {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (createResp.ok) {
        const created = (await createResp.json()) as { id: number };
        ids.push(created.id);
      }
    } catch { /* skip */ }
  }
  return ids;
}

// ─── Suggest WP categories via LLM ───────────────────────────────────────────

async function suggestWpCategories(title: string, contentType: string): Promise<string[]> {
  try {
    const baseCategories: Record<string, string[]> = {
      lead_gen: ["Real Estate Tips", "Home Selling"],
      affiliate: ["Home Improvement", "Real Estate Tools"],
      comparison: ["Real Estate Reviews", "Real Estate Tips"],
      informational: ["Real Estate Tips", "Home Buying"],
    };
    return baseCategories[contentType] ?? ["Real Estate Tips"];
  } catch {
    return ["Real Estate Tips"];
  }
}

// ─── Core generation logic (shared by cron and manual trigger) ───────────────

export type GenerateResult =
  | { ok: true; postId: number; wpPostId: number; wpPostUrl: string; title: string }
  | { ok: false; skipped: string; reason?: string }
  | { ok: false; error: string; message: string };

export async function runBlogPostGeneration(specificTopicId?: number): Promise<GenerateResult> {
  try {
    // 1. Get WP credentials
    const [wpUrl, wpUsername, wpAppPassword] = await Promise.all([
      getSetting("wp_url"),
      getSetting("wp_username"),
      getSetting("wp_app_password"),
    ]);

    if (!wpUrl || !wpUsername || !wpAppPassword) {
      console.warn("[BlogGen] WordPress credentials not configured — skipping");
      return { ok: false, skipped: "wp-credentials-missing" };
    }

    const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
    const apiBase = wpUrl.replace(/\/$/, "") + "/wp-json/wp/v2";

    // 2. Pick the topic — either a specific one or the next highest-priority pending topic
    let topic: Awaited<ReturnType<typeof getNextPendingBlogTopic>>;
    if (specificTopicId !== undefined) {
      const db = await getDb();
      if (!db) return { ok: false, skipped: "no-pending-topics", reason: "DB unavailable" };
      const rows = await db.select().from(blogTopics).where(eq(blogTopics.id, specificTopicId)).limit(1);
      topic = rows[0] ?? null;
      if (!topic) return { ok: false, skipped: "no-pending-topics", reason: `Topic #${specificTopicId} not found` };
    } else {
      topic = await getNextPendingBlogTopic();
    }
    if (!topic) {
      console.log("[BlogGen] No pending topics — nothing to generate");
      await notifyOwner({
        title: "Blog Pipeline: Topic Queue Empty",
        content: "The automated blog post generator ran but found no pending topics. Please add more topics to the queue.",
      });
      return { ok: false, skipped: "no-pending-topics" };
    }

    console.log(`[BlogGen] Generating post for topic #${topic.id}: "${topic.keyword}"`);

    // 4. Create a placeholder generated_posts record
    const postId = await createGeneratedPost({
      topicId: topic.id,
      contentType: topic.contentType,
      affiliateFlag: topic.contentType === "affiliate",
      status: "generating",
    });

    // 5. Generate the post via LLM
    let generatedContent: string;
    let postTitle: string;
    let metaDescription: string = "";

    try {
      const systemPrompt = buildSystemPrompt(topic);
      const userPrompt = `Write a comprehensive blog post targeting the keyword: "${topic.keyword}"

Requirements:
- Target keyword: ${topic.keyword}
- Content type: ${topic.contentType}
- Word count: 1,500–2,000 words
- Format: HTML for WordPress
- Include META_DESCRIPTION at the very end

Write the full post now:`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      generatedContent = (response.choices?.[0]?.message?.content as string) ?? "";
      if (!generatedContent) throw new Error("LLM returned empty content");

      // Extract meta description if present
      const metaMatch = generatedContent.match(/META_DESCRIPTION:\s*(.+?)(?:\n|$)/i);
      if (metaMatch) {
        metaDescription = metaMatch[1].trim();
        generatedContent = generatedContent.replace(/META_DESCRIPTION:\s*.+?(?:\n|$)/i, "").trim();
      }

      // Extract title from first H2 or use keyword as fallback
      const h2Match = generatedContent.match(/<h2[^>]*>([^<]+)<\/h2>/i);
      postTitle = h2Match
        ? `${topic.keyword.charAt(0).toUpperCase() + topic.keyword.slice(1)}: A Complete Guide`
        : `${topic.keyword.charAt(0).toUpperCase() + topic.keyword.slice(1)}: Everything You Need to Know`;

      // Build a proper title from keyword
      postTitle = topic.keyword
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      // Make title more blog-like based on content type
      if (topic.contentType === "informational") {
        postTitle = `${postTitle}: A Complete Guide`;
      } else if (topic.contentType === "lead_gen") {
        postTitle = `${postTitle}: What You Need to Know`;
      } else if (topic.contentType === "comparison") {
        postTitle = `${postTitle}: An Honest Review`;
      }
      // affiliate keeps the keyword as-is (e.g. "Best Home Inspection Companies")

    } catch (err: any) {
      console.error("[BlogGen] LLM generation failed:", err.message);
      await updateGeneratedPost(postId, {
        status: "failed",
        errorMessage: err.message,
      });
      await updateBlogTopicStatus(topic.id, "skipped");
      return { ok: false, error: "llm-failed", message: err.message };
    }

    // 6. Publish to WordPress
    let wpPostId: number | undefined;
    let wpPostUrl: string | undefined;

    try {
      // Suggest categories
      const categoryNames = await suggestWpCategories(postTitle, topic.contentType);
      const categoryIds = await resolveWpCategoryIds(categoryNames, apiBase, credentials);

      // Generate and upload featured image (non-fatal)
      const featuredMediaId = await uploadFeaturedImageToWp(postTitle, apiBase, credentials);

      // Build tags from keyword
      const tags = topic.keyword.split(" ").filter(w => w.length > 3);

      const postPayload: Record<string, unknown> = {
        title: postTitle,
        content: generatedContent,
        excerpt: metaDescription || `Learn everything about ${topic.keyword} in this comprehensive guide.`,
        status: "publish",
        meta: {
          rank_math_focus_keyword: topic.keyword,
          rank_math_description: metaDescription || "",
        },
      };
      if (categoryIds.length > 0) postPayload.categories = categoryIds;
      if (featuredMediaId) postPayload.featured_media = featuredMediaId;

      const response = await fetch(`${apiBase}/posts`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postPayload),
      });

      const data = await response.json() as any;

      if (response.ok && data.id) {
        wpPostId = data.id;
        wpPostUrl = data.link;
      } else {
        throw new Error(data.message || `WordPress API returned ${response.status}`);
      }
    } catch (err: any) {
      console.error("[BlogGen] WordPress publish failed:", err.message);
      await updateGeneratedPost(postId, {
        title: postTitle,
        content: generatedContent,
        status: "failed",
        errorMessage: err.message,
      });
      await updateBlogTopicStatus(topic.id, "skipped");
      return { ok: false, error: "wp-publish-failed", message: err.message };
    }

    // 7. Mark topic as used, update generated post record, mirror to drafts table
    await Promise.all([
      updateBlogTopicStatus(topic.id, "used"),
      updateGeneratedPost(postId, {
        title: postTitle,
        content: generatedContent,
        wpPostId,
        wpPostUrl,
        status: "published",
        publishedAt: new Date(),
      }),
      // Mirror to drafts table so the post appears in Drafts & Review
      createDraft({
        topicId: 0, // pipeline posts don't have a topics table entry; use 0 as sentinel
        title: postTitle,
        content: generatedContent,
        seoTitle: postTitle,
        metaDescription: metaDescription || "",
        focusKeyword: topic.keyword,
        wpPostId: wpPostId ?? undefined,
        wpPostUrl: wpPostUrl ?? undefined,
        status: "published",
        generatedBy: "pipeline",
      }),
    ]);

    // 8. Notify owner
    const affiliateNote = topic.contentType === "affiliate"
      ? "\n⚠️ AFFILIATE POST — remember to insert affiliate links manually."
      : "";

    await notifyOwner({
      title: "New Blog Post Published",
      content: `"${postTitle}" has been automatically generated and published to WordPress.\n\nKeyword: ${topic.keyword}\nContent Type: ${topic.contentType}\nWP Post ID: ${wpPostId}\nView post: ${wpPostUrl}${affiliateNote}`,
    });

    console.log(`[BlogGen] Successfully published "${postTitle}" (WP #${wpPostId})`);
    return { ok: true, postId, wpPostId: wpPostId!, wpPostUrl: wpPostUrl!, title: postTitle };

  } catch (err: any) {
    console.error("[BlogGen] Unexpected error:", err);
    return { ok: false, error: err.message, message: err.stack ?? "" };
  }
}

// ─── Express handler for the scheduled cron endpoint ─────────────────────────────────

export async function blogPostGeneratorHandler(req: Request, res: Response) {
  try {
    // Authenticate: only cron callers are allowed
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
    const result = await runBlogPostGeneration();
    if (!result.ok && "skipped" in result) {
      return res.json({ ok: true, skipped: result.skipped });
    }
    if (!result.ok) {
      return res.status(500).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    console.error("[BlogGen] Unexpected handler error:", err);
    return res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
}
