CREATE TABLE "listeners" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"listen" text DEFAULT '0.0.0.0' NOT NULL,
	"port" integer,
	"proxy" text,
	"sub_rule" text,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"base_config" text DEFAULT '' NOT NULL,
	"subscription_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_manual_nodes" boolean DEFAULT true NOT NULL,
	"update_interval" integer DEFAULT 24 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_name_unique" UNIQUE("name"),
	CONSTRAINT "profiles_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "proxy_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'select' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"members" jsonb DEFAULT '{"items":[],"sources":{"all":false,"subscriptions":[],"manual":false}}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"behavior" text DEFAULT 'domain' NOT NULL,
	"format" text DEFAULT 'mrs' NOT NULL,
	"url" text NOT NULL,
	"interval" integer DEFAULT 86400 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"sub_rule" text,
	"type" text NOT NULL,
	"payload" text DEFAULT '' NOT NULL,
	"target" text NOT NULL,
	"no_resolve" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"remark" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"user_agent" text DEFAULT 'clash.meta' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" text DEFAULT 'inline' NOT NULL,
	"processing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cache_ttl" integer DEFAULT 3600 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"userinfo" jsonb,
	"node_count" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "listeners" ADD CONSTRAINT "listeners_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_groups" ADD CONSTRAINT "proxy_groups_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listeners_profile_name_idx" ON "listeners" USING btree ("profile_id","name");--> statement-breakpoint
CREATE INDEX "nodes_subscription_idx" ON "nodes" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proxy_groups_profile_name_idx" ON "proxy_groups" USING btree ("profile_id","name");--> statement-breakpoint
CREATE INDEX "rules_profile_idx" ON "rules" USING btree ("profile_id","sub_rule");