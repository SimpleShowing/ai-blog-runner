ALTER TABLE `drafts` ADD `slug` varchar(512);--> statement-breakpoint
ALTER TABLE `drafts` ADD `wpPostId` int;--> statement-breakpoint
ALTER TABLE `drafts` ADD `wpPostUrl` varchar(1024);