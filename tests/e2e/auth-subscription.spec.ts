import { expect, test } from '@playwright/test'

import { Rfc6238TotpService } from '../../src/infrastructure/security/rfc6238-totp-service.ts'

const username = 'e2e-admin'
const password = 'correct horse battery staple'

test('login, create a Profile, and use a public subscription token', async ({ page, request }) => {
  await page.goto('/')
  const root = page.locator('html')
  const initialTheme = await root.getAttribute('data-theme')
  expect(['light', 'dark']).toContain(initialTheme)
  const toggledTheme = initialTheme === 'dark' ? 'light' : 'dark'
  const toggleLabel = toggledTheme === 'dark' ? '切换到深色模式' : '切换到浅色模式'
  await page.getByRole('button', { name: toggleLabel }).click()
  await expect(root).toHaveAttribute('data-theme', toggledTheme)
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', toggledTheme)

  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登录控制台/ }).click()
  await expect(page.getByRole('heading', { name: '节点与来源' })).toBeVisible()
  await expect(page.getByRole('button', { name: initialTheme === 'dark' ? '切换到深色模式' : '切换到浅色模式' })).toBeVisible()

  await page.getByRole('button', { name: '批量导入' }).click()
  const importDialog = page.getByRole('dialog')
  await importDialog.getByLabel('输入格式').selectOption('uri')
  await importDialog.getByLabel('订阅内容').fill('not-a-proxy-uri')
  await importDialog.getByRole('button', { name: '解析并导入' }).click()
  await expect(page.getByText('lines[1]: Invalid proxy URI')).toBeVisible()
  await importDialog.getByLabel('订阅内容').fill('trojan://secret@example.com:443#E2E%20Imported')
  await importDialog.getByRole('button', { name: '解析并导入' }).click()
  await expect(page.getByText('E2E Imported', { exact: true })).toBeVisible()

  const adminToken = await page.evaluate(() => localStorage.getItem('clashdash.admin-token'))
  expect(adminToken).toBeTruthy()
  const adminHeaders = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }
  const nodeResponse = await request.post('/api/nodes', { headers: adminHeaders, data: {
    name: 'E2E Node', tags: ['e2e'],
    proxy: { type: 'ss', server: 'e2e.example.com', port: 443, cipher: 'aes-128-gcm', password: 'secret' },
    listenerTemplate: { type: 'tunnel', listen: '127.0.0.1', port: 10_090, network: 'tcp', target: 'example.com:22', proxy: 'E2E Node' },
  } })
  expect(nodeResponse.ok()).toBe(true)
  const e2eNode = await nodeResponse.json() as { id: string }
  expect((await request.post('/api/providers', { headers: adminHeaders, data: {
    type: 'passthrough', name: 'E2E Provider', url: 'https://example.com/provider.yaml', interval: 3600,
    override: { additionalPrefix: '[E2E] ', skipCertVerify: true },
    config: { path: './proxy-providers/e2e.yaml' },
  } })).ok()).toBe(true)
  expect((await request.post('/api/rule-packs', { headers: adminHeaders, data: {
    name: 'E2E Pack', rules: [{ type: 'DOMAIN-SUFFIX', parameters: ['example.com'], policy: 'DIRECT' }],
  } })).ok()).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '节点与来源' })).toBeVisible()

  const editableNodeCard = page.getByRole('button', { name: '编辑节点 E2E Node' })
  await editableNodeCard.click()
  const nodeEditor = page.getByRole('dialog')
  await expect(nodeEditor.getByRole('heading', { name: '编辑 UserDefined Node' })).toBeVisible()
  await expect(nodeEditor.getByLabel('节点名称')).toHaveValue('E2E Node')
  await expect(nodeEditor.getByLabel('Proxy YAML')).toHaveValue(/server: e2e\.example\.com/)
  await expect(nodeEditor.getByLabel('ListenerTemplate YAML（可选）')).toHaveValue(/port: 10090/)
  await nodeEditor.getByLabel('Tags').fill('e2e, edited')
  await nodeEditor.getByRole('button', { name: '保存修改' }).click()
  await expect(editableNodeCard).toContainText('#edited')

  const providerRow = page.locator('.provider-list article').filter({ hasText: 'E2E Provider' })
  await providerRow.getByRole('button', { name: '编辑订阅' }).click()
  const providerEditor = page.getByRole('dialog')
  await expect(providerEditor.getByRole('heading', { name: '编辑订阅' })).toBeVisible()
  await expect(providerEditor.getByLabel('Override YAML（Mihomo 字段）')).toHaveValue(/additional-prefix:/)
  await expect(providerEditor.getByLabel('Override YAML（Mihomo 字段）')).toHaveValue(/skip-cert-verify:/)
  await providerEditor.getByLabel('名称', { exact: true }).fill('E2E Provider Updated')
  await providerEditor.getByLabel('Filter', { exact: true }).fill('HK|JP')
  await providerEditor.getByRole('button', { name: '保存修改' }).click()
  await expect(page.locator('.provider-list')).toContainText('E2E Provider Updated')

  await page.getByRole('link', { name: /规则 Provider/ }).click()
  await expect(page.getByRole('heading', { name: '规则 Provider' })).toBeVisible()
  await page.getByRole('button', { name: '＋ 新建 Rule Provider' }).click()
  const ruleProviderEditor = page.getByRole('dialog')
  await ruleProviderEditor.getByLabel('Rule Provider 名称').fill('E2E Rule Provider')
  await ruleProviderEditor.getByLabel('Mihomo 配置 YAML').fill(
    'type: inline\nbehavior: domain\npayload:\n  - e2e.example.com\n',
  )
  await ruleProviderEditor.getByRole('button', { name: '保存', exact: true }).click()
  const ruleProviderCard = page.getByRole('button', { name: /E2E Rule Provider/ })
  await expect(ruleProviderCard).toBeVisible()
  await ruleProviderCard.click()
  const reopenedRuleProviderEditor = page.getByRole('dialog')
  await expect(reopenedRuleProviderEditor.getByLabel('Mihomo 配置 YAML')).toHaveValue(/type: inline/)
  await reopenedRuleProviderEditor.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('link', { name: /配置文件/ }).click()
  await page.getByRole('button', { name: /新建 Profile/ }).click()
  await expect(page.getByText('PROFILE AGGREGATE')).toBeVisible()

  const basicSection = page.locator('.structured-section').filter({ hasText: '基础信息' })
  await basicSection.getByLabel('Profile 名称').fill('E2E Structured Profile')
  await basicSection.getByLabel('Tags').fill('e2e, structured')
  const generalSection = page.locator('.structured-section').filter({ hasText: 'GeneralConfig' })
  await generalSection.getByLabel('GeneralConfig YAML').fill('mode: rule\nmixed-port: 7890\nallow-lan: false\n')

  const ruleProviderSection = page.locator('.structured-section').filter({ hasText: 'Rule Provider 选择器' })
  await ruleProviderSection.getByRole('button', { name: '选择 Rule Provider' }).click()
  await page.getByRole('button', { name: /E2E Rule Provider/ }).click()
  await page.getByRole('button', { name: '完成选择' }).click()
  await expect(ruleProviderSection.getByText('E2E Rule Provider')).toBeVisible()

  const ruleSection = page.locator('.structured-section').filter({ hasText: '规则编辑器' })
  await expect(ruleSection.locator('.rule-row-card')).toHaveCount(1)
  await ruleSection.getByRole('button', { name: '＋ RulePack' }).click()
  await page.getByRole('button', { name: /E2E Pack/ }).click()
  await expect(ruleSection.locator('.rule-row-card')).toHaveCount(2)
  await expect(ruleSection.getByRole('button', { name: '＋ Rule Provider' })).toHaveCount(0)

  const proxySection = page.locator('.structured-section').filter({ hasText: 'Proxy 选择器' })
  await proxySection.getByRole('button', { name: '选择 Proxy' }).click()
  await page.getByRole('button', { name: '＋ 内联创建 Proxy' }).click()
  await page.getByLabel('名称', { exact: true }).fill('E2E Inline Proxy')
  await page.getByRole('button', { name: '创建并选中' }).click()
  await page.getByRole('button', { name: /E2E Node/ }).click()
  await page.getByRole('button', { name: '完成选择' }).click()
  await expect(proxySection.getByText('E2E Node')).toBeVisible()
  await expect(proxySection.getByText('E2E Inline Proxy')).toBeVisible()

  const listenerSection = page.locator('.structured-section').filter({ hasText: 'Listener 选择器' })
  await listenerSection.getByRole('button', { name: '选择 Listener' }).click()
  await page.getByRole('button', { name: '＋ 内联创建 Listener' }).click()
  await page.getByRole('button', { name: '创建并选中' }).click()
  await page.getByRole('button', { name: /E2E Node/ }).click()
  await page.getByRole('button', { name: '完成选择' }).click()
  await expect(listenerSection.getByText('E2E Node Listener')).toBeVisible()
  await expect(listenerSection.getByText('Profile Mixed Inbound')).toBeVisible()
  const derivedListenerCard = listenerSection.locator('.selected-resource-card').filter({ hasText: 'DERIVED' })
  const inlineListenerCard = listenerSection.locator('.selected-resource-card').filter({ hasText: 'INLINE' })
  await expect(derivedListenerCard.getByRole('button', { name: '编辑' })).toHaveCount(0)
  await expect(inlineListenerCard.getByRole('button', { name: '编辑' })).toHaveCount(1)

  const groupSection = page.locator('.structured-section').filter({ hasText: 'ProxyGroup 卡片组' })
  await groupSection.getByRole('button', { name: '＋ 创建 ProxyGroup' }).click()
  await page.getByLabel('原始 YAML 条目').fill('name: E2E Select\ntype: select\nproxies:\n  - E2E Node\n  - DIRECT\n')
  await page.getByRole('button', { name: '保存 ProxyGroup' }).click()
  await expect(groupSection.getByText('E2E Select', { exact: true })).toBeVisible()

  const providerSection = page.locator('.structured-section').filter({ hasText: 'Provider 选择器' })
  await providerSection.getByRole('button', { name: '选择 Provider' }).click()
  await page.getByRole('button', { name: /E2E Provider/ }).click()
  await page.getByRole('button', { name: '完成选择' }).click()
  await expect(providerSection.getByText('E2E Provider')).toBeVisible()

  await page.getByRole('button', { name: '保存 Profile' }).click()
  await expect(page.getByText('Profile 已保存。')).toBeVisible()
  await page.getByRole('button', { name: '生成预览' }).click()
  await expect(page.getByText('0 ERRORS')).toBeVisible()
  await page.getByRole('button', { name: '订阅 Token' }).click()
  await page.getByLabel('备注').fill('E2E device')
  await page.getByRole('button', { name: '签发 Token' }).click()
  await expect(page.getByText('E2E device')).toBeVisible()

  const url = await page.locator('.token-list article').first().locator('p').textContent()
  expect(url).toBeTruthy()
  const parsedSubscriptionUrl = new URL(url ?? '')
  expect(parsedSubscriptionUrl.pathname).toBe('/api/profile')
  expect(parsedSubscriptionUrl.searchParams.get('apikey')).toMatch(/^[a-z0-9_-]{32}$/)
  const subscription = await request.get(url ?? '')
  expect(subscription.ok()).toBeTruthy()
  const subscriptionYaml = await subscription.text()
  expect(subscriptionYaml).toContain('rule-providers:')
  expect(subscriptionYaml).toContain('MATCH,DIRECT')

  const profileId = new URL(page.url()).pathname.split('/').at(-1)
  expect(profileId).toBeTruthy()
  expect((await request.delete(`/api/nodes/${e2eNode.id}`, { headers: adminHeaders })).ok()).toBe(true)
  const cleanedResponse = await request.get(`/api/profiles/${profileId}`, { headers: adminHeaders })
  expect(cleanedResponse.ok()).toBe(true)
  const cleaned = await cleanedResponse.json() as {
    profile: { selectedNodes: Array<{ id: string }>; listeners: Array<{ type: string; node?: { id: string } }> }
    missingReferences: unknown[]
  }
  expect(cleaned.missingReferences).toEqual([])
  expect(cleaned.profile.selectedNodes.some((node) => node.id === e2eNode.id)).toBe(false)
  expect(cleaned.profile.listeners.some((listener) => listener.node?.id === e2eNode.id)).toBe(false)

  const persistedResponse = await request.get(`/api/profiles/${profileId}`, { headers: adminHeaders })
  await expect(persistedResponse.json()).resolves.toMatchObject({ missingReferences: [] })
  await page.reload()
  await expect(page.locator('.missing-list')).toHaveCount(0)
  await expect(page.locator('.selected-resource-card').filter({ hasText: 'E2E Node' })).toHaveCount(0)

  await page.getByRole('link', { name: /配置文件/ }).click()
  await expect(page.getByRole('heading', { name: '配置文件' })).toBeVisible()
  const profileCard = page.getByRole('button', { name: /E2E Structured Profile/ })
  await expect(profileCard).toBeVisible()
  await profileCard.click()
  await expect(page.getByText('PROFILE AGGREGATE')).toBeVisible()

  await page.getByRole('link', { name: /规则包/ }).click()
  await expect(page.getByRole('heading', { name: '规则包' })).toBeVisible()
  const rulePackCard = page.getByRole('button', { name: /E2E Pack/ })
  await expect(rulePackCard).toBeVisible()
  await rulePackCard.click()
  await expect(page.getByRole('heading', { name: 'E2E Pack' }).first()).toBeVisible()
  const rulePackEditor = page.locator('.aggregate-editor')
  await expect(rulePackEditor.locator('.shared-rule-editor .rule-row-card')).toHaveCount(1)
  await expect(rulePackEditor.getByLabel('Type')).toHaveValue('DOMAIN-SUFFIX')
  await rulePackEditor.getByRole('button', { name: '＋ 内联 Rule' }).click()
  await expect(rulePackEditor.locator('.shared-rule-editor .rule-row-card')).toHaveCount(2)
  await expect(rulePackEditor.getByRole('button', { name: '＋ Rule Provider' })).toHaveCount(0)
  await rulePackEditor.getByRole('button', { name: '整体保存' }).click()
})

