CREATE TABLE "cartera_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"api_url" text,
	"token_cipher" text,
	"token_iv" text,
	"token_tag" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cartera_settings" ADD CONSTRAINT "cartera_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;