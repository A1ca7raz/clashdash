import Database from 'better-sqlite3'

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
import { migrateSqlite } from './migrations.ts'
import {
  decodeJson,
  encodeJson,
  profileToRow,
  providerNodeToRow,
  providerToRow,
  resolveProfileRow,
  rowToNode,
  rowToProvider,
  userDefinedNodeToRow,
  type NodeRow,
  type ProfileRow,
  type ProviderRow,
} from './mappers.ts'

type UserRow = {
  username: string
  password_hash: string
  totp_secret_encrypted: string | null
  totp_enabled: 0 | 1
}
type RulePackRow = { id: string; name: string; rules_json: string }
type RuleProviderRow = { id: string; name: string; config_json: string }
type SubscriptionTokenRow = {
  id: string
  profile_id: string
  note: string | null
  token_hash: string
  encrypted_token: string
}

export class SqliteStore implements AppStore {
  readonly database: Database.Database

  constructor(filename = ':memory:') {
    this.database = new Database(filename)
    migrateSqlite(this.database)
  }

  getUser(): User | undefined {
    const row = this.database.prepare('SELECT * FROM users LIMIT 1').get() as UserRow | undefined
    return row ? {
      username: row.username,
      passwordHash: row.password_hash,
      totpEnabled: row.totp_enabled === 1,
      ...(row.totp_secret_encrypted === null ? {} : { totpSecretEncrypted: row.totp_secret_encrypted }),
    } : undefined
  }

  initializeUser(user: User): boolean {
    const result = this.database.prepare(`
      INSERT INTO users (username, password_hash, totp_secret_encrypted, totp_enabled)
      SELECT @username, @passwordHash, @totpSecretEncrypted, @totpEnabled
      WHERE NOT EXISTS (SELECT 1 FROM users)
    `).run(userToRow(user))
    return result.changes === 1
  }

  saveUser(user: User): void {
    const result = this.database.prepare(`
      UPDATE users SET password_hash = @passwordHash,
        totp_secret_encrypted = @totpSecretEncrypted, totp_enabled = @totpEnabled
      WHERE username = @username
    `).run(userToRow(user))
    if (result.changes !== 1) throw new NotFoundError(`User not found: ${user.username}`)
  }

  listNodes(): Node[] {
    const providers = this.providerMap()
    return (this.database.prepare('SELECT * FROM nodes ORDER BY rowid').all() as NodeRow[])
      .map((row) => rowToNode(row, row.provider_id ? providers.get(row.provider_id) : undefined))
  }

  getNode(id: string): Node | undefined {
    const row = this.database.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined
    if (!row) return undefined
    return rowToNode(row, row.provider_id ? this.getProvider(row.provider_id) : undefined)
  }

  saveUserDefinedNode(node: UserDefinedNode): void {
    const existing = this.database.prepare('SELECT type FROM nodes WHERE id = ?').get(node.id) as { type: string } | undefined
    if (existing && existing.type !== 'userdefined') throw new ConflictError(`Node ${node.id} is provider-managed`)
    this.writeNodeRow(userDefinedNodeToRow(node))
  }

  deleteUserDefinedNode(id: string): boolean {
    return this.database.prepare("DELETE FROM nodes WHERE id = ? AND type = 'userdefined'").run(id).changes === 1
  }

  listProviders(): ProxyProvider[] {
    return (this.database.prepare('SELECT * FROM providers ORDER BY rowid').all() as ProviderRow[]).map(rowToProvider)
  }

  getProvider(id: string): ProxyProvider | undefined {
    const row = this.database.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow | undefined
    return row ? rowToProvider(row) : undefined
  }

