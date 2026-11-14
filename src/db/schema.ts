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
  primaryKey,
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
  yaml: text("yaml"),
  userAgent: text("user_agent").notNull().default("clash.meta"),
  enabled: boolean("enabled").notNull().default(true),
  mode: text("mode").$type<SubscriptionMode>().notNull().default("inline"),
  processing: jsonb("processing").$type<Processing>().notNull().default({}),
  providerOptions: jsonb("provider_options").$type<ProviderOptions>().notNull().default({}),
  cacheTtl: integer("cache_ttl").notNull().default(3600),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  refreshingAt: timestamp("refreshing_at", { withTimezone: true }),
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
    yaml: text("yaml"),
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
  updateInterval: integer("update_interval").notNull().default(24),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pointers = pgTable("pointers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  value: jsonb("value").$type<string>().notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PointerResourceType = "profile" | "node" | "listener" | "group" | "subscription" | "ruleProvider";

export const pointerReferences = pgTable(
  "pointer_references",
  {
    pointerId: integer("pointer_id")
      .notNull()
      .references(() => pointers.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").$type<PointerResourceType>().notNull(),
    resourceId: integer("resource_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pointerId, t.resourceType, t.resourceId] })],
);

export const profileSubscriptions = pgTable(
  "profile_subscriptions",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.subscriptionId] }),
    index("profile_subscriptions_subscription_idx").on(t.subscriptionId),
  ],
);

export const profileManualNodes = pgTable(
  "profile_manual_nodes",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.nodeId] }), index("profile_manual_nodes_node_idx").on(t.nodeId)],
);

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
    yaml: text("yaml"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("proxy_groups_profile_name_idx").on(t.profileId, t.name)],
);

export const ruleProviders = pgTable("rule_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull().default("http"),
  behavior: text("behavior").notNull().default("domain"),
  format: text("format").notNull().default("mrs"),
  url: text("url"),
  interval: integer("interval").notNull().default(86400),
  payload: jsonb("payload").$type<string[]>().notNull().default([]),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  yaml: text("yaml"),
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
 * Reusable across profiles via `profile_listeners`. `proxy` / `subRule` name a group or sub-rule set
 * and are resolved per profile at generation time; both null means the main rules.
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
  yaml: text("yaml"),
  enabled: boolean("enabled").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

export const profileListeners = pgTable(
  "profile_listeners",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    listenerId: integer("listener_id")
      .notNull()
      .references(() => listeners.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.listenerId] }), index("profile_listeners_listener_idx").on(t.listenerId)],
);

export const adminAuth = pgTable("admin_auth", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  authVersion: integer("auth_version").notNull().default(1),
  totpSecret: text("totp_secret"),
  totpPendingSecret: text("totp_pending_secret"),
  totpLastCounter: integer("totp_last_counter"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type Node = typeof nodes.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type ProxyGroup = typeof proxyGroups.$inferSelect;
export type RuleProvider = typeof ruleProviders.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type Listener = typeof listeners.$inferSelect;
export type Pointer = typeof pointers.$inferSelect;
export type PointerReference = typeof pointerReferences.$inferSelect;
export type AdminAuth = typeof adminAuth.$inferSelect;
