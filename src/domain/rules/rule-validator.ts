import type { Diagnostic } from '../diagnostics.ts'
import type { Rule } from '../models/rule.ts'

type RuleDefinition = {
  parameters: number
  modifiers?: ReadonlySet<string>
}

const noModifiers = new Set<string>()
const noResolve = new Set(['no-resolve'])

const knownRules: Readonly<Record<string, RuleDefinition>> = {
  DOMAIN: { parameters: 1, modifiers: noModifiers },
  'DOMAIN-SUFFIX': { parameters: 1, modifiers: noModifiers },
  'DOMAIN-KEYWORD': { parameters: 1, modifiers: noModifiers },
  'IP-CIDR': { parameters: 1, modifiers: noResolve },
  'IP-CIDR6': { parameters: 1, modifiers: noResolve },
  GEOIP: { parameters: 1, modifiers: noResolve },
  GEOSITE: { parameters: 1, modifiers: noModifiers },
  'PROCESS-NAME': { parameters: 1, modifiers: noModifiers },
  'PROCESS-PATH': { parameters: 1, modifiers: noModifiers },
  'DST-PORT': { parameters: 1, modifiers: noModifiers },
  'SRC-PORT': { parameters: 1, modifiers: noModifiers },
  'RULE-SET': { parameters: 1, modifiers: noResolve },
  MATCH: { parameters: 0, modifiers: noModifiers },
}

export function validateRule(rule: Rule): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const type = rule.type.trim().toUpperCase()

  if (type.length === 0) {
    diagnostics.push(error('RULE_TYPE_REQUIRED', 'Rule type is required'))
  }

  if (rule.policy.trim().length === 0) {
    diagnostics.push(error('RULE_POLICY_REQUIRED', 'Rule policy is required'))
  }

  for (const [index, parameter] of rule.parameters.entries()) {
    if (parameter.length === 0) {
      diagnostics.push(error('RULE_PARAMETER_EMPTY', `Rule parameter ${index + 1} is empty`))
    }
  }

  const definition = knownRules[type]
  if (!definition) {
    if (type.length > 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'UNKNOWN_RULE_TYPE',
        message: `Unknown Mihomo rule type: ${rule.type}`,
      })
    }
    return diagnostics
  }

  if (rule.parameters.length !== definition.parameters) {
    diagnostics.push(
      error(
        'RULE_PARAMETER_COUNT',
        `${type} expects ${definition.parameters} parameter(s), received ${rule.parameters.length}`,
      ),
    )
  }

  for (const modifier of rule.modifiers ?? []) {
    if (!definition.modifiers?.has(modifier)) {
      diagnostics.push(
        error('RULE_MODIFIER_NOT_ALLOWED', `${modifier} is not supported by ${type}`),
      )
    }
  }

  return diagnostics
}

function error(code: string, message: string): Diagnostic {
  return { severity: 'error', code, message }
}
