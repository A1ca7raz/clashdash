import postgres from 'postgres'

import { ConflictError, NotFoundError, ValidationError } from '../../../application/errors.ts'
import type {
  AppStore,
  ProviderNodeState,
  StoredSubscriptionToken,
} from '../../../application/ports/app-store.ts'
import type { Node, UserDefinedNode } from '../../../domain/models/node.ts'
import type { MissingProfileReference, Profile, ResolvedProfile } from '../../../domain/models/profile.ts'
import type { ProxyProvider } from '../../../domain/models/provider.ts'
import type { RuleProvider } from '../../../domain/models/rule-provider.ts'
import type { RulePack } from '../../../domain/models/rule.ts'
import { referencesRuleProvider, rewriteRuleProviderReference } from '../../../domain/rules/rule-provider-reference.ts'
import type { User } from '../../../domain/models/user.ts'
import { migratePostgres } from './migrations.ts'
import {
  postgresRowToNode,
  postgresRowToProvider,
  profileToPostgresRow,
  providerNodeToPostgresRow,
  providerToPostgresRow,
  resolvePostgresProfileRow,
  userDefinedNodeToPostgresRow,
  type PostgresNodeRow,
  type PostgresProfileRow,
  type PostgresProviderRow,
  type PostgresRulePackRow,
} from './mappers.ts'

type UserRow = {
  username: string
  password_hash: string
  totp_secret_encrypted: string | null
  totp_enabled: boolean
}
type TokenRow = {
  id: string
  profile_id: string
  note: string | null
  token_hash: string
  encrypted_token: string
}
type RuleProviderRow = { id: string; name: string; config_json: RuleProvider['config'] }
type Queryable = postgres.Sql | postgres.TransactionSql

export type PostgresStoreOptions = {
  max?: number
  prepare?: boolean
}

export class PostgresStore implements AppStore {
  readonly sql: postgres.Sql

  constructor(connectionString: string, options: PostgresStoreOptions = {}) {
    this.sql = postgres(connectionString, {
      max: options.max ?? 1,
      prepare: options.prepare ?? true,
      onnotice: () => undefined,
    })
  }

  static async open(connectionString: string, options: PostgresStoreOptions = {}): Promise<PostgresStore> {
    const store = new PostgresStore(connectionString, options)
    await store.migrate()
    return store
  }

  async migrate(): Promise<void> { await migratePostgres(this.sql) }

  async getUser(): Promise<User | undefined> {
    const [row] = await this.sql<UserRow[]>`SELECT * FROM users LIMIT 1`
    return row ? {
      username: row.username,
      passwordHash: row.password_hash,
      totpEnabled: row.totp_enabled,
      ...(row.totp_secret_encrypted === null ? {} : { totpSecretEncrypted: row.totp_secret_encrypted }),
    } : undefined
  }

  async initializeUser(user: User): Promise<boolean> {
    return this.sql.begin(async (sql) => {
      await sql`LOCK TABLE users IN EXCLUSIVE MODE`
      const rows = await sql<{ username: string }[]>`
        INSERT INTO users (username, password_hash, totp_secret_encrypted, totp_enabled)
        SELECT ${user.username}, ${user.passwordHash}, ${user.totpSecretEncrypted ?? null}, ${user.totpEnabled}
        WHERE NOT EXISTS (SELECT 1 FROM users)
        RETURNING username
      `
      return rows.length === 1
    })
  }

  async saveUser(user: User): Promise<void> {
    const result = await this.sql`
      UPDATE users SET password_hash = ${user.passwordHash},
        totp_secret_encrypted = ${user.totpSecretEncrypted ?? null}, totp_enabled = ${user.totpEnabled}
      WHERE username = ${user.username}
    `
    if (result.count !== 1) throw new NotFoundError(`User not found: ${user.username}`)
  }

  async listNodes(): Promise<Node[]> {
    const [rows, providers] = await Promise.all([
      this.sql<PostgresNodeRow[]>`SELECT * FROM nodes ORDER BY id`,
      this.listProviders(),
    ])
    const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
    return rows.map((row) => postgresRowToNode(row, row.provider_id ? providerMap.get(row.provider_id) : undefined))
  }

  async getNode(id: string): Promise<Node | undefined> {
    const [row] = await this.sql<PostgresNodeRow[]>`SELECT * FROM nodes WHERE id = ${id}`
    if (!row) return undefined
    return postgresRowToNode(row, row.provider_id ? await this.getProvider(row.provider_id) : undefined)
  }

