CREATE TABLE `provider_credentials` (
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`last_four` text NOT NULL,
	`models` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `conversation_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`chat_id` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
