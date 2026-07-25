PRAGMA foreign_keys = ON;

CREATE TABLE users (
  username TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
  totp_secret_encrypted TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1))
);
CREATE TABLE providers (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('passthrough', 'import')),
  name TEXT NOT NULL UNIQUE, url TEXT NOT NULL, interval INTEGER NOT NULL CHECK (interval > 0),
  subscription_format TEXT, filter TEXT, exclude_filter TEXT, exclude_type TEXT,
  override_json TEXT, config_json TEXT
);
CREATE TABLE nodes (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('userdefined', 'provider')),
  name TEXT NOT NULL, tags_json TEXT NOT NULL, proxy_json TEXT NOT NULL,
  listener_template_json TEXT, provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
  upstream_key TEXT, UNIQUE (provider_id, upstream_key)
);
CREATE TABLE rule_packs (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, rules_json TEXT NOT NULL);
CREATE TABLE profiles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tags_json TEXT NOT NULL, note TEXT,
  general_config_json TEXT NOT NULL, selected_node_ids_json TEXT NOT NULL,
  listeners_json TEXT NOT NULL, proxy_groups_json TEXT NOT NULL,
  rule_entries_json TEXT NOT NULL, passthrough_provider_ids_json TEXT NOT NULL
);
CREATE TABLE subscription_tokens (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note TEXT, token_hash TEXT NOT NULL UNIQUE, encrypted_token TEXT NOT NULL
);
