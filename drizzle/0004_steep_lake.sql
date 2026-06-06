ALTER TABLE `partner_submissions` ADD `extraDfLink` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `amountCents` int;--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `stripePaymentLinkId` varchar(255);--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `stripePaymentLinkUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `stripeSessionId` varchar(255);--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `paymentStatus` enum('unpaid','paid','refunded') DEFAULT 'unpaid';--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `paymentGraceExtended` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `reminderDay3TaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `reminderDay5TaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `reminderDay7TaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `partner_submissions` ADD `publishedAt` timestamp;