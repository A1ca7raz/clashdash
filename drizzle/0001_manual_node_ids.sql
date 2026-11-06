ALTER TABLE "profiles" ADD COLUMN "manual_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "include_manual_nodes";