  async saveUserDefinedNode(node: UserDefinedNode): Promise<void> {
    const [existing] = await this.sql<{ type: string }[]>`SELECT type FROM nodes WHERE id = ${node.id}`
    if (existing && existing.type !== 'userdefined') throw new ConflictError(`Node ${node.id} is provider-managed`)
    await this.withConflict(() => writeNode(this.sql, userDefinedNodeToPostgresRow(node)))
  }

  async deleteUserDefinedNode(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM nodes WHERE id = ${id} AND type = 'userdefined'`
    return result.count === 1
  }

  async listProviders(): Promise<ProxyProvider[]> {
    const rows = await this.sql<PostgresProviderRow[]>`SELECT * FROM providers ORDER BY id`
    return rows.map(postgresRowToProvider)
  }

  async getProvider(id: string): Promise<ProxyProvider | undefined> {
    const [row] = await this.sql<PostgresProviderRow[]>`SELECT * FROM providers WHERE id = ${id}`
    return row ? postgresRowToProvider(row) : undefined
  }

  async saveProvider(provider: ProxyProvider): Promise<void> {
    const row = providerToPostgresRow(provider)
    await this.withConflict(() => this.sql.begin(async (sql) => {
      await sql`
        INSERT INTO providers (
          id, type, name, url, interval, subscription_format, filter, exclude_filter,
          exclude_type, override_json, config_json
        ) VALUES (
          ${row.id}, ${row.type}, ${row.name}, ${row.url}, ${row.interval},
          ${row.subscription_format}, ${row.filter}, ${row.exclude_filter}, ${row.exclude_type},
          ${jsonOrNull(sql, row.override_json)}, ${jsonOrNull(sql, row.config_json)}
        ) ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type, name = EXCLUDED.name, url = EXCLUDED.url,
          interval = EXCLUDED.interval, subscription_format = EXCLUDED.subscription_format,
          filter = EXCLUDED.filter, exclude_filter = EXCLUDED.exclude_filter,
          exclude_type = EXCLUDED.exclude_type, override_json = EXCLUDED.override_json,
          config_json = EXCLUDED.config_json
      `
      if (provider.type === 'passthrough') await sql`DELETE FROM nodes WHERE provider_id = ${provider.id}`
    }))
  }

  async deleteProvider(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM providers WHERE id = ${id}`
    return result.count === 1
  }

  async listProviderNodeStates(providerId: string): Promise<ProviderNodeState[]> {
    const provider = await this.getProvider(providerId)
    if (provider?.type !== 'import') return []
    const rows = await this.sql<PostgresNodeRow[]>`
      SELECT * FROM nodes WHERE provider_id = ${providerId} AND type = 'provider' ORDER BY id
    `
    return rows.map((row) => {
      if (row.upstream_key === null) throw new Error(`Provider node ${row.id} has no upstream key`)
      const node = postgresRowToNode(row, provider)
      if (node.type !== 'provider') throw new Error(`Node ${row.id} is not provider-managed`)
      return { node, upstreamKey: row.upstream_key }
    })
  }

