import type { Diagnostic } from '../diagnostics.ts'
import type { Rule, RuleEntry } from '../models/rule.ts'
import { validateRule } from './rule-validator.ts'

export type ExpandedRules = {
  rules: Rule[]
  diagnostics: Diagnostic[]
}

export function expandRuleEntries(entries: RuleEntry[]): ExpandedRules {
  const rules: Rule[] = []
  const diagnostics: Diagnostic[] = []

  for (const [entryIndex, entry] of entries.entries()) {
    const entryRules = entry.type === 'rule' ? [entry.rule] : entry.rulePack.rules
    for (const [ruleIndex, rule] of entryRules.entries()) {
      const location =
        entry.type === 'rule'
          ? `ruleEntries[${entryIndex}].rule`
          : `ruleEntries[${entryIndex}].rulePack.rules[${ruleIndex}]`
      rules.push(rule)
      diagnostics.push(
        ...validateRule(rule).map((diagnostic) => ({ ...diagnostic, location })),
      )
    }
  }

  const matchIndex = rules.findIndex((rule) => rule.type.toUpperCase() === 'MATCH')
  if (matchIndex >= 0 && matchIndex < rules.length - 1) {
    diagnostics.push({
      severity: 'warning',
      code: 'RULE_AFTER_MATCH',
      message: `${rules.length - matchIndex - 1} rule(s) after MATCH are unreachable`,
      location: `rules[${matchIndex + 1}]`,
    })
  }

  return { rules, diagnostics }
}
