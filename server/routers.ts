import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  getTopics, getTopicById, createTopic, updateTopic, deleteTopic,
  getBriefByTopicId, getBriefById, createBrief, updateBrief,
  getDraftsByTopicId, getDraftById, getAllDrafts, createDraft, updateDraft,
  getLatestQaForDraft, createQaResult,
  getCommentsByDraftId, createComment, resolveComment,
  getWpLogsForDraft, createWpLog, getAllWpLogs,
  getSetting, getAllSettings, setSetting, setSettings,
  getInvitedEditors, inviteEditor, removeEditor,
  getAllUsers,
  createPartnerSubmission, getPartnerSubmissions, getPartnerSubmissionById, updatePartnerSubmission,
  getPublishedSubmissionsWithPayment, getUnpaidSubmissions,
  getBlogTopics, countBlogTopics, getNextPendingBlogTopic, updateBlogTopicStatus, bulkInsertBlogTopics, bulkDeleteBlogTopics,
  getGeneratedPosts, countGeneratedPosts,
} from "./db";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { blogTopics } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateImage } from "./_core/imageGeneration";
import { storageGetSignedUrl } from "./storage";
import {
  sendPartnerSubmissionReceived,
  sendPartnerApproved,
  sendPartnerRejected,
  sendPartnerPublished,
  sendEditorInvite,
} from "./email";
import { createPartnerPaymentLink, getPriceForSubmission } from "./stripe";
import { schedulePaymentReminders } from "./scheduleReminders";

// ─── Admin guard ──────────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  return next({ ctx });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getBrandContext() {
  const s = await getAllSettings();
  return {
    brandVoice: s["brand_voice"] || "Friendly, expert, transparent. SimpleShowing helps buyers and sellers save money on real estate commissions.",
    approvedCTAs: s["approved_ctas"] || "Get a free home valuation, See how much you can save, Book a free consultation",
    targetMarkets: s["target_markets"] || "Atlanta GA, Tampa FL, Orlando FL, Dallas TX, Denver CO",
    forbiddenClaims: s["forbidden_claims"] || "Guaranteed sale, Lowest price guaranteed",
    styleGuide: s["style_guide"] || "Use second-person (you/your). Avoid jargon. Include real numbers and examples. Always link to relevant SimpleShowing pages.",
  };
}

// ─── WP Push Helpers ─────────────────────────────────────────────────────────

/** Remove a leading H1 heading from content so the WP post title doesn't appear twice. */
function stripLeadingH1(content: string): string {
  // Strip HTML <h1>...</h1> at start (case-insensitive, dotAll via [\s\S])
  let c = content.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, "");
  // Strip Markdown # heading at start (single # only, not ## or ###)
  c = c.replace(/^\s*#(?!#)[^\n]*\n?/, "");
  return c.trim();
}

/**
 * Ask the LLM to suggest 1-3 WordPress category names for the article.
 * Returns an array of lowercase category name strings.
 */
