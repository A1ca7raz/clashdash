import type { Rule } from '../models/rule.ts'

export function referencesRuleProvider(rule: Rule, name: string): boolean {
  return rule.type.trim().toUpperCase() === 'RULE-SET' && rule.parameters[0] === name
}

export function rewriteRuleProviderReference(rule: Rule, oldName: string, newName: string): Rule {
  if (!referencesRuleProvider(rule, oldName)) return structuredClone(rule)
  return { ...structuredClone(rule), parameters: [newName, ...rule.parameters.slice(1)] }
}
