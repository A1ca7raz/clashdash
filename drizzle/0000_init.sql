CREATE TABLE "admin_auth" (
	"id" integer PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"auth_version" integer DEFAULT 1 NOT NULL,
	"totp_secret" text,
	"totp_pending_secret" text,
	"totp_last_counter" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listeners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"listen" text DEFAULT '0.0.0.0' NOT NULL,
	"port" integer,
	"proxy" text,
	"sub_rule" text,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"yaml" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listeners_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"yaml" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pointer_references" (
	"pointer_id" integer NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" integer NOT NULL,
	CONSTRAINT "pointer_references_pointer_id_resource_type_resource_id_pk" PRIMARY KEY("pointer_id","resource_type","resource_id")
);
--> statement-breakpoint
CREATE TABLE "pointers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pointers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "profile_listeners" (
	"profile_id" integer NOT NULL,
	"listener_id" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "profile_listeners_profile_id_listener_id_pk" PRIMARY KEY("profile_id","listener_id")
);
--> statement-breakpoint
CREATE TABLE "profile_manual_nodes" (
	"profile_id" integer NOT NULL,
	"node_id" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "profile_manual_nodes_profile_id_node_id_pk" PRIMARY KEY("profile_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "profile_subscriptions" (
	"profile_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "profile_subscriptions_profile_id_subscription_id_pk" PRIMARY KEY("profile_id","subscription_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"base_config" text DEFAULT '' NOT NULL,
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
	"yaml" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'http' NOT NULL,
	"behavior" text DEFAULT 'domain' NOT NULL,
	"format" text DEFAULT 'mrs' NOT NULL,
	"url" text,
	"interval" integer DEFAULT 86400 NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"yaml" text,
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
	"yaml" text,
	"user_agent" text DEFAULT 'clash.meta' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" text DEFAULT 'inline' NOT NULL,
	"processing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cache_ttl" integer DEFAULT 3600 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	"refreshing_at" timestamp with time zone,
	"last_error" text,
	"userinfo" jsonb,
	"node_count" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointer_references" ADD CONSTRAINT "pointer_references_pointer_id_pointers_id_fk" FOREIGN KEY ("pointer_id") REFERENCES "public"."pointers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_listeners" ADD CONSTRAINT "profile_listeners_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_listeners" ADD CONSTRAINT "profile_listeners_listener_id_listeners_id_fk" FOREIGN KEY ("listener_id") REFERENCES "public"."listeners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_manual_nodes" ADD CONSTRAINT "profile_manual_nodes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_manual_nodes" ADD CONSTRAINT "profile_manual_nodes_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_subscriptions" ADD CONSTRAINT "profile_subscriptions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_subscriptions" ADD CONSTRAINT "profile_subscriptions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_groups" ADD CONSTRAINT "proxy_groups_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nodes_subscription_idx" ON "nodes" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "profile_listeners_listener_idx" ON "profile_listeners" USING btree ("listener_id");--> statement-breakpoint
CREATE INDEX "profile_manual_nodes_node_idx" ON "profile_manual_nodes" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "profile_subscriptions_subscription_idx" ON "profile_subscriptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proxy_groups_profile_name_idx" ON "proxy_groups" USING btree ("profile_id","name");--> statement-breakpoint
CREATE INDEX "rules_profile_idx" ON "rules" USING btree ("profile_id","sub_rule");