async function suggestWpCategories(title: string, excerpt: string): Promise<string[]> {
  try {
    const resp = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a WordPress content categorisation assistant. Given a blog post title and excerpt, return a JSON array of 1 to 3 short, specific category names that best describe the topic. Use title-case. Return ONLY the JSON array, no explanation.",
        },
        {
          role: "user",
          content: `Title: ${title}\nExcerpt: ${excerpt || ""}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "categories",
          strict: true,
          schema: {
            type: "object",
            properties: {
              categories: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["categories"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = resp.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return [];
    const parsed = JSON.parse(raw) as { categories: string[] };
    return (parsed.categories || []).slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * For each category name, find its WP ID (by slug search) or create it.
 * Returns an array of WP category IDs.
 */
async function resolveWpCategoryIds(
  categoryNames: string[],
  apiBase: string,
  credentials: string,
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of categoryNames) {
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      // Search for existing category
      const searchResp = await fetch(`${apiBase}/categories?search=${encodeURIComponent(name)}&per_page=5`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (searchResp.ok) {
        const cats = (await searchResp.json()) as Array<{ id: number; slug: string; name: string }>;
        const match = cats.find(c => c.slug === slug || c.name.toLowerCase() === name.toLowerCase());
        if (match) {
          ids.push(match.id);
          continue;
        }
      }
      // Create new category
      const createResp = await fetch(`${apiBase}/categories`, {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (createResp.ok) {
        const created = (await createResp.json()) as { id: number };
        ids.push(created.id);
      }
    } catch {
      // Skip category on error
    }
  }
  return ids;
}

/**
 * Generate a featured image and upload it to the WP media library.
 * Returns the WP media attachment ID, or undefined on failure.
 */
async function uploadFeaturedImageToWp(
  title: string,
  apiBase: string,
  credentials: string,
): Promise<number | undefined> {
  try {
    const imagePrompt = `Professional real estate blog featured image for an article titled "${title}". Clean, modern, photorealistic. No text overlays.`;
    const { url: storageRelUrl } = await generateImage({ prompt: imagePrompt });
    if (!storageRelUrl) return undefined;

    // storageRelUrl is /manus-storage/<key> — get a signed S3 URL to fetch the bytes
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
    console.warn("[WP Push] Featured image generation/upload failed (non-fatal)");
    return undefined;
  }
}

// ─── Topics Router ────────────────────────────────────────────────────────────

const topicsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) => getTopics(input?.status)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const topic = await getTopicById(input.id);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND" });
      return topic;
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(3),
      contentPillar: z.enum(["buyer_guides","seller_guides","commission_savings","market_reports","comparison_pages","local_seo","how_to","other"]).default("other"),
      targetMarket: z.string().optional(),
      conversionGoal: z.enum(["home_valuation","commission_savings","buyer_rebate","book_consultation","general_awareness"]).default("general_awareness"),
      priority: z.enum(["high","medium","low"]).default("medium"),
      targetKeyword: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createTopic({
        ...input,
        status: "idea",
        createdBy: ctx.user.id,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      contentPillar: z.enum(["buyer_guides","seller_guides","commission_savings","market_reports","comparison_pages","local_seo","how_to","other"]).optional(),
      targetMarket: z.string().optional(),
      conversionGoal: z.enum(["home_valuation","commission_savings","buyer_rebate","book_consultation","general_awareness"]).optional(),
      priority: z.enum(["high","medium","low"]).optional(),
      status: z.enum(["idea","approved","brief_pending","brief_ready","draft_pending","draft_ready","in_review","approved_for_publish","rejected","published","paused"]).optional(),
      assignedTo: z.number().nullable().optional(),
      targetKeyword: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateTopic(id, data);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteTopic(input.id);
      return { success: true };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await updateTopic(input.id, { status: "approved" });
      return { success: true };
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await updateTopic(input.id, { status: "paused" });
      return { success: true };
    }),
});

// ─── Briefs Router ────────────────────────────────────────────────────────────

const briefsRouter = router({
  getByTopic: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .query(async ({ input }) => (await getBriefByTopicId(input.topicId)) ?? null),

  generate: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .mutation(async ({ input }) => {
      const topic = await getTopicById(input.topicId);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });

      const brand = await getBrandContext();

      // Create a placeholder brief record
      const briefId = await createBrief({
        topicId: input.topicId,
        status: "generating",
      });

      await updateTopic(input.topicId, { status: "brief_pending" });

      // Generate brief via LLM
      const systemPrompt = `You are an expert SEO content strategist for SimpleShowing.com, a real estate platform that helps buyers and sellers save on commissions.

Brand context:
- Voice: ${brand.brandVoice}
- Approved CTAs: ${brand.approvedCTAs}
- Target markets: ${brand.targetMarkets}
- Forbidden claims: ${brand.forbiddenClaims}
- Style guide: ${brand.styleGuide}

Generate a comprehensive SEO content brief. Return valid JSON only.`;

      const userPrompt = `Create a detailed content brief for this topic:
Title: "${topic.title}"
Target keyword: "${topic.targetKeyword || topic.title}"
Content pillar: ${topic.contentPillar}
Target market: ${topic.targetMarket || "national"}
Conversion goal: ${topic.conversionGoal}

Return JSON with these exact keys:
{
  "serpNotes": "Analysis of what currently ranks for this keyword and what angles to take",
  "outline": "Full H2/H3 outline with section descriptions",
  "internalLinks": "List of SimpleShowing pages to link to with anchor text suggestions",
  "faqs": "5-8 FAQ questions and brief answers",
  "citations": "Types of sources to cite (NAR data, local MLS, etc.)",
  "ctaStrategy": "Where and how to place CTAs throughout the article",
  "differentiationAngle": "How SimpleShowing's angle differs from competitors"
}`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "content_brief",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  serpNotes: { type: "string" },
                  outline: { type: "string" },
                  internalLinks: { type: "string" },
                  faqs: { type: "string" },
                  citations: { type: "string" },
                  ctaStrategy: { type: "string" },
                  differentiationAngle: { type: "string" },
                },
                required: ["serpNotes","outline","internalLinks","faqs","citations","ctaStrategy","differentiationAngle"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;

        await updateBrief(briefId, {
          ...parsed,
          status: "ready",
        });
        await updateTopic(input.topicId, { status: "brief_ready" });
      } catch (err) {
        await updateBrief(briefId, { status: "archived" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Brief generation failed" });
      }

      return { briefId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      serpNotes: z.string().optional(),
      outline: z.string().optional(),
      internalLinks: z.string().optional(),
      faqs: z.string().optional(),
      citations: z.string().optional(),
      ctaStrategy: z.string().optional(),
      differentiationAngle: z.string().optional(),
      editedContent: z.string().optional(),
      status: z.enum(["generating","ready","approved","archived"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateBrief(id, data);
      return { success: true };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number(), topicId: z.number() }))
    .mutation(async ({ input }) => {
      await updateBrief(input.id, { status: "approved" });
      await updateTopic(input.topicId, { status: "draft_pending" });
      return { success: true };
    }),
});

// ─── Drafts Router ────────────────────────────────────────────────────────────

const draftsRouter = router({
  list: protectedProcedure.query(() => getAllDrafts()),

  getByTopic: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .query(({ input }) => getDraftsByTopicId(input.topicId)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const draft = await getDraftById(input.id);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      return draft;
    }),

  generate: protectedProcedure
    .input(z.object({ topicId: z.number(), briefId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const topic = await getTopicById(input.topicId);
      const brief = await getBriefById(input.briefId);
      if (!topic || !brief) throw new TRPCError({ code: "NOT_FOUND" });

      const brand = await getBrandContext();

      const draftId = await createDraft({
        topicId: input.topicId,
        briefId: input.briefId,
        status: "generating",
      });

      await updateTopic(input.topicId, { status: "draft_pending" });

      const systemPrompt = `You are an expert SEO content writer for SimpleShowing.com.

Brand voice: ${brand.brandVoice}
Approved CTAs: ${brand.approvedCTAs}
Target markets: ${brand.targetMarkets}
Forbidden claims: ${brand.forbiddenClaims}
Style guide: ${brand.styleGuide}

Write complete, publish-ready WordPress blog posts. Return valid JSON only.`;

      const userPrompt = `Write a full blog post draft based on this brief:

TOPIC: ${topic.title}
TARGET KEYWORD: ${topic.targetKeyword || topic.title}
CONTENT PILLAR: ${topic.contentPillar}
TARGET MARKET: ${topic.targetMarket || "national"}
CONVERSION GOAL: ${topic.conversionGoal}

BRIEF:
SERP Notes: ${brief.serpNotes || ""}
Outline: ${brief.outline || ""}
Internal Links: ${brief.internalLinks || ""}
FAQs: ${brief.faqs || ""}
Citations: ${brief.citations || ""}
CTA Strategy: ${brief.ctaStrategy || ""}
Differentiation: ${brief.differentiationAngle || ""}

Return JSON with these exact keys:
{
  "title": "SEO-optimized post title",
  "content": "Full HTML blog post content with proper H2/H3 headings, tables, examples, internal links, and CTAs. At least 1500 words.",
  "excerpt": "2-3 sentence excerpt for WordPress",
  "seoTitle": "SEO title (under 60 chars)",
  "metaDescription": "Meta description (under 155 chars)",
  "focusKeyword": "Primary focus keyword",
  "canonicalUrl": "Suggested canonical URL path like /blog/topic-slug",
  "categories": "Comma-separated WordPress categories",
  "tags": "Comma-separated WordPress tags"
}`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "blog_draft",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  excerpt: { type: "string" },
                  seoTitle: { type: "string" },
                  metaDescription: { type: "string" },
                  focusKeyword: { type: "string" },
                  canonicalUrl: { type: "string" },
                  categories: { type: "string" },
                  tags: { type: "string" },
                },
                required: ["title","content","excerpt","seoTitle","metaDescription","focusKeyword","canonicalUrl","categories","tags"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;

        await updateDraft(draftId, { ...parsed, status: "draft" });
        await updateTopic(input.topicId, { status: "draft_ready" });

        // Draft ready notification intentionally disabled
      } catch (err) {
        await updateDraft(draftId, { status: "draft" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Draft generation failed" });
      }

      return { draftId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      excerpt: z.string().optional(),
      seoTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      focusKeyword: z.string().optional(),
      canonicalUrl: z.string().optional(),
      categories: z.string().optional(),
      tags: z.string().optional(),
      status: z.enum(["generating","draft","in_review","approved","rejected","published"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateDraft(id, data);
      return { success: true };
    }),

  submitForReview: protectedProcedure
    .input(z.object({ id: z.number(), topicId: z.number() }))
    .mutation(async ({ input }) => {
      await updateDraft(input.id, { status: "in_review" });
      await updateTopic(input.topicId, { status: "in_review" });
      return { success: true };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number(), topicId: z.number() }))
    .mutation(async ({ input }) => {
      await updateDraft(input.id, { status: "approved" });
      await updateTopic(input.topicId, { status: "approved_for_publish" });
      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number(), topicId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      await updateDraft(input.id, { status: "rejected" });
      await updateTopic(input.topicId, { status: "rejected" });
      return { success: true };
    }),
});

// ─── QA Router ────────────────────────────────────────────────────────────────

const qaRouter = router({
  getLatest: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .query(async ({ input }) => (await getLatestQaForDraft(input.draftId)) ?? null),

  run: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .mutation(async ({ input }) => {
      const draft = await getDraftById(input.draftId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });

      const brand = await getBrandContext();
      const content = draft.content || "";
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      // Title / H1 check
      const titleH1Check = draft.title && draft.title.length > 10 && draft.title.length < 80 ? "pass" : draft.title ? "warn" : "fail";

      // Meta description check
      const metaDescCheck = draft.metaDescription
        ? draft.metaDescription.length >= 120 && draft.metaDescription.length <= 155 ? "pass" : "warn"
        : "fail";

      // Internal links check
      const internalLinkCount = (content.match(/simpleshowing\.com/gi) || []).length + (content.match(/href="\/[^"]+"/gi) || []).length;
      const internalLinksCheck = internalLinkCount >= 3 ? "pass" : internalLinkCount >= 1 ? "warn" : "fail";

      // Citation check
      const hasCitations = content.includes("http") || content.includes("according to") || content.includes("source:");
      const citationCheck = hasCitations ? "pass" : "warn";

      // Word count check
      const wordCountCheck = wordCount >= 1500 ? "pass" : wordCount >= 800 ? "warn" : "fail";

      // CTA check
      const approvedCtaList = brand.approvedCTAs.toLowerCase().split(",").map(c => c.trim());
      const hasCTA = approvedCtaList.some(cta => content.toLowerCase().includes(cta.split(" ").slice(0, 3).join(" ")));
      const ctaCheck = hasCTA ? "pass" : "warn";

      // Readability (simple Flesch-Kincaid approximation)
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
      const words = wordCount || 1;
      const syllables = content.split(/[aeiou]/i).length;
      const fkScore = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words))));
      const readabilityCheck = fkScore >= 60 ? "pass" : fkScore >= 40 ? "warn" : "fail";

      // Cannibalization (simple check)
      const cannibalizationCheck = "warn"; // Would need GSC integration for real check

      // Overall
      const checks = [titleH1Check, metaDescCheck, internalLinksCheck, citationCheck, wordCountCheck, ctaCheck, readabilityCheck];
      const failCount = checks.filter(c => c === "fail").length;
      const warnCount = checks.filter(c => c === "warn").length;
      const overallStatus = failCount > 0 ? "fail" : warnCount > 2 ? "warn" : "pass";

      const details = JSON.stringify({
        wordCount,
        internalLinkCount,
        readabilityScore: fkScore,
        checks: { titleH1Check, metaDescCheck, internalLinksCheck, citationCheck, wordCountCheck, ctaCheck, readabilityCheck, cannibalizationCheck },
      });

      const qaId = await createQaResult({
        draftId: input.draftId,
        titleH1Check: titleH1Check as any,
        metaDescCheck: metaDescCheck as any,
        internalLinksCheck: internalLinksCheck as any,
        citationCheck: citationCheck as any,
        readabilityScore: fkScore,
        readabilityCheck: readabilityCheck as any,
        cannibalizationCheck: "warn",
        wordCountCheck: wordCountCheck as any,
        ctaCheck: ctaCheck as any,
        overallStatus: overallStatus as any,
        details,
      });

      return { qaId, overallStatus, wordCount, readabilityScore: fkScore };
    }),
});

// ─── Comments Router ──────────────────────────────────────────────────────────

const commentsRouter = router({
  list: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .query(({ input }) => getCommentsByDraftId(input.draftId)),

  create: protectedProcedure
    .input(z.object({
      draftId: z.number(),
      content: z.string().min(1),
      type: z.enum(["comment","revision_request","approval_note"]).default("comment"),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createComment({
        draftId: input.draftId,
        authorId: ctx.user.id,
        content: input.content,
        type: input.type,
        resolved: false,
      });
      return { id };
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await resolveComment(input.id);
      return { success: true };
    }),
});

// ─── WordPress Router ─────────────────────────────────────────────────────────

const wordpressRouter = router({
  getLogs: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .query(({ input }) => getWpLogsForDraft(input.draftId)),

  getAllLogs: protectedProcedure.query(() => getAllWpLogs()),

  push: protectedProcedure
    .input(z.object({
      draftId: z.number(),
      topicId: z.number(),
      wpPostStatus: z.enum(["draft", "pending"]).default("draft"),
    }))
    .mutation(async ({ input, ctx }) => {
      const draft = await getDraftById(input.draftId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      if (draft.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Draft must be approved before publishing" });

      const wpUrl = await getSetting("wp_url");
      const wpUsername = await getSetting("wp_username");
      const wpAppPassword = await getSetting("wp_app_password");

      if (!wpUrl || !wpUsername || !wpAppPassword) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WordPress credentials not configured. Please update Settings." });
      }

      const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
      const apiBase = wpUrl.replace(/\/$/, "") + "/wp-json/wp/v2";

      let wpPostId: number | undefined;
      let wpPostUrl: string | undefined;
      let success = false;
      let errorMessage: string | undefined;
      let rankMathPopulated = false;
      let responsePayload: string | undefined;

      try {
        // 1. Suggest and resolve WP categories via LLM (non-fatal)
        const categoryNames = await suggestWpCategories(draft.title || "", draft.excerpt || "");
        const categoryIds = categoryNames.length > 0
          ? await resolveWpCategoryIds(categoryNames, apiBase, credentials)
          : [];

        // 2. Generate and upload featured image (non-fatal)
        const featuredMediaId = await uploadFeaturedImageToWp(draft.title || "", apiBase, credentials);

        // 3. Build post payload
        const postPayload: Record<string, unknown> = {
          title: draft.title || "",
          content: stripLeadingH1(draft.content || ""),
          excerpt: draft.excerpt || "",
          status: input.wpPostStatus,
          meta: {
            rank_math_title: draft.seoTitle || draft.title || "",
            rank_math_description: draft.metaDescription || "",
            rank_math_focus_keyword: draft.focusKeyword || "",
            rank_math_canonical_url: draft.canonicalUrl || "",
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
        responsePayload = JSON.stringify(data).slice(0, 2000);

        if (response.ok && data.id) {
          wpPostId = data.id;
          wpPostUrl = data.link;
          success = true;
          rankMathPopulated = true;

          await updateDraft(input.draftId, { status: "published" });
          await updateTopic(input.topicId, { status: "published" });

          const categoriesNote = categoryNames.length > 0 ? `\nCategories: ${categoryNames.join(", ")}` : "";
          try {
            await notifyOwner({
              title: "Post Published to WordPress",
              content: `"${draft.title}" has been pushed to WordPress as ${input.wpPostStatus}.\nPost ID: ${wpPostId}\nView post: ${wpPostUrl}${categoriesNote}`,
            });
          } catch (err) {
            console.warn('[notifyOwner] non-blocking failure:', err);
          }
        } else {
          errorMessage = data.message || `HTTP ${response.status}`;
        }
      } catch (err: any) {
        errorMessage = err.message || "Unknown error";
      }

      await createWpLog({
        draftId: input.draftId,
        topicId: input.topicId,
        wpPostId,
        wpPostUrl,
        wpStatus: input.wpPostStatus,
        pushedBy: ctx.user.id,
        rankMathPopulated,
        responsePayload,
        success,
        errorMessage,
      });

      if (!success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMessage || "WordPress push failed" });
      }

      return { wpPostId, wpPostUrl, success };
    }),
});

// ─── Settings Router ──────────────────────────────────────────────────────────

const settingsRouter = router({
  getAll: protectedProcedure.query(async () => {
    const s = await getAllSettings();
    // Never return the WP app password to the browser — show masked indicator only
    if (s["wp_app_password"]) {
      s["wp_app_password"] = "••••••••";
    }
    return s;
  }),

  update: adminProcedure
    .input(z.object({
      wp_url: z.string().optional(),
      wp_username: z.string().optional(),
      wp_app_password: z.string().optional(),
      brand_voice: z.string().optional(),
      approved_ctas: z.string().optional(),
      target_markets: z.string().optional(),
      forbidden_claims: z.string().optional(),
      style_guide: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pairs: Record<string, string> = {};
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) pairs[k] = v;
      }
      await setSettings(pairs);
      return { success: true };
    }),
});

// ─── Editors Router ───────────────────────────────────────────────────────────

const editorsRouter = router({
  list: adminProcedure.query(() => getInvitedEditors()),

  invite: adminProcedure
    .input(z.object({ email: z.string().email(), name: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await inviteEditor(input.email, input.name || null, ctx.user.id);
      await sendEditorInvite({ to: input.email, name: input.name || null });
      return { success: true };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await removeEditor(input.id);
      return { success: true };
    }),
});

// ─── Partner Submissions Router ──────────────────────────────────────────────

/** Blocklist patterns for do-follow link quality check */
const LINK_BLOCKLIST = [
  /casino/i, /gambling/i, /poker/i, /slots/i, /betting/i, /sportsbook/i,
  /payday.?loan/i, /cash.?advance/i, /quick.?loan/i,
  /adult/i, /porn/i, /escort/i, /xxx/i,
  /crypto.?pump/i, /forex.?signal/i, /mlm/i, /pyramid/i,
  /pharma/i, /viagra/i, /cialis/i, /cbd.?oil/i,
];

function checkLinks(declaredLinks: Array<{ url: string; anchorText: string }>) {
  const flagged: string[] = [];
  for (const { url, anchorText } of declaredLinks) {
    if (LINK_BLOCKLIST.some(re => re.test(url) || re.test(anchorText))) {
      flagged.push(url);
    }
  }
  return flagged;
}

const partnerSubmissionsRouter = router({
  /** Public: submit a guest post or link insertion request */
  submit: publicProcedure
    .input(z.object({
      partnerName: z.string().min(1).max(255),
      partnerEmail: z.string().email(),
      partnerCompany: z.string().max(255).optional(),
      title: z.string().min(1).max(512),
      category: z.string().max(255).optional(),
      submissionType: z.enum(["guest_post", "link_insertion"]).default("guest_post"),
      contentText: z.string().optional(),
      googleDocsUrl: z.string().url().optional(),
      targetArticleUrl: z.string().url().optional(),
      declaredLinks: z.array(z.object({
        url: z.string().url(),
        anchorText: z.string().max(255),
        linkType: z.enum(["do_follow", "internal", "authoritative"]).optional(),
      })).default([]),
      extraDfLink: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      // Run link QA immediately
      const flagged = checkLinks(input.declaredLinks);
      const linkQaStatus = flagged.length > 0 ? "fail" as const : "pass" as const;
      const linkQaDetails = flagged.length > 0
        ? `Flagged links: ${flagged.join(", ")}`
        : "All declared links passed blocklist check.";

      const amountCents = getPriceForSubmission(input.submissionType ?? "guest_post", input.extraDfLink);

      const submission = await createPartnerSubmission({
        ...input,
        partnerCompany: input.partnerCompany ?? null,
        category: input.category ?? null,
        contentText: input.contentText ?? null,
        googleDocsUrl: input.googleDocsUrl ?? null,
        targetArticleUrl: input.targetArticleUrl ?? null,
        declaredLinks: input.declaredLinks,
        extraDfLink: input.extraDfLink,
        amountCents,
        linkQaStatus,
        linkQaDetails,
        status: "pending",
      });

      // Notify owner of new submission (best-effort, never block submission)
      try {
        await notifyOwner({
          title: `New Partner Submission: ${input.title}`,
          content: `Partner: ${input.partnerName} (${input.partnerEmail})\nType: ${input.submissionType}\nTitle: ${input.title}\nLink QA: ${linkQaStatus}${flagged.length > 0 ? ` — ${linkQaDetails}` : ""}\n\nReview it in the dashboard.`,
        });
      } catch (err) {
        console.warn('[notifyOwner] non-blocking failure:', err);
      }

      // Email partner: submission received
      await sendPartnerSubmissionReceived({
        to: input.partnerEmail,
        partnerName: input.partnerName,
        title: input.title,
        referenceId: submission.id,
      });

      return { success: true, id: submission.id };
    }),

  /** Admin: list all submissions */
  list: adminProcedure.query(() => getPartnerSubmissions()),

  /** Admin: get a single submission */
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const sub = await getPartnerSubmissionById(input.id);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
      return sub;
    }),

  /** Admin: mark as in_review */
  startReview: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await updatePartnerSubmission(input.id, { status: "in_review" });
      return { success: true };
    }),

  /** Admin: approve a submission */
  approve: adminProcedure
    .input(z.object({ id: z.number(), reviewNotes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await updatePartnerSubmission(input.id, {
        status: "approved",
        reviewNotes: input.reviewNotes ?? null,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      });
      // Notify owner
      const sub = await getPartnerSubmissionById(input.id);
      if (sub) {
        try {
          await notifyOwner({
            title: `Submission Approved: ${sub.title}`,
            content: `The submission "${sub.title}" by ${sub.partnerName} (${sub.partnerEmail}) has been approved and is ready to publish.`,
          });
        } catch (err) {
          console.warn('[notifyOwner] non-blocking failure:', err);
        }
        // Email partner: approved
        await sendPartnerApproved({
          to: sub.partnerEmail,
          partnerName: sub.partnerName,
          title: sub.title,
          referenceId: sub.id,
        });
      }
      return { success: true };
    }),

  /** Admin: reject a submission */
  reject: adminProcedure
    .input(z.object({ id: z.number(), reviewNotes: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await updatePartnerSubmission(input.id, {
        status: "rejected",
        reviewNotes: input.reviewNotes,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      });
      // Email partner: rejected with reason
      const rejSub = await getPartnerSubmissionById(input.id);
      if (rejSub) {
        await sendPartnerRejected({
          to: rejSub.partnerEmail,
          partnerName: rejSub.partnerName,
          title: rejSub.title,
          referenceId: rejSub.id,
          reason: input.reviewNotes,
        });
      }
      return { success: true };
    }),

  /** Admin: mark as published (after WP push) — creates Stripe Payment Link and schedules reminders */
  markPublished: adminProcedure
    .input(z.object({
      id: z.number(),
      wpPostId: z.number().optional(),
      wpPostUrl: z.string().optional(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pubSub = await getPartnerSubmissionById(input.id);
      if (!pubSub) throw new TRPCError({ code: "NOT_FOUND" });

      const publishedAt = new Date();
      const successUrl = `${input.origin ?? "https://simpleblog.manus.space"}/payment-success`;

      // Create Stripe Payment Link
      let stripePaymentLinkId: string | undefined;
      let stripePaymentLinkUrl: string | undefined;
      try {
        const link = await createPartnerPaymentLink({
          submissionId: pubSub.id,
          partnerEmail: pubSub.partnerEmail,
          partnerName: pubSub.partnerName,
          articleTitle: pubSub.title,
          amountCents: pubSub.amountCents ?? getPriceForSubmission(pubSub.submissionType ?? "guest_post", pubSub.extraDfLink ?? false),
          successUrl,
        });
        stripePaymentLinkId = link.id;
        stripePaymentLinkUrl = link.url;
      } catch (stripeErr) {
        console.error("[markPublished] Stripe Payment Link creation failed:", stripeErr);
      }

      // Schedule payment reminder heartbeat jobs (day 3, 5, 7)
      let reminderDay3TaskUid: string | undefined;
      let reminderDay5TaskUid: string | undefined;
      let reminderDay7TaskUid: string | undefined;
      try {
        const uids = await schedulePaymentReminders(pubSub.id, publishedAt);
        reminderDay3TaskUid = uids.day3;
        reminderDay5TaskUid = uids.day5;
        reminderDay7TaskUid = uids.day7;
      } catch (schedErr) {
        console.error("[markPublished] Failed to schedule payment reminders:", schedErr);
      }

      await updatePartnerSubmission(input.id, {
        status: "published",
        wpPostId: input.wpPostId ?? null,
        wpPostUrl: input.wpPostUrl ?? null,
        publishedAt,
        stripePaymentLinkId: stripePaymentLinkId ?? null,
        stripePaymentLinkUrl: stripePaymentLinkUrl ?? null,
        reminderDay3TaskUid: reminderDay3TaskUid ?? null,
        reminderDay5TaskUid: reminderDay5TaskUid ?? null,
        reminderDay7TaskUid: reminderDay7TaskUid ?? null,
      });

      // Email partner: published with live URL + payment link
      if (input.wpPostUrl) {
        await sendPartnerPublished({
          to: pubSub.partnerEmail,
          partnerName: pubSub.partnerName,
          title: pubSub.title,
          referenceId: pubSub.id,
          wpPostUrl: input.wpPostUrl,
          paymentLinkUrl: stripePaymentLinkUrl,
          amountCents: pubSub.amountCents ?? getPriceForSubmission(pubSub.submissionType ?? "guest_post", pubSub.extraDfLink ?? false),
        });
      }
      return { success: true, stripePaymentLinkUrl };
    }),

  /** Admin: re-run link QA on a submission */
  runLinkQa: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const sub = await getPartnerSubmissionById(input.id);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      const flagged = checkLinks(sub.declaredLinks ?? []);
      const linkQaStatus = flagged.length > 0 ? "fail" as const : "pass" as const;
      const linkQaDetails = flagged.length > 0
        ? `Flagged links: ${flagged.join(", ")}`
        : "All declared links passed blocklist check.";
      await updatePartnerSubmission(input.id, { linkQaStatus, linkQaDetails });
      return { linkQaStatus, linkQaDetails, flagged };
    }),

  /** Admin: extend payment grace period (pauses day-3/5/7 reminder sequence) */
  extendGrace: adminProcedure
    .input(z.object({ id: z.number(), extend: z.boolean() }))
    .mutation(async ({ input }) => {
      const sub = await getPartnerSubmissionById(input.id);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      await updatePartnerSubmission(input.id, { paymentGraceExtended: input.extend });
      return { success: true, paymentGraceExtended: input.extend };
    }),

  /** Admin: manually mark a submission as removed due to non-payment (sets status to rejected, notes the reason) */
  markRemovedUnpaid: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const sub = await getPartnerSubmissionById(input.id);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      // Attempt to set WP post to draft if credentials available
      if (sub.wpPostId) {
        try {
          const wpUrl = await getSetting("wp_url");
          const wpUser = await getSetting("wp_username");
          const wpPass = await getSetting("wp_app_password");
          if (wpUrl && wpUser && wpPass) {
            const url = `${wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${sub.wpPostId}`;
            await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}`,
              },
              body: JSON.stringify({ status: "draft" }),
            });
          }
        } catch (wpErr) {
          console.error("[markRemovedUnpaid] WP draft error:", wpErr);
        }
      }
      await updatePartnerSubmission(input.id, {
        status: "rejected",
        reviewNotes: (sub.reviewNotes ? sub.reviewNotes + "\n" : "") + "Removed: non-payment after publication.",
      });
      return { success: true };
    }),

  /** Admin: restore a day-7-unpublished post to published status (after manual payment confirmation) */
  restorePublished: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const sub = await getPartnerSubmissionById(input.id);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      // Restore WP post via REST API if credentials available
      if (sub.wpPostId) {
        try {
          const wpUrl = await getSetting("wp_url");
          const wpUser = await getSetting("wp_username");
          const wpPass = await getSetting("wp_app_password");
          if (wpUrl && wpUser && wpPass) {
            const url = `${wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${sub.wpPostId}`;
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}`,
              },
              body: JSON.stringify({ status: "publish" }),
            });
            if (!res.ok) {
              const text = await res.text();
              console.error(`[restorePublished] WP restore failed (${res.status}): ${text}`);
            }
          }
        } catch (wpErr) {
          console.error("[restorePublished] WP restore error:", wpErr);
        }
      }
      await updatePartnerSubmission(input.id, {
        status: "published",
        paymentStatus: "paid",
        paidAt: new Date(),
      });
      return { success: true };
    }),
});

// ─── Payments Router ────────────────────────────────────────────────

const paymentsRouter = router({
  /** All published partner submissions with payment info */
  list: adminProcedure.query(async () => {
    return getPublishedSubmissionsWithPayment();
  }),
  /** Published submissions where payment has not been confirmed */
  listUnpaid: adminProcedure.query(async () => {
    return getUnpaidSubmissions();
  }),
});

// ─── Blog Pipeline Router ───────────────────────────────────────────────────

import { createHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";
import { parse as parseCookie } from "cookie";

const BLOG_PIPELINE_JOB_NAME = "daily-blog-post-generator";

const blogPipelineRouter = router({
  /** List topics with optional filters */
  listTopics: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "used", "skipped"]).optional(),
      contentType: z.enum(["informational", "lead_gen", "affiliate", "comparison"]).optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      sortBy: z.enum(["priority", "traffic", "position", "referringDomains", "numKeywords", "keyword"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }))
    .query(async ({ input }) => {
      const [topics, total] = await Promise.all([
        getBlogTopics(input),
        countBlogTopics({ status: input.status, contentType: input.contentType }),
      ]);
      return { topics, total };
    }),

  /** Update a topic's status (e.g. skip it) */
  updateTopicStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "used", "skipped"]),
    }))
    .mutation(async ({ input }) => {
      await updateBlogTopicStatus(input.id, input.status);
      return { success: true };
    }),

  /** Reorder topics by setting explicit priority values (drag-to-reorder) */
  reorderTopics: adminProcedure
    .input(z.object({
      // Array of { id, priority } — the client sends the new desired order
      items: z.array(z.object({ id: z.number(), priority: z.number() })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Update each topic's priority in parallel
      await Promise.all(
        input.items.map(({ id, priority }) =>
          db.update(blogTopics).set({ priority }).where(eq(blogTopics.id, id))
        )
      );
      return { success: true };
    }),

  /** Delete one or many blog topics by ID */
  deleteTopics: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await bulkDeleteBlogTopics(input.ids);
      return { deleted: input.ids.length };
    }),

  /** Generate a draft for a specific topic immediately */
  generateForTopic: adminProcedure
    .input(z.object({ topicId: z.number() }))
    .mutation(async ({ input }) => {
      const { runBlogPostGeneration } = await import("./blogPostGenerator");
      const result = await runBlogPostGeneration(input.topicId);
      if (!result.ok && "skipped" in result) {
        throw new TRPCError({ code: "NOT_FOUND", message: result.reason ?? "Topic not found or already used" });
      }
      if (!result.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (result as any).error ?? "Generation failed" });
      }
      return result;
    }),

  /** List generated posts with optional filters */
  listPosts: adminProcedure
    .input(z.object({
      contentType: z.enum(["informational", "lead_gen", "affiliate", "comparison"]).optional(),
      status: z.enum(["generating", "published", "failed"]).optional(),
      affiliateFlag: z.boolean().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const [posts, total] = await Promise.all([
        getGeneratedPosts(input),
        countGeneratedPosts({ contentType: input.contentType, status: input.status }),
      ]);
      return { posts, total };
    }),

  /** Seed the topic queue from the combined_topics JSON (admin only, one-time) */
  seedTopics: adminProcedure
    .input(z.object({
      topics: z.array(z.object({
        keyword: z.string().min(1),
        sourceUrl: z.string().optional(),
        traffic: z.number().default(0),
        kwVolume: z.number().default(0),
        contentType: z.enum(["informational", "lead_gen", "affiliate", "comparison"]).default("informational"),
        source: z.enum(["clever", "houzeo", "manual"]).default("manual"),
        // New optional fields from Clever/Houzeo exports
        referringDomains: z.number().optional(),
        numKeywords: z.number().optional(),
        position: z.number().optional(),
        previousTopKeyword: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const rows = input.topics.map((t) => ({
        keyword: t.keyword,
        sourceUrl: t.sourceUrl ?? null,
        traffic: t.traffic,
        kwVolume: t.kwVolume,
        contentType: t.contentType,
        source: t.source,
        status: "pending" as const,
        priority: t.traffic, // use traffic as initial priority
        referringDomains: t.referringDomains ?? null,
        numKeywords: t.numKeywords ?? null,
        position: t.position ?? null,
        previousTopKeyword: t.previousTopKeyword ?? null,
      }));
      const inserted = await bulkInsertBlogTopics(rows);
      return { inserted };
    }),

  /** Get topic queue stats */
  stats: adminProcedure.query(async () => {
    const [pending, used, skipped, totalPosts, affiliatePosts] = await Promise.all([
      countBlogTopics({ status: "pending" }),
      countBlogTopics({ status: "used" }),
      countBlogTopics({ status: "skipped" }),
      countGeneratedPosts(),
      countGeneratedPosts({ status: "published" }),
    ]);
    return { pending, used, skipped, totalPosts, publishedPosts: affiliatePosts };
  }),

  /** Create or verify the daily 8am UTC heartbeat job */
  setupDailyJob: adminProcedure.mutation(async ({ ctx }) => {
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    // Check if job already exists
    try {
      const existing = await listHeartbeatJobs(sessionToken);
      const found = existing.jobs.find(j => j.name === BLOG_PIPELINE_JOB_NAME);
      if (found) {
        return { created: false, taskUid: found.taskUid, nextExecutionAt: found.nextExecutionAt };
      }
    } catch { /* proceed to create */ }

    const job = await createHeartbeatJob({
      name: BLOG_PIPELINE_JOB_NAME,
      cron: "0 0 8 * * *",  // 8:00 AM UTC daily
      path: "/api/scheduled/blogPostGenerator",
      description: "Daily automated blog post generation from topic queue",
    }, sessionToken);

    return { created: true, taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt };
  }),

  /** Manually trigger post generation on-demand */
  generateNow: adminProcedure.mutation(async () => {
    const { runBlogPostGeneration } = await import("./blogPostGenerator");
    const result = await runBlogPostGeneration();
    if (!result.ok && "skipped" in result) {
      return { ok: false as const, skipped: result.skipped };
    }
    if (!result.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (result as any).message || (result as any).error || "Generation failed" });
    }
    return { ok: true as const, postId: result.postId, wpPostId: result.wpPostId, wpPostUrl: result.wpPostUrl, title: result.title };
  }),

  /** Bulk generate posts for multiple specific topics sequentially */
  bulkGenerateTopics: adminProcedure
    .input(z.object({ topicIds: z.array(z.number()).min(1).max(20) }))
    .mutation(async ({ input }) => {
      const { runBlogPostGeneration } = await import("./blogPostGenerator");
      const results: Array<{ topicId: number; ok: boolean; title?: string; wpPostUrl?: string; error?: string }> = [];
      for (const topicId of input.topicIds) {
        try {
          const result = await runBlogPostGeneration(topicId);
          if (result.ok) {
            results.push({ topicId, ok: true, title: result.title, wpPostUrl: result.wpPostUrl });
          } else {
            results.push({ topicId, ok: false, error: (result as any).error || (result as any).skipped || "failed" });
          }
        } catch (err: any) {
          results.push({ topicId, ok: false, error: err.message });
        }
      }
      const succeeded = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).length;
      return { results, succeeded, failed };
    }),

  /** Get the status of the daily job */
  getDailyJobStatus: adminProcedure.query(async ({ ctx }) => {
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    try {
      const existing = await listHeartbeatJobs(sessionToken);
      const found = existing.jobs.find(j => j.name === BLOG_PIPELINE_JOB_NAME);
      return found ?? null;
    } catch {
      return null;
    }
  }),
});


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
      const apiBase = wpUrl.replace(/\/$/, "") + "/wp-json/wp/v2";
      const response = await fetch(`${apiBase}/posts?per_page=100&status=publish&_fields=id,slug,title,link,date_modified`, { headers: { Authorization: `Basic ${credentials}` } });
      if (!response.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `WP API error: ${response.status}` });
      const posts = await response.json() as Array<{ id: number; slug: string; title: { rendered: string }; link: string; date_modified: string }>;
      const db = await getDb();
      const refreshed = db ? await db.select({ wpPostId: postRefreshLog.wpPostId, action: postRefreshLog.action, processedAt: postRefreshLog.processedAt }).from(postRefreshLog) : [];
      const refreshedMap = new Map(refreshed.map(r => [r.wpPostId, r]));
      return posts.map(p => {
        const decision = triagePost(p.slug, 0, 0);
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
      const apiBase = wpUrl.replace(/\/$/, "") + "/wp-json/wp/v2";
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
      const updateResp = await fetch(`${wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${input.wpPostId}`, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "draft" }) });
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


// ─── App Router ──────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  topics: topicsRouter,
  briefs: briefsRouter,
  drafts: draftsRouter,
  qa: qaRouter,
  comments: commentsRouter,
  wordpress: wordpressRouter,
  settings: settingsRouter,
  editors: editorsRouter,
  partnerSubmissions: partnerSubmissionsRouter,
  payments: paymentsRouter,
  blogPipeline: blogPipelineRouter,
  postRefresh: postRefreshRouter,
});

export type AppRouter = typeof appRouter;
