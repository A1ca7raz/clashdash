import { describe, expect, it } from 'vitest'

import { parseYamlObject } from '../../lib/yaml.ts'

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
})
