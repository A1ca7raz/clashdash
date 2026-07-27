export const postgresSchema = `
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  totp_secret_encrypted TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

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
  user_agent TEXT,
  headers_json JSONB,
  override_json JSONB,
  config_json JSONB,
  CHECK (
    (type = 'passthrough' AND subscription_format IS NULL AND config_json IS NOT NULL) OR
    (type = 'import' AND subscription_format IS NOT NULL AND config_json IS NULL)
  )
);

ALTER TABLE providers ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS headers_json JSONB;

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('userdefined', 'provider')),
  name TEXT NOT NULL,
  tags_json JSONB NOT NULL,
  proxy_json JSONB NOT NULL,
  listener_template_json JSONB,
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
  rules_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  config_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tags_json JSONB NOT NULL,
  note TEXT,
  general_config_json JSONB NOT NULL,
  selected_node_ids_json JSONB NOT NULL,
  listeners_json JSONB NOT NULL,
  proxy_groups_json JSONB NOT NULL,
  rule_entries_json JSONB NOT NULL,
  rule_provider_ids_json JSONB NOT NULL,
  passthrough_provider_ids_json JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  update_time BIGINT NOT NULL DEFAULT (FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::BIGINT) CHECK (update_time >= 0)
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rule_provider_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS update_time BIGINT NOT NULL DEFAULT (FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::BIGINT);

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
