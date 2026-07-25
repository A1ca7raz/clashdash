import { describe, expect, it } from 'vitest'

import { isJsonValue } from './json.ts'

describe('isJsonValue', () => {
  it('accepts nested JSON data', () => {
    expect(isJsonValue({ enabled: true, values: [null, 1, 'two'] })).toBe(true)
  })

  it('rejects undefined, functions and cyclic objects', () => {
    expect(isJsonValue(undefined)).toBe(false)
    expect(isJsonValue(() => undefined)).toBe(false)

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(isJsonValue(cyclic)).toBe(false)
  })
})
