export type Rule = {
  type: string
  parameters: string[]
  policy: string
  modifiers?: string[]
}

export type RulePack = {
  id: string
  name: string
  rules: Rule[]
}

export type RuleEntry =
  | {
      type: 'rule'
      rule: Rule
    }
  | {
      type: 'rulePack'
      rulePack: RulePack
    }
