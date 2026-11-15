ALTER TABLE "message" DROP CONSTRAINT "message_wa_message_id_unique";--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "app_secret_cipher" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "app_secret_iv" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "app_secret_tag" text;--> statement-breakpoint
CREATE UNIQUE INDEX "message_org_wa_message_uq" ON "message" USING btree ("organization_id","wa_message_id");