  saveProvider(provider: ProxyProvider): void {
    const row = providerToRow(provider)
    const save = this.database.transaction(() => {
      this.runWithConflict(() => this.database.prepare(`
        INSERT INTO providers (
          id, type, name, url, interval, subscription_format, filter, exclude_filter,
          exclude_type, override_json, config_json
        ) VALUES (
          @id, @type, @name, @url, @interval, @subscription_format, @filter, @exclude_filter,
          @exclude_type, @override_json, @config_json
        )
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type, name = excluded.name, url = excluded.url, interval = excluded.interval,
          subscription_format = excluded.subscription_format, filter = excluded.filter,
          exclude_filter = excluded.exclude_filter, exclude_type = excluded.exclude_type,
          override_json = excluded.override_json, config_json = excluded.config_json
      `).run(row))
      if (provider.type === 'passthrough') {
        this.database.prepare("DELETE FROM nodes WHERE provider_id = ? AND type = 'provider'").run(provider.id)
      }
    })
    save()
  }

  deleteProvider(id: string): boolean {
    return this.database.prepare('DELETE FROM providers WHERE id = ?').run(id).changes === 1
  }

  listProviderNodeStates(providerId: string): ProviderNodeState[] {
    const provider = this.getProvider(providerId)
    if (provider?.type !== 'import') return []
    return (this.database.prepare(`
      SELECT * FROM nodes WHERE provider_id = ? AND type = 'provider' ORDER BY rowid
    `).all(providerId) as NodeRow[]).map((row) => {
      if (row.upstream_key === null) throw new Error(`Provider node ${row.id} has no upstream key`)
      const node = rowToNode(row, provider)
      if (node.type !== 'provider') throw new Error(`Node ${row.id} is not provider-managed`)
      return { node, upstreamKey: row.upstream_key }
    })
  }

  replaceProviderNodes(providerId: string, nodes: readonly ProviderNodeState[]): void {
    const replace = this.database.transaction(() => {
      const provider = this.getProvider(providerId)
      if (provider?.type !== 'import') throw new NotFoundError(`Import provider not found: ${providerId}`)
      for (const state of nodes) {
        if (state.node.provider.id !== providerId) {
          throw new ValidationError(`Provider node ${state.node.id} belongs to another provider`)
        }
      }
      this.database.prepare("DELETE FROM nodes WHERE provider_id = ? AND type = 'provider'").run(providerId)
      for (const state of nodes) this.writeNodeRow(providerNodeToRow(state.node, state.upstreamKey))
    })
    replace()
  }

  listRulePacks(): RulePack[] {
    return (this.database.prepare('SELECT * FROM rule_packs ORDER BY rowid').all() as RulePackRow[]).map(rowToRulePack)
  }

  getRulePack(id: string): RulePack | undefined {
    const row = this.database.prepare('SELECT * FROM rule_packs WHERE id = ?').get(id) as RulePackRow | undefined
    return row ? rowToRulePack(row) : undefined
  }

  saveRulePack(rulePack: RulePack): void {
    this.runWithConflict(() => this.database.prepare(`
      INSERT INTO rule_packs (id, name, rules_json) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, rules_json = excluded.rules_json
    `).run(rulePack.id, rulePack.name, encodeJson(rulePack.rules)))
  }

  deleteRulePack(id: string): boolean {
    const references = this.profileIdsReferencingRulePack(id)
    if (references.length > 0) throw new ConflictError(`RulePack ${id} is used by Profile ${references.join(', ')}`)
    return this.database.prepare('DELETE FROM rule_packs WHERE id = ?').run(id).changes === 1
  }

  listRuleProviders(): RuleProvider[] {
    return (this.database.prepare('SELECT * FROM rule_providers ORDER BY rowid').all() as RuleProviderRow[])
      .map(rowToRuleProvider)
  }

  getRuleProvider(id: string): RuleProvider | undefined {
    const row = this.database.prepare('SELECT * FROM rule_providers WHERE id = ?').get(id) as RuleProviderRow | undefined
    return row ? rowToRuleProvider(row) : undefined
  }

