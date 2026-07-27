import { describe, expect, it } from 'vitest'

import {
  parseOptionalYamlObject,
  parseYamlObject,
  stringifyYamlObject,
} from '../../lib/yaml.ts'

describe('Profile structured editor YAML', () => {
  it('parses GeneralConfig and raw card objects', () => {
    expect(parseYamlObject('mode: rule\nallow-lan: true\n', 'GeneralConfig')).toEqual({
      mode: 'rule', 'allow-lan': true,
    })
    expect(parseYamlObject('', 'GeneralConfig')).toEqual({})
  })

  it('rejects arrays and scalar YAML at object boundaries', () => {
    expect(() => parseYamlObject('- DIRECT\n- REJECT', 'ProxyGroup')).toThrow('ProxyGroup 必须是 YAML 对象')
    expect(() => parseYamlObject('DIRECT', 'Listener')).toThrow('Listener 必须是 YAML 对象')
  })

  it('renders empty mappings as blank and omits empty optional mappings', () => {
    expect(stringifyYamlObject({})).toBe('')
    expect(stringifyYamlObject({ mode: 'rule' })).toBe('mode: rule\n')
    expect(parseOptionalYamlObject('', 'Override')).toBeUndefined()
    expect(parseOptionalYamlObject('{}', 'Override')).toBeUndefined()
    expect(parseOptionalYamlObject('udp: true', 'Override')).toEqual({ udp: true })
  })
})
