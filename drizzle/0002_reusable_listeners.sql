ALTER TABLE "listeners" DROP CONSTRAINT "listeners_profile_id_profiles_id_fk";
--> statement-breakpoint
DROP INDEX "listeners_profile_name_idx";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "listener_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "profiles" p SET "listener_ids" = COALESCE(
  (SELECT jsonb_agg(l."id" ORDER BY l."sort", l."id") FROM "listeners" l WHERE l."profile_id" = p."id"),
  '[]'::jsonb
);--> statement-breakpoint
UPDATE "listeners" l SET "name" = l."name" || '-' || l."id"
WHERE EXISTS (SELECT 1 FROM "listeners" o WHERE o."name" = l."name" AND o."id" < l."id");--> statement-breakpoint
ALTER TABLE "listeners" DROP COLUMN "profile_id";--> statement-breakpoint
ALTER TABLE "listeners" ADD CONSTRAINT "listeners_name_unique" UNIQUE("name");