  saveRuleProvider(ruleProvider: RuleProvider, previousName?: string): void {
    const save = this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO rule_providers (id, name, config_json) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, config_json = excluded.config_json
      `).run(ruleProvider.id, ruleProvider.name, encodeJson(ruleProvider.config))
      if (previousName && previousName !== ruleProvider.name) {
        this.rewriteRuleProviderReferences(ruleProvider.id, previousName, ruleProvider.name)
      }
    })
    this.runWithConflict(save)
  }

  deleteRuleProvider(id: string): boolean {
    const remove = this.database.transaction(() => {
      const provider = this.getRuleProvider(id)
      if (!provider) return false
      const profileIds = this.profileIdsReferencingRuleProvider(id, provider.name)
      const rulePackIds = (this.database.prepare('SELECT * FROM rule_packs ORDER BY rowid').all() as RulePackRow[])
        .filter((row) => decodeJson<RulePack['rules']>(row.rules_json)
          .some((rule) => referencesRuleProvider(rule, provider.name)))
        .map((row) => row.id)
      if (profileIds.length > 0 || rulePackIds.length > 0) {
        throw new ConflictError(
          `Rule Provider ${id} is referenced by ${[...profileIds.map((value) => `Profile ${value}`), ...rulePackIds.map((value) => `RulePack ${value}`)].join(', ')}`,
        )
      }
      return this.database.prepare('DELETE FROM rule_providers WHERE id = ?').run(id).changes === 1
    })
    return remove()
  }

  listProfiles(): ResolvedProfile[] {
    const rows = this.database.prepare('SELECT * FROM profiles ORDER BY rowid').all() as ProfileRow[]
    const nodes = new Map(this.listNodes().map((node) => [node.id, node]))
    const providers = new Map(this.listProviders().map((provider) => [provider.id, provider]))
    const rulePacks = new Map(this.listRulePacks().map((rulePack) => [rulePack.id, rulePack]))
    const ruleProviders = new Map(this.listRuleProviders().map((provider) => [provider.id, provider]))
    return rows.map((row) => this.removeMissingProfileReferences(
      resolveProfileRow(row, nodes, providers, rulePacks, ruleProviders),
    ))
  }

  getProfile(id: string): ResolvedProfile | undefined {
    const row = this.database.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined
    if (!row) return undefined
    return this.removeMissingProfileReferences(resolveProfileRow(
      row,
      new Map(this.listNodes().map((node) => [node.id, node])),
      new Map(this.listProviders().map((provider) => [provider.id, provider])),
      new Map(this.listRulePacks().map((rulePack) => [rulePack.id, rulePack])),
      new Map(this.listRuleProviders().map((provider) => [provider.id, provider])),
    ))
  }

  private removeMissingProfileReferences(value: ResolvedProfile): ResolvedProfile {
    if (value.missingReferences.length === 0) return value
    this.saveProfile(value.profile)
    return { profile: value.profile, missingReferences: [] }
  }

  saveProfile(profile: Profile, missingReferences: readonly MissingProfileReference[] = []): void {
    const row = profileToRow(profile, missingReferences)
    this.database.prepare(`
      INSERT INTO profiles (
        id, name, tags_json, note, general_config_json, selected_node_ids_json,
        listeners_json, proxy_groups_json, rule_entries_json, passthrough_provider_ids_json
        , rule_provider_ids_json
      ) VALUES (
        @id, @name, @tags_json, @note, @general_config_json, @selected_node_ids_json,
        @listeners_json, @proxy_groups_json, @rule_entries_json, @passthrough_provider_ids_json,
        @rule_provider_ids_json
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, tags_json = excluded.tags_json, note = excluded.note,
        general_config_json = excluded.general_config_json,
        selected_node_ids_json = excluded.selected_node_ids_json,
        listeners_json = excluded.listeners_json, proxy_groups_json = excluded.proxy_groups_json,
        rule_entries_json = excluded.rule_entries_json,
        rule_provider_ids_json = excluded.rule_provider_ids_json,
        passthrough_provider_ids_json = excluded.passthrough_provider_ids_json
    `).run(row)
  }

  deleteProfile(id: string): boolean {
    return this.database.prepare('DELETE FROM profiles WHERE id = ?').run(id).changes === 1
  }

  profileIdsReferencingNode(nodeId: string): string[] {
    return this.findProfileReferences((row) => {
      const selected = decodeJson<Array<{ id: string }>>(row.selected_node_ids_json)
      const listeners = decodeJson<Array<{ type: string; node?: { id: string } }>>(row.listeners_json)
      return selected.some((entry) => entry.id === nodeId)
        || listeners.some((entry) => entry.type === 'derived' && entry.node?.id === nodeId)
    })
  }

  profileIdsReferencingProvider(providerId: string): string[] {
    return this.findProfileReferences((row) =>
      decodeJson<Array<{ id: string }>>(row.passthrough_provider_ids_json)
        .some((entry) => entry.id === providerId),
    )
  }

  profileIdsReferencingRulePack(rulePackId: string): string[] {
    return this.findProfileReferences((row) =>
      decodeJson<Array<{ type: string; rulePack?: { id: string } }>>(row.rule_entries_json)
        .some((entry) => entry.type === 'rulePack' && entry.rulePack?.id === rulePackId),
    )
  }

  private profileIdsReferencingRuleProvider(ruleProviderId: string, name: string): string[] {
    return this.findProfileReferences((row) => {
      const selected = decodeJson<Array<{ id: string }>>(row.rule_provider_ids_json)
      const ruleEntries = decodeJson<Array<{ type: string; rule?: RulePack['rules'][number] }>>(row.rule_entries_json)
      return selected.some((entry) => entry.id === ruleProviderId)
        || ruleEntries.some((entry) => entry.type === 'rule' && entry.rule !== undefined
          && referencesRuleProvider(entry.rule, name))
    })
  }

  listSubscriptionTokens(profileId?: string): StoredSubscriptionToken[] {
    const rows = (profileId === undefined
      ? this.database.prepare('SELECT * FROM subscription_tokens ORDER BY rowid').all()
      : this.database.prepare('SELECT * FROM subscription_tokens WHERE profile_id = ? ORDER BY rowid').all(profileId)
    ) as SubscriptionTokenRow[]
    return rows.map(rowToToken)
  }

  getSubscriptionTokenById(id: string): StoredSubscriptionToken | undefined {
    const row = this.database.prepare('SELECT * FROM subscription_tokens WHERE id = ?').get(id) as SubscriptionTokenRow | undefined
    return row ? rowToToken(row) : undefined
  }

  getSubscriptionTokenByHash(tokenHash: string): StoredSubscriptionToken | undefined {
    const row = this.database.prepare('SELECT * FROM subscription_tokens WHERE token_hash = ?').get(tokenHash) as SubscriptionTokenRow | undefined
    return row ? rowToToken(row) : undefined
  }

  saveSubscriptionToken(token: StoredSubscriptionToken): void {
    const row = {
      id: token.id,
      profile_id: token.profileId,
      note: token.note ?? null,
      token_hash: token.tokenHash,
      encrypted_token: token.encryptedToken,
    }
    this.runWithConflict(() => this.database.prepare(`
      INSERT INTO subscription_tokens (id, profile_id, note, token_hash, encrypted_token)
      VALUES (@id, @profile_id, @note, @token_hash, @encrypted_token)
      ON CONFLICT(id) DO UPDATE SET profile_id = excluded.profile_id, note = excluded.note,
        token_hash = excluded.token_hash, encrypted_token = excluded.encrypted_token
    `).run(row))
  }

  deleteSubscriptionToken(id: string): boolean {
    return this.database.prepare('DELETE FROM subscription_tokens WHERE id = ?').run(id).changes === 1
  }

  close(): void {
    if (this.database.open) this.database.close()
  }

  private providerMap(): Map<string, ProxyProvider> {
    return new Map(this.listProviders().map((provider) => [provider.id, provider]))
  }

  private writeNodeRow(row: NodeRow): void {
    this.runWithConflict(() => this.database.prepare(`
      INSERT INTO nodes (
        id, type, name, tags_json, proxy_json, listener_template_json, provider_id, upstream_key
      ) VALUES (
        @id, @type, @name, @tags_json, @proxy_json, @listener_template_json, @provider_id, @upstream_key
      ) ON CONFLICT(id) DO UPDATE SET
        type = excluded.type, name = excluded.name, tags_json = excluded.tags_json,
        proxy_json = excluded.proxy_json, listener_template_json = excluded.listener_template_json,
        provider_id = excluded.provider_id, upstream_key = excluded.upstream_key
    `).run(row))
  }

  private rewriteRuleProviderReferences(id: string, oldName: string, newName: string): void {
    for (const row of this.database.prepare('SELECT * FROM rule_packs ORDER BY rowid').all() as RulePackRow[]) {
      const rules = decodeJson<RulePack['rules']>(row.rules_json)
      if (!rules.some((rule) => referencesRuleProvider(rule, oldName))) continue
      this.database.prepare('UPDATE rule_packs SET rules_json = ? WHERE id = ?').run(
        encodeJson(rules.map((rule) => rewriteRuleProviderReference(rule, oldName, newName))),
        row.id,
      )
    }

    for (const row of this.database.prepare('SELECT * FROM profiles ORDER BY rowid').all() as ProfileRow[]) {
      const ruleEntries = decodeJson<Array<{ type: string; rule?: RulePack['rules'][number] }>>(row.rule_entries_json)
      const selected = decodeJson<Array<{ id: string; displayName?: string }>>(row.rule_provider_ids_json)
      const rulesChanged = ruleEntries.some((entry) => entry.type === 'rule' && entry.rule !== undefined
        && referencesRuleProvider(entry.rule, oldName))
      const selectionChanged = selected.some((entry) => entry.id === id && entry.displayName !== newName)
      if (!rulesChanged && !selectionChanged) continue
      const rewrittenEntries = ruleEntries.map((entry) => entry.type === 'rule' && entry.rule !== undefined
        ? { ...entry, rule: rewriteRuleProviderReference(entry.rule, oldName, newName) }
        : entry)
      const rewrittenSelected = selected.map((entry) => entry.id === id ? { ...entry, displayName: newName } : entry)
      this.database.prepare(`
        UPDATE profiles SET rule_entries_json = ?, rule_provider_ids_json = ? WHERE id = ?
      `).run(encodeJson(rewrittenEntries), encodeJson(rewrittenSelected), row.id)
    }
  }

  private findProfileReferences(predicate: (row: ProfileRow) => boolean): string[] {
    return (this.database.prepare('SELECT * FROM profiles ORDER BY rowid').all() as ProfileRow[])
      .filter(predicate)
      .map((row) => row.id)
  }

  private runWithConflict<T>(operation: () => T): T {
    try {
      return operation()
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('UNIQUE constraint failed')) {
        throw new ConflictError(cause.message)
      }
      throw cause
    }
  }
}

function userToRow(user: User) {
  return {
    username: user.username,
    passwordHash: user.passwordHash,
    totpSecretEncrypted: user.totpSecretEncrypted ?? null,
    totpEnabled: user.totpEnabled ? 1 : 0,
  }
}

function rowToRulePack(row: RulePackRow): RulePack {
  return { id: row.id, name: row.name, rules: decodeJson(row.rules_json) }
}

function rowToRuleProvider(row: RuleProviderRow): RuleProvider {
  return { id: row.id, name: row.name, config: decodeJson(row.config_json) }
}

function rowToToken(row: SubscriptionTokenRow): StoredSubscriptionToken {
  return {
    id: row.id,
    profileId: row.profile_id,
    ...(row.note === null ? {} : { note: row.note }),
    tokenHash: row.token_hash,
    encryptedToken: row.encrypted_token,
  }
}
