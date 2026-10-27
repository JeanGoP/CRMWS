ALTER TABLE "booking" ADD COLUMN "reminder_attempted_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "reminder_error" text;--> statement-breakpoint
ALTER TABLE "calendar_settings" ADD COLUMN "privacy_notice_url" text;--> statement-breakpoint
ALTER TABLE "calendar_settings" ADD COLUMN "reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_settings" ADD COLUMN "reminder_template_id" text;
