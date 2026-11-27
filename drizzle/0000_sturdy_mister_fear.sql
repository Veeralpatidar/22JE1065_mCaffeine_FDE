CREATE TABLE `history` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`remark` text NOT NULL,
	`time` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`po`) REFERENCES `pos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `users`(`username`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`vendor` text NOT NULL,
	`items` text NOT NULL,
	`total` integer NOT NULL,
	`pdf` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`operation` text,
	FOREIGN KEY (`owner`) REFERENCES `users`(`username`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pos_number_unique` ON `pos` (`number`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`digest` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`username`) REFERENCES `users`(`username`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`username` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`creator` integer NOT NULL,
	`approver` integer NOT NULL
);
