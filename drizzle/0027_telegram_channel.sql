CREATE TABLE "telegram_credentials" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "bot_id" text NOT NULL,
  "username" text NOT NULL,
  "token_cipher" text NOT NULL,
  "token_iv" text NOT NULL,
  "token_tag" text NOT NULL,
  "webhook_secret_cipher" text NOT NULL,
  "webhook_secret_iv" text NOT NULL,
  "webhook_secret_tag" text NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_credentials_org_uq" ON "telegram_credentials" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_credentials_bot_uq" ON "telegram_credentials" ("bot_id");
--> statement-breakpoint
CREATE TABLE "channel_preference" (
  "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "whatsapp_enabled" boolean DEFAULT true NOT NULL,
  "telegram_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