test('change the persisted password and optionally enable TOTP', async ({ page }) => {
  const changedPassword = '1'
  const totp = new Rfc6238TotpService()
  await page.goto('/')
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登录控制台/ }).click()
  await page.getByRole('link', { name: /账户安全/ }).click()

  const passwordCard = page.locator('.security-card').filter({ hasText: '修改密码' })
  await passwordCard.getByLabel('当前密码').fill(password)
  await passwordCard.getByLabel('新密码').fill(changedPassword)
  await passwordCard.getByRole('button', { name: '保存新密码' }).click()
  await expect(page.getByText('密码已更新。')).toBeVisible()

  const totpCard = page.locator('.security-card').filter({ hasText: 'TOTP 身份验证' })
  await totpCard.getByLabel('当前密码').fill(changedPassword)
  await totpCard.getByRole('button', { name: '生成绑定二维码' }).click()
  await expect(totpCard.getByAltText('TOTP 配置二维码')).toBeVisible()
  const secret = await totpCard.locator('.totp-setup code').textContent()
  expect(secret).toBeTruthy()
  await totpCard.getByLabel('输入 6 位验证码以确认').fill(totp.generateCode(secret ?? ''))
  await totpCard.getByRole('button', { name: '确认并启用' }).click()
  await expect(totpCard.getByText('双因子验证已启用')).toBeVisible()

  await page.getByRole('button', { name: '退出管理登录' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill(changedPassword)
  await page.getByRole('button', { name: /登录控制台/ }).click()
  await expect(page.getByLabel('双因子验证码')).toBeVisible()
  await page.getByLabel('双因子验证码').fill(totp.generateCode(secret ?? ''))
  await page.getByRole('button', { name: /验证并登录/ }).click()
  await expect(page.getByRole('heading', { name: '账户安全' })).toBeVisible()

  await page.getByRole('link', { name: /账户安全/ }).click()
  const enabledTotpCard = page.locator('.security-card').filter({ hasText: 'TOTP 身份验证' })
  await enabledTotpCard.getByLabel('当前密码').fill(changedPassword)
  await enabledTotpCard.getByLabel('TOTP 验证码').fill(totp.generateCode(secret ?? ''))
  await enabledTotpCard.getByRole('button', { name: '停用 TOTP' }).click()
  await expect(enabledTotpCard.getByRole('button', { name: '生成绑定二维码' })).toBeVisible()

  const restorePasswordCard = page.locator('.security-card').filter({ hasText: '修改密码' })
  await restorePasswordCard.getByLabel('当前密码').fill(changedPassword)
  await restorePasswordCard.getByLabel('新密码').fill(password)
  await restorePasswordCard.getByRole('button', { name: '保存新密码' }).click()
  await expect(page.getByText('密码已更新。')).toBeVisible()
})
