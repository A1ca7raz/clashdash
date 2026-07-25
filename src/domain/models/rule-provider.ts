import type { JsonObject } from '../json.ts'

export type RuleProvider = {
  id: string
  name: string
  config: JsonObject
}
