import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
  serial,
} from "drizzle-orm/pg-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Invited Editors ──────────────────────────────────────────────────────────

export const invitedEditors = pgTable("invited_editors", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  invitedBy: integer("invitedBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvitedEditor = typeof invitedEditors.$inferSelect;

// ─── Topics ───────────────────────────────────────────────────────────────────

export const contentPillarEnum = pgEnum("contentPillar", [
  "buyer_guides", "seller_guides", "commission_savings", "market_reports",
  "comparison_pages", "local_seo", "how_to", "other",
]);
export const conversionGoalEnum = pgEnum("conversionGoal", [
  "home_valuation", "commission_savings", "buyer_rebate", "book_consultation", "general_awareness",
]);
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const topicStatusEnum = pgEnum("topicStatus", [
  "idea", "approved", "brief_pending", "brief_ready", "draft_pending",
  "draft_ready", "in_review", "approved_for_publish", "rejected", "published", "paused",
]);

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  slug: varchar("slug", { length: 512 }),
  contentPillar: contentPillarEnum("contentPillar").default("other").notNull(),
  targetMarket: varchar("targetMarket", { length: 255 }),
  conversionGoal: conversionGoalEnum("conversionGoal").default("general_awareness").notNull(),
  priority: priorityEnum("priority").default("medium").notNull(),
  status: topicStatusEnum("status").default("idea").notNull(),
  assignedTo: integer("assignedTo"),
  notes: text("notes"),
  targetKeyword: varchar("targetKeyword", { length: 512 }),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;

// ─── Content Briefs ───────────────────────────────────────────────────────────

export const briefStatusEnum = pgEnum("briefStatus", ["generating", "ready", "approved", "archived"]);

export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  topicId: integer("topicId").notNull(),
  serpNotes: text("serpNotes"),
  outline: text("outline"),
  internalLinks: text("internalLinks"),
  faqs: text("faqs"),
  citations: text("citations"),
  ctaStrategy: text("ctaStrategy"),
  differentiationAngle: text("differentiationAngle"),
  targetWordCount: integer("targetWordCount").default(1800),
  generatedBy: varchar("generatedBy", { length: 64 }).default("ai"),
  editedContent: text("editedContent"),
  status: briefStatusEnum("status").default("generating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Brief = typeof briefs.$inferSelect;
export type InsertBrief = typeof briefs.$inferInsert;

// ─── Drafts ───────────────────────────────────────────────────────────────────

export const draftStatusEnum = pgEnum("draftStatus", [
  "generating", "draft", "in_review", "approved", "rejected", "published",
]);

export const drafts = pgTable("drafts", {
  id: serial("id").primaryKey(),
  topicId: integer("topicId").notNull(),
  briefId: integer("briefId"),
  title: varchar("title", { length: 512 }),
  content: text("content"),
  excerpt: text("excerpt"),
  seoTitle: varchar("seoTitle", { length: 512 }),
  metaDescription: varchar("metaDescription", { length: 320 }),
  focusKeyword: varchar("focusKeyword", { length: 255 }),
  canonicalUrl: varchar("canonicalUrl", { length: 1024 }),
  slug: varchar("slug", { length: 512 }),
  categories: text("categories"),
  tags: text("tags"),
  wpPostId: integer("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  version: integer("version").default(1).notNull(),
  generatedBy: varchar("generatedBy", { length: 64 }).default("ai"),
  status: draftStatusEnum("status").default("generating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Draft = typeof drafts.$inferSelect;
export type InsertDraft = typeof drafts.$inferInsert;

// ─── QA Results ───────────────────────────────────────────────────────────────

export const qaCheckEnum = pgEnum("qaCheck", ["pass", "warn", "fail"]);

export const qaResults = pgTable("qa_results", {
  id: serial("id").primaryKey(),
  draftId: integer("draftId").notNull(),
  titleH1Check: qaCheckEnum("titleH1Check").default("warn"),
  metaDescCheck: qaCheckEnum("metaDescCheck").default("warn"),
  internalLinksCheck: qaCheckEnum("internalLinksCheck").default("warn"),
  citationCheck: qaCheckEnum("citationCheck").default("warn"),
  readabilityScore: integer("readabilityScore"),
  readabilityCheck: qaCheckEnum("readabilityCheck").default("warn"),
  cannibalizationCheck: qaCheckEnum("cannibalizationCheck").default("warn"),
  wordCountCheck: qaCheckEnum("wordCountCheck").default("warn"),
  ctaCheck: qaCheckEnum("ctaCheck").default("warn"),
  overallStatus: qaCheckEnum("overallStatus").default("warn"),
  details: text("details"),
  runAt: timestamp("runAt").defaultNow().notNull(),
});

export type QaResult = typeof qaResults.$inferSelect;

// ─── Comments ─────────────────────────────────────────────────────────────────

export const commentTypeEnum = pgEnum("commentType", ["comment", "revision_request", "approval_note"]);

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  draftId: integer("draftId").notNull(),
  authorId: integer("authorId").notNull(),
  content: text("content").notNull(),
  type: commentTypeEnum("type").default("comment").notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;

// ─── WordPress Publish Logs ───────────────────────────────────────────────────

export const wpPublishLogs = pgTable("wp_publish_logs", {
  id: serial("id").primaryKey(),
  draftId: integer("draftId").notNull(),
  topicId: integer("topicId").notNull(),
  wpPostId: integer("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  wpStatus: varchar("wpStatus", { length: 64 }),
  pushedBy: integer("pushedBy").notNull(),
  rankMathPopulated: boolean("rankMathPopulated").default(false).notNull(),
  responsePayload: text("responsePayload"),
  success: boolean("success").default(false).notNull(),
  errorMessage: text("errorMessage"),
  pushedAt: timestamp("pushedAt").defaultNow().notNull(),
});

export type WpPublishLog = typeof wpPublishLogs.$inferSelect;

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;

// ─── Partner Submissions ──────────────────────────────────────────────────────

export const submissionTypeEnum = pgEnum("submissionType", ["guest_post", "link_insertion"]);
export const submissionStatusEnum = pgEnum("submissionStatus", [
  "pending", "in_review", "approved", "rejected", "published",
]);
export const linkQaStatusEnum = pgEnum("linkQaStatus", ["pass", "warn", "fail"]);
export const paymentStatusEnum = pgEnum("paymentStatus", ["unpaid", "paid", "refunded"]);

export const partnerSubmissions = pgTable("partner_submissions", {
  id: serial("id").primaryKey(),
  partnerName: varchar("partnerName", { length: 255 }).notNull(),
  partnerEmail: varchar("partnerEmail", { length: 320 }).notNull(),
  partnerCompany: varchar("partnerCompany", { length: 255 }),
  title: varchar("title", { length: 512 }).notNull(),
  category: varchar("category", { length: 255 }),
  submissionType: submissionTypeEnum("submissionType").default("guest_post").notNull(),
  contentText: text("contentText"),
  contentFileKey: varchar("contentFileKey", { length: 1024 }),
  googleDocsUrl: varchar("googleDocsUrl", { length: 1024 }),
  targetArticleUrl: varchar("targetArticleUrl", { length: 1024 }),
  extraDfLink: boolean("extraDfLink").default(false).notNull(),
  declaredLinks: json("declaredLinks").$type<Array<{ url: string; anchorText: string; linkType?: string }>>().default([]).notNull(),
  status: submissionStatusEnum("status").default("pending").notNull(),
  reviewNotes: text("reviewNotes"),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  linkQaStatus: linkQaStatusEnum("linkQaStatus"),
  linkQaDetails: text("linkQaDetails"),
  wpPostId: integer("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  amountCents: integer("amountCents"),
  stripePaymentLinkId: varchar("stripePaymentLinkId", { length: 255 }),
  stripePaymentLinkUrl: varchar("stripePaymentLinkUrl", { length: 1024 }),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  paymentStatus: paymentStatusEnum("paymentStatus").default("unpaid"),
  paidAt: timestamp("paidAt"),
  paymentGraceExtended: boolean("paymentGraceExtended").default(false).notNull(),
  reminderDay3TaskUid: varchar("reminderDay3TaskUid", { length: 65 }),
  reminderDay5TaskUid: varchar("reminderDay5TaskUid", { length: 65 }),
  reminderDay7TaskUid: varchar("reminderDay7TaskUid", { length: 65 }),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PartnerSubmission = typeof partnerSubmissions.$inferSelect;
export type InsertPartnerSubmission = typeof partnerSubmissions.$inferInsert;

// ─── Blog Topics (Automated Pipeline Queue) ──────────────────────────────────

export const blogTopicContentTypeEnum = pgEnum("blogTopicContentType", [
  "informational", "lead_gen", "affiliate", "comparison",
]);
export const blogTopicSourceEnum = pgEnum("blogTopicSource", ["clever", "houzeo", "manual"]);
export const blogTopicStatusEnum = pgEnum("blogTopicStatus", ["pending", "used", "skipped"]);

export const blogTopics = pgTable("blog_topics", {
  id: serial("id").primaryKey(),
  keyword: varchar("keyword", { length: 512 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 1024 }),
  traffic: integer("traffic").default(0).notNull(),
  kwVolume: integer("kwVolume").default(0).notNull(),
  contentType: blogTopicContentTypeEnum("contentType").default("informational").notNull(),
  source: blogTopicSourceEnum("source").default("manual").notNull(),
  status: blogTopicStatusEnum("status").default("pending").notNull(),
  priority: integer("priority").default(0).notNull(),
  referringDomains: integer("referringDomains"),
  numKeywords: integer("numKeywords"),
  position: integer("position"),
  previousTopKeyword: varchar("previousTopKeyword", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BlogTopic = typeof blogTopics.$inferSelect;
export type InsertBlogTopic = typeof blogTopics.$inferInsert;

// ─── Generated Posts (Automated Pipeline Output) ─────────────────────────────

export const generatedPostStatusEnum = pgEnum("generatedPostStatus", [
  "generating", "published", "failed",
]);

export const generatedPosts = pgTable("generated_posts", {
  id: serial("id").primaryKey(),
  topicId: integer("topicId").notNull(),
  title: varchar("title", { length: 512 }),
  content: text("content"),
  wpPostId: integer("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  contentType: blogTopicContentTypeEnum("contentType").default("informational").notNull(),
  affiliateFlag: boolean("affiliateFlag").default(false).notNull(),
  status: generatedPostStatusEnum("status").default("generating").notNull(),
  errorMessage: text("errorMessage"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedPost = typeof generatedPosts.$inferSelect;
export type InsertGeneratedPost = typeof generatedPosts.$inferInsert;

// ─── Post Refresh Log ─────────────────────────────────────────────────────────

export const refreshActionEnum = pgEnum("refreshAction", [
  "refresh", "noindex", "keep", "redirect",
]);
export const refreshStatusEnum = pgEnum("refreshStatus", [
  "pending", "processing", "done", "failed",
]);

export const postRefreshLog = pgTable("post_refresh_log", {
  id: serial("id").primaryKey(),
  wpPostId: integer("wpPostId").notNull(),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  title: varchar("title", { length: 512 }),
  slug: varchar("slug", { length: 512 }),
  action: refreshActionEnum("action").notNull(),
  decision: refreshActionEnum("decision").notNull(),
  targetKeywords: text("targetKeywords"),
  originalContent: text("originalContent"),
  newContent: text("newContent"),
  ahrefsPosition: integer("ahrefsPosition"),
  ahrefsTraffic: integer("ahrefsTraffic"),
  status: refreshStatusEnum("status").default("pending").notNull(),
  errorMessage: text("errorMessage"),
  processedBy: integer("processedBy"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PostRefreshLog = typeof postRefreshLog.$inferSelect;
export type InsertPostRefreshLog = typeof postRefreshLog.$inferInsert;
