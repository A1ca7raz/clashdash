import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type {
  GroupMembers,
  GroupOptions,
  GroupType,
  MihomoProxy,
  Processing,
  ProviderOptions,
  SubscriptionMode,
  UserInfo,
} from "@/lib/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  url: text("url").notNull(),
  userAgent: text("user_agent").notNull().default("clash.meta"),
  enabled: boolean("enabled").notNull().default(true),
  mode: text("mode").$type<SubscriptionMode>().notNull().default("inline"),
  processing: jsonb("processing").$type<Processing>().notNull().default({}),
  providerOptions: jsonb("provider_options").$type<ProviderOptions>().notNull().default({}),
  cacheTtl: integer("cache_ttl").notNull().default(3600),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastError: text("last_error"),
  userinfo: jsonb("userinfo").$type<UserInfo>(),
  nodeCount: integer("node_count").notNull().default(0),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
});

/** Raw parsed nodes; `name` is the upstream name before processing. Null subscription = manual node. */
export const nodes = pgTable(
  "nodes",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: jsonb("config").$type<MihomoProxy>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("nodes_subscription_idx").on(t.subscriptionId)],
);

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  token: text("token").notNull().unique(),
  baseConfig: text("base_config").notNull().default(""),
  subscriptionIds: jsonb("subscription_ids").$type<number[]>().notNull().default([]),
  manualNodeIds: jsonb("manual_node_ids").$type<number[]>().notNull().default([]),
  listenerIds: jsonb("listener_ids").$type<number[]>().notNull().default([]),
  updateInterval: integer("update_interval").notNull().default(24),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proxyGroups = pgTable(
  "proxy_groups",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<GroupType>().notNull().default("select"),
    options: jsonb("options").$type<GroupOptions>().notNull().default({}),
    members: jsonb("members")
      .$type<GroupMembers>()
      .notNull()
      .default({ items: [], sources: { all: false, subscriptions: [], manual: false } }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("proxy_groups_profile_name_idx").on(t.profileId, t.name)],
);

export const ruleProviders = pgTable("rule_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  behavior: text("behavior").notNull().default("domain"),
  format: text("format").notNull().default("mrs"),
  url: text("url").notNull(),
  interval: integer("interval").notNull().default(86400),
  createdAt: createdAt(),
});

/** `subRule` null means the main `rules`; otherwise the rule belongs to `sub-rules.<subRule>`. */
export const rules = pgTable(
  "rules",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    subRule: text("sub_rule"),
    type: text("type").notNull(),
    payload: text("payload").notNull().default(""),
    target: text("target").notNull(),
    noResolve: boolean("no_resolve").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    remark: text("remark"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("rules_profile_idx").on(t.profileId, t.subRule)],
);

/**
 * Reusable across profiles (selected via `profiles.listenerIds`). `proxy` / `subRule` name a group or
 * sub-rule set and are resolved per profile at generation time; both null means the main rules.
 */
export const listeners = pgTable("listeners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull(),
  listen: text("listen").notNull().default("0.0.0.0"),
  port: integer("port"),
  proxy: text("proxy"),
  subRule: text("sub_rule"),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type Node = typeof nodes.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type ProxyGroup = typeof proxyGroups.$inferSelect;
export type RuleProvider = typeof ruleProviders.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type Listener = typeof listeners.$inferSelect;