  async replaceProviderNodes(providerId: string, nodes: readonly ProviderNodeState[]): Promise<void> {
    await this.withConflict(() => this.sql.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${providerId}))`
      const [providerRow] = await sql<PostgresProviderRow[]>`
        SELECT * FROM providers WHERE id = ${providerId} AND type = 'import' FOR UPDATE
      `
      if (!providerRow) throw new NotFoundError(`Import provider not found: ${providerId}`)
      for (const state of nodes) {
        if (state.node.provider.id !== providerId) {
          throw new ValidationError(`Provider node ${state.node.id} belongs to another provider`)
        }
      }
      await sql`DELETE FROM nodes WHERE provider_id = ${providerId} AND type = 'provider'`
      for (const state of nodes) await writeNode(sql, providerNodeToPostgresRow(state.node, state.upstreamKey))
    }))
  }

  async listRulePacks(): Promise<RulePack[]> {
    const rows = await this.sql<PostgresRulePackRow[]>`SELECT * FROM rule_packs ORDER BY id`
    return rows.map(rowToRulePack)
  }

  async getRulePack(id: string): Promise<RulePack | undefined> {
    const [row] = await this.sql<PostgresRulePackRow[]>`SELECT * FROM rule_packs WHERE id = ${id}`
    return row ? rowToRulePack(row) : undefined
  }

  async saveRulePack(rulePack: RulePack): Promise<void> {
    await this.withConflict(async () => {
      await this.sql`
        INSERT INTO rule_packs (id, name, rules_json)
        VALUES (${rulePack.id}, ${rulePack.name}, ${this.sql.json(rulePack.rules)})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, rules_json = EXCLUDED.rules_json
      `
    })
  }

  async deleteRulePack(id: string): Promise<boolean> {
    const references = await this.profileIdsReferencingRulePack(id)
    if (references.length > 0) throw new ConflictError(`RulePack ${id} is used by Profile ${references.join(', ')}`)
    const result = await this.sql`DELETE FROM rule_packs WHERE id = ${id}`
    return result.count === 1
  }

  async listRuleProviders(): Promise<RuleProvider[]> {
    const rows = await this.sql<RuleProviderRow[]>`SELECT * FROM rule_providers ORDER BY id`
    return rows.map(rowToRuleProvider)
  }

  async getRuleProvider(id: string): Promise<RuleProvider | undefined> {
    const [row] = await this.sql<RuleProviderRow[]>`SELECT * FROM rule_providers WHERE id = ${id}`
    return row ? rowToRuleProvider(row) : undefined
  }

  async saveRuleProvider(ruleProvider: RuleProvider, previousName?: string): Promise<void> {
    await this.withConflict(() => this.sql.begin(async (sql) => {
      const [existing] = await sql<RuleProviderRow[]>`
        SELECT * FROM rule_providers WHERE id = ${ruleProvider.id} FOR UPDATE
      `
      await sql`
        INSERT INTO rule_providers (id, name, config_json)
        VALUES (${ruleProvider.id}, ${ruleProvider.name}, ${sql.json(ruleProvider.config)})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, config_json = EXCLUDED.config_json
      `
      const oldName = existing?.name ?? previousName
      if (!oldName || oldName === ruleProvider.name) return

      const rulePacks = await sql<PostgresRulePackRow[]>`SELECT * FROM rule_packs ORDER BY id FOR UPDATE`
      for (const row of rulePacks) {
        if (!row.rules_json.some((rule) => referencesRuleProvider(rule, oldName))) continue
        const rules = row.rules_json.map((rule) => rewriteRuleProviderReference(rule, oldName, ruleProvider.name))
        await sql`UPDATE rule_packs SET rules_json = ${sql.json(rules)} WHERE id = ${row.id}`
      }

      const profiles = await sql<PostgresProfileRow[]>`SELECT * FROM profiles ORDER BY id FOR UPDATE`
      for (const row of profiles) {
        const ruleEntries = row.rule_entries_json as Array<{ type: string; rule?: RulePack['rules'][number] }>
        const selected = row.rule_provider_ids_json as Array<{ id: string; displayName?: string }>
        const rulesChanged = ruleEntries.some((entry) => entry.type === 'rule' && entry.rule !== undefined
          && referencesRuleProvider(entry.rule, oldName))
        const selectionChanged = selected.some((entry) => entry.id === ruleProvider.id
          && entry.displayName !== ruleProvider.name)
        if (!rulesChanged && !selectionChanged) continue
        const rewrittenEntries = ruleEntries.map((entry) => entry.type === 'rule' && entry.rule !== undefined
          ? { ...entry, rule: rewriteRuleProviderReference(entry.rule, oldName, ruleProvider.name) }
          : entry)
        const rewrittenSelected = selected.map((entry) => entry.id === ruleProvider.id
          ? { ...entry, displayName: ruleProvider.name }
          : entry)
        await sql`
          UPDATE profiles SET rule_entries_json = ${sql.json(rewrittenEntries)},
            rule_provider_ids_json = ${sql.json(rewrittenSelected)}
          WHERE id = ${row.id}
        `
      }
    }))
  }

  async deleteRuleProvider(id: string): Promise<boolean> {
    return this.sql.begin(async (sql) => {
      const [provider] = await sql<RuleProviderRow[]>`SELECT * FROM rule_providers WHERE id = ${id} FOR UPDATE`
      if (!provider) return false
      const [profiles, rulePacks] = await Promise.all([
        sql<PostgresProfileRow[]>`SELECT * FROM profiles ORDER BY id FOR UPDATE`,
        sql<PostgresRulePackRow[]>`SELECT * FROM rule_packs ORDER BY id FOR UPDATE`,
      ])
      const profileIds = profiles.filter((row) => {
        const selected = row.rule_provider_ids_json as Array<{ id: string }>
        const entries = row.rule_entries_json as Array<{ type: string; rule?: RulePack['rules'][number] }>
        return selected.some((entry) => entry.id === id)
          || entries.some((entry) => entry.type === 'rule' && entry.rule !== undefined
            && referencesRuleProvider(entry.rule, provider.name))
      }).map((row) => row.id)
      const rulePackIds = rulePacks.filter((row) => row.rules_json
        .some((rule) => referencesRuleProvider(rule, provider.name))).map((row) => row.id)
      if (profileIds.length > 0 || rulePackIds.length > 0) {
        throw new ConflictError(
          `Rule Provider ${id} is referenced by ${[...profileIds.map((value) => `Profile ${value}`), ...rulePackIds.map((value) => `RulePack ${value}`)].join(', ')}`,
        )
      }
      const result = await sql`DELETE FROM rule_providers WHERE id = ${id}`
      return result.count === 1
    })
  }

  async listProfiles(): Promise<ResolvedProfile[]> {
    const [rows, nodes, providers, rulePacks, ruleProviders] = await Promise.all([
      this.sql<PostgresProfileRow[]>`SELECT * FROM profiles ORDER BY id`,
      this.listNodes(), this.listProviders(), this.listRulePacks(), this.listRuleProviders(),
    ])
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
    const rulePackMap = new Map(rulePacks.map((rulePack) => [rulePack.id, rulePack]))
    const ruleProviderMap = new Map(ruleProviders.map((provider) => [provider.id, provider]))
    const profiles = rows.map((row) =>
      resolvePostgresProfileRow(row, nodeMap, providerMap, rulePackMap, ruleProviderMap))
    return Promise.all(profiles.map((profile) => this.removeMissingProfileReferences(profile)))
  }

  async getProfile(id: string): Promise<ResolvedProfile | undefined> {
    const [row] = await this.sql<PostgresProfileRow[]>`SELECT * FROM profiles WHERE id = ${id}`
    if (!row) return undefined
    const [nodes, providers, rulePacks, ruleProviders] = await Promise.all([
      this.listNodes(), this.listProviders(), this.listRulePacks(), this.listRuleProviders(),
    ])
    return this.removeMissingProfileReferences(resolvePostgresProfileRow(
      row,
      new Map(nodes.map((node) => [node.id, node])),
      new Map(providers.map((provider) => [provider.id, provider])),
      new Map(rulePacks.map((rulePack) => [rulePack.id, rulePack])),
      new Map(ruleProviders.map((provider) => [provider.id, provider])),
    ))
  }

  private async removeMissingProfileReferences(value: ResolvedProfile): Promise<ResolvedProfile> {
    if (value.missingReferences.length === 0) return value
    await this.saveProfile(value.profile)
    return { profile: value.profile, missingReferences: [] }
  }

  async saveProfile(profile: Profile, missingReferences: readonly MissingProfileReference[] = []): Promise<void> {
    const row = profileToPostgresRow(profile, missingReferences)
    await this.sql`
      INSERT INTO profiles (
        id, name, tags_json, note, general_config_json, selected_node_ids_json,
        listeners_json, proxy_groups_json, rule_entries_json, passthrough_provider_ids_json
        , rule_provider_ids_json
      ) VALUES (
        ${row.id}, ${row.name}, ${this.sql.json(row.tags_json)}, ${row.note},
        ${this.sql.json(row.general_config_json)}, ${this.sql.json(row.selected_node_ids_json)},
        ${this.sql.json(row.listeners_json)}, ${this.sql.json(row.proxy_groups_json)},
        ${this.sql.json(row.rule_entries_json)}, ${this.sql.json(row.passthrough_provider_ids_json)},
        ${this.sql.json(row.rule_provider_ids_json)}
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, tags_json = EXCLUDED.tags_json, note = EXCLUDED.note,
        general_config_json = EXCLUDED.general_config_json,
        selected_node_ids_json = EXCLUDED.selected_node_ids_json,
        listeners_json = EXCLUDED.listeners_json, proxy_groups_json = EXCLUDED.proxy_groups_json,
        rule_entries_json = EXCLUDED.rule_entries_json,
        rule_provider_ids_json = EXCLUDED.rule_provider_ids_json,
        passthrough_provider_ids_json = EXCLUDED.passthrough_provider_ids_json
    `
  }

  async deleteProfile(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM profiles WHERE id = ${id}`
    return result.count === 1
  }

