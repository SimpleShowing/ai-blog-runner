import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Invited Editors ──────────────────────────────────────────────────────────

export const invitedEditors = mysqlTable("invited_editors", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  invitedBy: int("invitedBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvitedEditor = typeof invitedEditors.$inferSelect;

// ─── Topics ───────────────────────────────────────────────────────────────────

export const topics = mysqlTable("topics", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  slug: varchar("slug", { length: 512 }),
  contentPillar: mysqlEnum("contentPillar", [
    "buyer_guides",
    "seller_guides",
    "commission_savings",
    "market_reports",
    "comparison_pages",
    "local_seo",
    "how_to",
    "other",
  ]).default("other").notNull(),
  targetMarket: varchar("targetMarket", { length: 255 }),
  conversionGoal: mysqlEnum("conversionGoal", [
    "home_valuation",
    "commission_savings",
    "buyer_rebate",
    "book_consultation",
    "general_awareness",
  ]).default("general_awareness").notNull(),
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", [
    "idea",
    "approved",
    "brief_pending",
    "brief_ready",
    "draft_pending",
    "draft_ready",
    "in_review",
    "approved_for_publish",
    "rejected",
    "published",
    "paused",
  ]).default("idea").notNull(),
  assignedTo: int("assignedTo"),
  notes: text("notes"),
  targetKeyword: varchar("targetKeyword", { length: 512 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;

// ─── Content Briefs ───────────────────────────────────────────────────────────

export const briefs = mysqlTable("briefs", {
  id: int("id").autoincrement().primaryKey(),
  topicId: int("topicId").notNull(),
  serpNotes: text("serpNotes"),
  outline: text("outline"),
  internalLinks: text("internalLinks"),
  faqs: text("faqs"),
  citations: text("citations"),
  ctaStrategy: text("ctaStrategy"),
  differentiationAngle: text("differentiationAngle"),
  targetWordCount: int("targetWordCount").default(1800),
  generatedBy: varchar("generatedBy", { length: 64 }).default("ai"),
  editedContent: text("editedContent"),
  status: mysqlEnum("status", ["generating", "ready", "approved", "archived"]).default("generating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Brief = typeof briefs.$inferSelect;
export type InsertBrief = typeof briefs.$inferInsert;

// ─── Drafts ───────────────────────────────────────────────────────────────────

export const drafts = mysqlTable("drafts", {
  id: int("id").autoincrement().primaryKey(),
  topicId: int("topicId").notNull(),
  briefId: int("briefId"),
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
  wpPostId: int("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  version: int("version").default(1).notNull(),
  generatedBy: varchar("generatedBy", { length: 64 }).default("ai"),
  status: mysqlEnum("status", [
    "generating",
    "draft",
    "in_review",
    "approved",
    "rejected",
    "published",
  ]).default("generating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Draft = typeof drafts.$inferSelect;
export type InsertDraft = typeof drafts.$inferInsert;

// ─── QA Results ───────────────────────────────────────────────────────────────

export const qaResults = mysqlTable("qa_results", {
  id: int("id").autoincrement().primaryKey(),
  draftId: int("draftId").notNull(),
  titleH1Check: mysqlEnum("titleH1Check", ["pass", "warn", "fail"]).default("warn"),
  metaDescCheck: mysqlEnum("metaDescCheck", ["pass", "warn", "fail"]).default("warn"),
  internalLinksCheck: mysqlEnum("internalLinksCheck", ["pass", "warn", "fail"]).default("warn"),
  citationCheck: mysqlEnum("citationCheck", ["pass", "warn", "fail"]).default("warn"),
  readabilityScore: int("readabilityScore"),
  readabilityCheck: mysqlEnum("readabilityCheck", ["pass", "warn", "fail"]).default("warn"),
  cannibalizationCheck: mysqlEnum("cannibalizationCheck", ["pass", "warn", "fail"]).default("warn"),
  wordCountCheck: mysqlEnum("wordCountCheck", ["pass", "warn", "fail"]).default("warn"),
  ctaCheck: mysqlEnum("ctaCheck", ["pass", "warn", "fail"]).default("warn"),
  overallStatus: mysqlEnum("overallStatus", ["pass", "warn", "fail"]).default("warn"),
  details: text("details"),
  runAt: timestamp("runAt").defaultNow().notNull(),
});

export type QaResult = typeof qaResults.$inferSelect;

// ─── Comments ─────────────────────────────────────────────────────────────────

export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  draftId: int("draftId").notNull(),
  authorId: int("authorId").notNull(),
  content: text("content").notNull(),
  type: mysqlEnum("type", ["comment", "revision_request", "approval_note"]).default("comment").notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;

// ─── WordPress Publish Logs ───────────────────────────────────────────────────

export const wpPublishLogs = mysqlTable("wp_publish_logs", {
  id: int("id").autoincrement().primaryKey(),
  draftId: int("draftId").notNull(),
  topicId: int("topicId").notNull(),
  wpPostId: int("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  wpStatus: varchar("wpStatus", { length: 64 }),
  pushedBy: int("pushedBy").notNull(),
  rankMathPopulated: boolean("rankMathPopulated").default(false).notNull(),
  responsePayload: text("responsePayload"),
  success: boolean("success").default(false).notNull(),
  errorMessage: text("errorMessage"),
  pushedAt: timestamp("pushedAt").defaultNow().notNull(),
});

export type WpPublishLog = typeof wpPublishLogs.$inferSelect;

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;

// ─── Partner Submissions ──────────────────────────────────────────────────────

export const partnerSubmissions = mysqlTable("partner_submissions", {
  id: int("id").autoincrement().primaryKey(),
  // Partner identity
  partnerName: varchar("partnerName", { length: 255 }).notNull(),
  partnerEmail: varchar("partnerEmail", { length: 320 }).notNull(),
  partnerCompany: varchar("partnerCompany", { length: 255 }),
  // Article details
  title: varchar("title", { length: 512 }).notNull(),
  category: varchar("category", { length: 255 }),
  submissionType: mysqlEnum("submissionType", [
    "guest_post",       // full new article
    "link_insertion",  // insert a do-follow link into existing article
  ]).default("guest_post").notNull(),
  // Content — one of three input modes
  contentText: text("contentText"),          // pasted HTML/markdown
  contentFileKey: varchar("contentFileKey", { length: 1024 }), // uploaded .docx S3 key
  googleDocsUrl: varchar("googleDocsUrl", { length: 1024 }),   // Google Docs share link
  // For link_insertion type: the target SimpleShowing article URL
  targetArticleUrl: varchar("targetArticleUrl", { length: 1024 }),
  // Extra do-follow link add-on (guest_post only)
  extraDfLink: boolean("extraDfLink").default(false).notNull(),
  // Declared links with type: do_follow | internal | authoritative
  declaredLinks: json("declaredLinks").$type<Array<{ url: string; anchorText: string; linkType?: string }>>()
    .default([]).notNull(),
  // Review
  status: mysqlEnum("status", [
    "pending",      // just submitted, awaiting review
    "in_review",   // reviewer opened it
    "approved",    // approved, ready to push to WP
    "rejected",    // rejected with reason
    "published",   // pushed to WordPress
  ]).default("pending").notNull(),
  reviewNotes: text("reviewNotes"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  // Link QA flags (set by automated check)
  linkQaStatus: mysqlEnum("linkQaStatus", ["pass", "warn", "fail"]),
  linkQaDetails: text("linkQaDetails"),
  // WordPress
  wpPostId: int("wpPostId"),
  wpPostUrl: varchar("wpPostUrl", { length: 1024 }),
  // Payment
  amountCents: int("amountCents"),                           // price in cents (15000, 17500, 12500)
  stripePaymentLinkId: varchar("stripePaymentLinkId", { length: 255 }),
  stripePaymentLinkUrl: varchar("stripePaymentLinkUrl", { length: 1024 }),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  paymentStatus: mysqlEnum("paymentStatus", [
    "unpaid",
    "paid",
    "refunded",
  ]).default("unpaid"),
  paidAt: timestamp("paidAt"),
  paymentGraceExtended: boolean("paymentGraceExtended").default(false).notNull(),
  // Scheduled reminder task UIDs
  reminderDay3TaskUid: varchar("reminderDay3TaskUid", { length: 65 }),
  reminderDay5TaskUid: varchar("reminderDay5TaskUid", { length: 65 }),
  reminderDay7TaskUid: varchar("reminderDay7TaskUid", { length: 65 }),
  // Timestamps
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PartnerSubmission = typeof partnerSubmissions.$inferSelect;
export type InsertPartnerSubmission = typeof partnerSubmissions.$inferInsert;
