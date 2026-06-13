CREATE TYPE "public"."blogTopicContentType" AS ENUM('informational', 'lead_gen', 'affiliate', 'comparison');--> statement-breakpoint
CREATE TYPE "public"."blogTopicSource" AS ENUM('clever', 'houzeo', 'manual');--> statement-breakpoint
CREATE TYPE "public"."blogTopicStatus" AS ENUM('pending', 'used', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."briefStatus" AS ENUM('generating', 'ready', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."commentType" AS ENUM('comment', 'revision_request', 'approval_note');--> statement-breakpoint
CREATE TYPE "public"."contentPillar" AS ENUM('buyer_guides', 'seller_guides', 'commission_savings', 'market_reports', 'comparison_pages', 'local_seo', 'how_to', 'other');--> statement-breakpoint
CREATE TYPE "public"."conversionGoal" AS ENUM('home_valuation', 'commission_savings', 'buyer_rebate', 'book_consultation', 'general_awareness');--> statement-breakpoint
CREATE TYPE "public"."draftStatus" AS ENUM('generating', 'draft', 'in_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."generatedPostStatus" AS ENUM('generating', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."linkQaStatus" AS ENUM('pass', 'warn', 'fail');--> statement-breakpoint
CREATE TYPE "public"."paymentStatus" AS ENUM('unpaid', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."qaCheck" AS ENUM('pass', 'warn', 'fail');--> statement-breakpoint
CREATE TYPE "public"."refreshAction" AS ENUM('refresh', 'noindex', 'keep', 'redirect');--> statement-breakpoint
CREATE TYPE "public"."refreshStatus" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."submissionStatus" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."submissionType" AS ENUM('guest_post', 'link_insertion');--> statement-breakpoint
CREATE TYPE "public"."topicStatus" AS ENUM('idea', 'approved', 'brief_pending', 'brief_ready', 'draft_pending', 'draft_ready', 'in_review', 'approved_for_publish', 'rejected', 'published', 'paused');--> statement-breakpoint
CREATE TABLE "blog_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" varchar(512) NOT NULL,
	"sourceUrl" varchar(1024),
	"traffic" integer DEFAULT 0 NOT NULL,
	"kwVolume" integer DEFAULT 0 NOT NULL,
	"contentType" "blogTopicContentType" DEFAULT 'informational' NOT NULL,
	"source" "blogTopicSource" DEFAULT 'manual' NOT NULL,
	"status" "blogTopicStatus" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"referringDomains" integer,
	"numKeywords" integer,
	"position" integer,
	"previousTopKeyword" varchar(512),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"topicId" integer NOT NULL,
	"serpNotes" text,
	"outline" text,
	"internalLinks" text,
	"faqs" text,
	"citations" text,
	"ctaStrategy" text,
	"differentiationAngle" text,
	"targetWordCount" integer DEFAULT 1800,
	"generatedBy" varchar(64) DEFAULT 'ai',
	"editedContent" text,
	"status" "briefStatus" DEFAULT 'generating' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"draftId" integer NOT NULL,
	"authorId" integer NOT NULL,
	"content" text NOT NULL,
	"type" "commentType" DEFAULT 'comment' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"topicId" integer NOT NULL,
	"briefId" integer,
	"title" varchar(512),
	"content" text,
	"excerpt" text,
	"seoTitle" varchar(512),
	"metaDescription" varchar(320),
	"focusKeyword" varchar(255),
	"canonicalUrl" varchar(1024),
	"slug" varchar(512),
	"categories" text,
	"tags" text,
	"wpPostId" integer,
	"wpPostUrl" varchar(1024),
	"version" integer DEFAULT 1 NOT NULL,
	"generatedBy" varchar(64) DEFAULT 'ai',
	"status" "draftStatus" DEFAULT 'generating' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"topicId" integer NOT NULL,
	"title" varchar(512),
	"content" text,
	"wpPostId" integer,
	"wpPostUrl" varchar(1024),
	"contentType" "blogTopicContentType" DEFAULT 'informational' NOT NULL,
	"affiliateFlag" boolean DEFAULT false NOT NULL,
	"status" "generatedPostStatus" DEFAULT 'generating' NOT NULL,
	"errorMessage" text,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invited_editors" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255),
	"invitedBy" integer NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invited_editors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "partner_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partnerName" varchar(255) NOT NULL,
	"partnerEmail" varchar(320) NOT NULL,
	"partnerCompany" varchar(255),
	"title" varchar(512) NOT NULL,
	"category" varchar(255),
	"submissionType" "submissionType" DEFAULT 'guest_post' NOT NULL,
	"contentText" text,
	"contentFileKey" varchar(1024),
	"googleDocsUrl" varchar(1024),
	"targetArticleUrl" varchar(1024),
	"extraDfLink" boolean DEFAULT false NOT NULL,
	"declaredLinks" json DEFAULT '[]'::json NOT NULL,
	"status" "submissionStatus" DEFAULT 'pending' NOT NULL,
	"reviewNotes" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"linkQaStatus" "linkQaStatus",
	"linkQaDetails" text,
	"wpPostId" integer,
	"wpPostUrl" varchar(1024),
	"amountCents" integer,
	"stripePaymentLinkId" varchar(255),
	"stripePaymentLinkUrl" varchar(1024),
	"stripeSessionId" varchar(255),
	"paymentStatus" "paymentStatus" DEFAULT 'unpaid',
	"paidAt" timestamp,
	"paymentGraceExtended" boolean DEFAULT false NOT NULL,
	"reminderDay3TaskUid" varchar(65),
	"reminderDay5TaskUid" varchar(65),
	"reminderDay7TaskUid" varchar(65),
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_refresh_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"wpPostId" integer NOT NULL,
	"wpPostUrl" varchar(1024),
	"title" varchar(512),
	"slug" varchar(512),
	"action" "refreshAction" NOT NULL,
	"decision" "refreshAction" NOT NULL,
	"targetKeywords" text,
	"originalContent" text,
	"newContent" text,
	"ahrefsPosition" integer,
	"ahrefsTraffic" integer,
	"status" "refreshStatus" DEFAULT 'pending' NOT NULL,
	"errorMessage" text,
	"processedBy" integer,
	"processedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"draftId" integer NOT NULL,
	"titleH1Check" "qaCheck" DEFAULT 'warn',
	"metaDescCheck" "qaCheck" DEFAULT 'warn',
	"internalLinksCheck" "qaCheck" DEFAULT 'warn',
	"citationCheck" "qaCheck" DEFAULT 'warn',
	"readabilityScore" integer,
	"readabilityCheck" "qaCheck" DEFAULT 'warn',
	"cannibalizationCheck" "qaCheck" DEFAULT 'warn',
	"wordCountCheck" "qaCheck" DEFAULT 'warn',
	"ctaCheck" "qaCheck" DEFAULT 'warn',
	"overallStatus" "qaCheck" DEFAULT 'warn',
	"details" text,
	"runAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(512) NOT NULL,
	"slug" varchar(512),
	"contentPillar" "contentPillar" DEFAULT 'other' NOT NULL,
	"targetMarket" varchar(255),
	"conversionGoal" "conversionGoal" DEFAULT 'general_awareness' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"status" "topicStatus" DEFAULT 'idea' NOT NULL,
	"assignedTo" integer,
	"notes" text,
	"targetKeyword" varchar(512),
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "wp_publish_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"draftId" integer NOT NULL,
	"topicId" integer NOT NULL,
	"wpPostId" integer,
	"wpPostUrl" varchar(1024),
	"wpStatus" varchar(64),
	"pushedBy" integer NOT NULL,
	"rankMathPopulated" boolean DEFAULT false NOT NULL,
	"responsePayload" text,
	"success" boolean DEFAULT false NOT NULL,
	"errorMessage" text,
	"pushedAt" timestamp DEFAULT now() NOT NULL
);