  async profileIdsReferencingNode(nodeId: string): Promise<string[]> {
    return this.findProfileReferences((row) => {
      const selected = row.selected_node_ids_json as Array<{ id: string }>
      const listeners = row.listeners_json as Array<{ type: string; node?: { id: string } }>
      return selected.some((entry) => entry.id === nodeId)
        || listeners.some((entry) => entry.type === 'derived' && entry.node?.id === nodeId)
    })
  }

  async profileIdsReferencingProvider(providerId: string): Promise<string[]> {
    return this.findProfileReferences((row) =>
      (row.passthrough_provider_ids_json as Array<{ id: string }>).some((entry) => entry.id === providerId),
    )
  }

  async profileIdsReferencingRulePack(rulePackId: string): Promise<string[]> {
    return this.findProfileReferences((row) =>
      (row.rule_entries_json as Array<{ type: string; rulePack?: { id: string } }>).some(
        (entry) => entry.type === 'rulePack' && entry.rulePack?.id === rulePackId,
      ),
    )
  }

  async listSubscriptionTokens(profileId?: string): Promise<StoredSubscriptionToken[]> {
    const rows = profileId === undefined
      ? await this.sql<TokenRow[]>`SELECT * FROM subscription_tokens ORDER BY id`
      : await this.sql<TokenRow[]>`SELECT * FROM subscription_tokens WHERE profile_id = ${profileId} ORDER BY id`
    return rows.map(rowToToken)
  }

