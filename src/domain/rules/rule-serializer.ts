import type { Rule } from '../models/rule.ts'

export function serializeRule(rule: Rule): string {
  return [rule.type, ...rule.parameters, rule.policy, ...(rule.modifiers ?? [])].join(',')
}
