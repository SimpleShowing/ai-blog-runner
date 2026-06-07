CREATE TABLE `blog_topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(512) NOT NULL,
	`sourceUrl` varchar(1024),
	`traffic` int NOT NULL DEFAULT 0,
	`kwVolume` int NOT NULL DEFAULT 0,
	`contentType` enum('informational','lead_gen','affiliate','comparison') NOT NULL DEFAULT 'informational',
	`source` enum('clever','houzeo','manual') NOT NULL DEFAULT 'manual',
	`status` enum('pending','used','skipped') NOT NULL DEFAULT 'pending',
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blog_topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topicId` int NOT NULL,
	`title` varchar(512),
	`content` text,
	`wpPostId` int,
	`wpPostUrl` varchar(1024),
	`contentType` enum('informational','lead_gen','affiliate','comparison') NOT NULL DEFAULT 'informational',
	`affiliateFlag` boolean NOT NULL DEFAULT false,
	`status` enum('generating','published','failed') NOT NULL DEFAULT 'generating',
	`errorMessage` text,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generated_posts_id` PRIMARY KEY(`id`)
);
