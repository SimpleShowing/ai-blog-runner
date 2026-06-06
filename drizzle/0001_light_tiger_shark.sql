CREATE TABLE `briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topicId` int NOT NULL,
	`serpNotes` text,
	`outline` text,
	`internalLinks` text,
	`faqs` text,
	`citations` text,
	`ctaStrategy` text,
	`differentiationAngle` text,
	`targetWordCount` int DEFAULT 1800,
	`generatedBy` varchar(64) DEFAULT 'ai',
	`editedContent` text,
	`status` enum('generating','ready','approved','archived') NOT NULL DEFAULT 'generating',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `briefs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`authorId` int NOT NULL,
	`content` text NOT NULL,
	`type` enum('comment','revision_request','approval_note') NOT NULL DEFAULT 'comment',
	`resolved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topicId` int NOT NULL,
	`briefId` int,
	`title` varchar(512),
	`content` text,
	`excerpt` text,
	`seoTitle` varchar(512),
	`metaDescription` varchar(320),
	`focusKeyword` varchar(255),
	`canonicalUrl` varchar(1024),
	`categories` text,
	`tags` text,
	`version` int NOT NULL DEFAULT 1,
	`generatedBy` varchar(64) DEFAULT 'ai',
	`status` enum('generating','draft','in_review','approved','rejected','published') NOT NULL DEFAULT 'generating',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invited_editors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`invitedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invited_editors_id` PRIMARY KEY(`id`),
	CONSTRAINT `invited_editors_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `qa_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`titleH1Check` enum('pass','warn','fail') DEFAULT 'warn',
	`metaDescCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`internalLinksCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`citationCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`readabilityScore` int,
	`readabilityCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`cannibalizationCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`wordCountCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`ctaCheck` enum('pass','warn','fail') DEFAULT 'warn',
	`overallStatus` enum('pass','warn','fail') DEFAULT 'warn',
	`details` text,
	`runAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qa_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`slug` varchar(512),
	`contentPillar` enum('buyer_guides','seller_guides','commission_savings','market_reports','comparison_pages','local_seo','how_to','other') NOT NULL DEFAULT 'other',
	`targetMarket` varchar(255),
	`conversionGoal` enum('home_valuation','commission_savings','buyer_rebate','book_consultation','general_awareness') NOT NULL DEFAULT 'general_awareness',
	`priority` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('idea','approved','brief_pending','brief_ready','draft_pending','draft_ready','in_review','approved_for_publish','rejected','published','paused') NOT NULL DEFAULT 'idea',
	`assignedTo` int,
	`notes` text,
	`targetKeyword` varchar(512),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wp_publish_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`topicId` int NOT NULL,
	`wpPostId` int,
	`wpPostUrl` varchar(1024),
	`wpStatus` varchar(64),
	`pushedBy` int NOT NULL,
	`rankMathPopulated` boolean NOT NULL DEFAULT false,
	`responsePayload` text,
	`success` boolean NOT NULL DEFAULT false,
	`errorMessage` text,
	`pushedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wp_publish_logs_id` PRIMARY KEY(`id`)
);
