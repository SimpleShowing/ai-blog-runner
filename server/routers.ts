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
} from "./db";
import { ENV } from "./_core/env";

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

        // Notify owner
        await notifyOwner({
          title: "New Draft Ready for Review",
          content: `A new draft for "${topic.title}" is ready for editorial review.`,
        });
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
      await notifyOwner({
        title: "Draft Submitted for Review",
        content: `Draft #${input.id} has been submitted for editorial review.`,
      });
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
        // Create the post
        const postPayload: Record<string, unknown> = {
          title: draft.title || "",
          content: draft.content || "",
          excerpt: draft.excerpt || "",
          status: input.wpPostStatus,
          meta: {
            rank_math_title: draft.seoTitle || draft.title || "",
            rank_math_description: draft.metaDescription || "",
            rank_math_focus_keyword: draft.focusKeyword || "",
            rank_math_canonical_url: draft.canonicalUrl || "",
          },
        };

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

          await notifyOwner({
            title: "Post Published to WordPress",
            content: `"${draft.title}" has been pushed to WordPress as ${input.wpPostStatus}. Post ID: ${wpPostId}`,
          });
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
      return { success: true };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await removeEditor(input.id);
      return { success: true };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────

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
});

export type AppRouter = typeof appRouter;