  async getSubscriptionTokenById(id: string): Promise<StoredSubscriptionToken | undefined> {
    const [row] = await this.sql<TokenRow[]>`SELECT * FROM subscription_tokens WHERE id = ${id}`
    return row ? rowToToken(row) : undefined
  }

  async getSubscriptionTokenByHash(tokenHash: string): Promise<StoredSubscriptionToken | undefined> {
    const [row] = await this.sql<TokenRow[]>`SELECT * FROM subscription_tokens WHERE token_hash = ${tokenHash}`
    return row ? rowToToken(row) : undefined
  }

  async saveSubscriptionToken(token: StoredSubscriptionToken): Promise<void> {
    await this.withConflict(async () => {
      await this.sql`
        INSERT INTO subscription_tokens (id, profile_id, note, token_hash, encrypted_token)
        VALUES (${token.id}, ${token.profileId}, ${token.note ?? null}, ${token.tokenHash}, ${token.encryptedToken})
        ON CONFLICT (id) DO UPDATE SET profile_id = EXCLUDED.profile_id, note = EXCLUDED.note,
          token_hash = EXCLUDED.token_hash, encrypted_token = EXCLUDED.encrypted_token
      `
    })
  }

  async deleteSubscriptionToken(id: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM subscription_tokens WHERE id = ${id}`
    return result.count === 1
  }

  async close(): Promise<void> { await this.sql.end({ timeout: 5 }) }

  private async findProfileReferences(predicate: (row: PostgresProfileRow) => boolean): Promise<string[]> {
    const rows = await this.sql<PostgresProfileRow[]>`SELECT * FROM profiles ORDER BY id`
    return rows.filter(predicate).map((row) => row.id)
  }

  private async withConflict<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation() }
    catch (cause) {
      if (isPostgresCode(cause, '23505')) throw new ConflictError(cause.message)
      throw cause
    }
  }
}

async function writeNode(sql: Queryable, row: PostgresNodeRow): Promise<void> {
  await sql`
    INSERT INTO nodes (
      id, type, name, tags_json, proxy_json, listener_template_json, provider_id, upstream_key
    ) VALUES (
      ${row.id}, ${row.type}, ${row.name}, ${sql.json(row.tags_json)}, ${sql.json(row.proxy_json)},
      ${jsonOrNull(sql, row.listener_template_json)}, ${row.provider_id}, ${row.upstream_key}
    ) ON CONFLICT (id) DO UPDATE SET
      type = EXCLUDED.type, name = EXCLUDED.name, tags_json = EXCLUDED.tags_json,
      proxy_json = EXCLUDED.proxy_json, listener_template_json = EXCLUDED.listener_template_json,
      provider_id = EXCLUDED.provider_id, upstream_key = EXCLUDED.upstream_key
  `
}

function jsonOrNull(sql: Queryable, value: object | null) {
  return value === null ? null : sql.json(value as postgres.JSONValue)
}

function rowToRulePack(row: PostgresRulePackRow): RulePack {
  return { id: row.id, name: row.name, rules: structuredClone(row.rules_json) }
}

function rowToRuleProvider(row: RuleProviderRow): RuleProvider {
  return { id: row.id, name: row.name, config: structuredClone(row.config_json) }
}

function rowToToken(row: TokenRow): StoredSubscriptionToken {
  return {
    id: row.id, profileId: row.profile_id,
    ...(row.note === null ? {} : { note: row.note }),
    tokenHash: row.token_hash, encryptedToken: row.encrypted_token,
  }
}

function isPostgresCode(cause: unknown, code: string): cause is Error & { code: string } {
  return cause instanceof Error && 'code' in cause && cause.code === code
}
