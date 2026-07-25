export const sqliteSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  totp_secret_encrypted TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('passthrough', 'import')),
  name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  interval INTEGER NOT NULL CHECK (interval > 0),
  subscription_format TEXT,
  filter TEXT,
  exclude_filter TEXT,
  exclude_type TEXT,
  override_json TEXT,
  config_json TEXT,
  CHECK (
    (type = 'passthrough' AND subscription_format IS NULL AND config_json IS NOT NULL) OR
    (type = 'import' AND subscription_format IS NOT NULL AND config_json IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('userdefined', 'provider')),
  name TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  proxy_json TEXT NOT NULL,
  listener_template_json TEXT,
  provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
  upstream_key TEXT,
  CHECK (
    (type = 'userdefined' AND provider_id IS NULL AND upstream_key IS NULL) OR
    (type = 'provider' AND provider_id IS NOT NULL AND upstream_key IS NOT NULL AND listener_template_json IS NULL)
  ),
  UNIQUE (provider_id, upstream_key)
);

CREATE TABLE IF NOT EXISTS rule_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rules_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  note TEXT,
  general_config_json TEXT NOT NULL,
  selected_node_ids_json TEXT NOT NULL,
  listeners_json TEXT NOT NULL,
  proxy_groups_json TEXT NOT NULL,
  rule_entries_json TEXT NOT NULL,
  rule_provider_ids_json TEXT NOT NULL,
  passthrough_provider_ids_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_tokens (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS nodes_provider_id_idx ON nodes(provider_id);
CREATE INDEX IF NOT EXISTS subscription_tokens_profile_id_idx ON subscription_tokens(profile_id);
`
