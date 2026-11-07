ALTER TABLE "rule_providers" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_providers" ADD COLUMN "type" text DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_providers" ADD COLUMN "payload" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_providers" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;