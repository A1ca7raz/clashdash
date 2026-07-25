CREATE TABLE rule_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL
);
ALTER TABLE profiles ADD COLUMN rule_provider_ids_json TEXT NOT NULL DEFAULT '[]';
