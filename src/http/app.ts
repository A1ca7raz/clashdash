import { Hono } from 'hono'
import { toDataURL } from 'qrcode'
import { z } from 'zod'

import type { ApplicationServices } from '../application/services.ts'
import type { UserDefinedNode } from '../domain/models/node.ts'
import type { Profile } from '../domain/models/profile.ts'
import type { ProxyProvider } from '../domain/models/provider.ts'
import type { RuleProvider } from '../domain/models/rule-provider.ts'
import type { Rule, RulePack } from '../domain/models/rule.ts'
import { handleHttpError } from './errors.ts'
import { adminAuth } from './middleware/admin-auth.ts'

const id = z.string().trim().min(1)
const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue),
]))
const objectBody = z.looseObject({})
const credentials = z.object({ username: z.string(), password: z.string(), totpCode: z.string().optional() })
const ruleSchema = z.object({
  type: z.string(), parameters: z.array(z.string()), policy: z.string(), modifiers: z.array(z.string()).optional(),
})
export type CreateAppOptions = { cronSecret?: string | undefined }

export function createApp(services?: ApplicationServices, options: CreateAppOptions = {}): Hono {
  const app = new Hono()
  app.onError(handleHttpError)
  app.get('/api/health', (context) => context.json({ status: 'ok' }))
  if (!services) return app

  app.post('/api/auth/login', async (context) => {
    const body = credentials.parse(await context.req.json())
    context.header('cache-control', 'no-store')
    return context.json({ token: await services.auth.login(body.username, body.password, body.totpCode) })
  })
  app.get('/api/profile', async (context) => {
    const result = await services.subscriptions.render(context.req.query('apikey') ?? '')
    context.header('content-type', 'text/yaml; charset=utf-8')
    context.header('content-disposition', `attachment; filename="${safeFilename(result.profileName)}.yaml"`)
    context.header('cache-control', 'no-store')
    return context.body(result.yaml)
  })
  app.post('/api/cron/providers/refresh', async (context) => {
    if (!options.cronSecret) return context.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
    const supplied = context.req.header('x-cron-secret')
      ?? context.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    if (supplied !== options.cronSecret) {
      return context.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid Cron secret' } }, 401)
    }
    return context.json(await services.providers.refreshAll())
  })

  app.use('/api/*', adminAuth(services.auth))
  app.get('/api/auth/me', async (context) => {
    const token = context.req.header('authorization')?.slice('Bearer '.length) ?? ''
    return context.json(await services.auth.authenticate(token))
  })
  app.get('/api/account/security', async (context) => context.json(await services.auth.securityStatus()))
  app.post('/api/account/password', async (context) => {
    const body = z.object({
      currentPassword: z.string(), newPassword: z.string(), totpCode: z.string().optional(),
    }).parse(await context.req.json())
    await services.auth.changePassword(body.currentPassword, body.newPassword, body.totpCode)
    return context.body(null, 204)
  })
  app.post('/api/account/totp/setup', async (context) => {
    const body = z.object({ currentPassword: z.string() }).parse(await context.req.json())
    const setup = await services.auth.beginTotpSetup(body.currentPassword)
    context.header('cache-control', 'no-store')
    return context.json({
      ...setup,
      qrCodeDataUrl: await toDataURL(setup.provisioningUri, {
        errorCorrectionLevel: 'M', margin: 1, width: 240,
        color: { dark: '#071014', light: '#ffffff' },
      }),
    })
  })
  app.post('/api/account/totp/confirm', async (context) => {
    const body = z.object({ code: z.string() }).parse(await context.req.json())
    await services.auth.confirmTotpSetup(body.code)
    return context.body(null, 204)
  })
  app.post('/api/account/totp/disable', async (context) => {
    const body = z.object({ currentPassword: z.string(), code: z.string() }).parse(await context.req.json())
    await services.auth.disableTotp(body.currentPassword, body.code)
    return context.body(null, 204)
  })

  app.get('/api/nodes', async (context) => context.json(await services.nodes.list()))
  app.post('/api/nodes', async (context) => {
    const body = objectBody.parse(await context.req.json())
    return context.json(await services.nodes.create(body as never), 201)
  })
  app.post('/api/nodes/import', async (context) => {
    const body = z.object({
      content: z.string(), format: z.enum(['clash', 'uri', 'base64']), tags: z.array(z.string()).optional(),
    }).parse(await context.req.json())
    return context.json(await services.nodes.import(body.content, body.format, body.tags), 201)
  })
  app.put('/api/nodes/:id', async (context) => {
    const body = objectBody.parse(await context.req.json()) as unknown as UserDefinedNode
    return context.json(await services.nodes.update({ ...body, id: context.req.param('id') }))
  })
  app.delete('/api/nodes/:id', async (context) => {
    await services.nodes.delete(context.req.param('id'))
    return context.body(null, 204)
  })

  app.get('/api/providers', async (context) => context.json(await services.providers.list()))
  app.get('/api/providers/:id', async (context) => context.json(await services.providers.get(context.req.param('id'))))
  app.post('/api/providers', async (context) => {
    const body = objectBody.parse(await context.req.json())
    return context.json(await services.providers.create(body as never), 201)
  })
  app.put('/api/providers/:id', async (context) => {
    const body = objectBody.parse(await context.req.json()) as unknown as ProxyProvider
    return context.json(await services.providers.update({ ...body, id: context.req.param('id') } as ProxyProvider))
  })
  app.delete('/api/providers/:id', async (context) => {
    await services.providers.delete(context.req.param('id'))
    return context.body(null, 204)
  })
  app.post('/api/providers/:id/refresh', async (context) =>
    context.json(await services.providers.refresh(context.req.param('id'))),
  )
  app.post('/api/providers/refresh-all', async (context) => context.json(await services.providers.refreshAll()))

  app.get('/api/rule-packs', async (context) => context.json(await services.rulePacks.list()))
  app.get('/api/rule-packs/:id', async (context) => context.json(await services.rulePacks.get(context.req.param('id'))))
  app.post('/api/rule-packs', async (context) => {
    const body = z.object({ name: z.string(), rules: z.array(ruleSchema) }).parse(await context.req.json())
    return context.json(await services.rulePacks.create(body.name, body.rules as Rule[]), 201)
  })
  app.put('/api/rule-packs/:id', async (context) => {
    const body = z.object({ name: z.string(), rules: z.array(ruleSchema) }).parse(await context.req.json())
    return context.json(await services.rulePacks.update({ id: context.req.param('id'), ...body } as RulePack))
  })
  app.delete('/api/rule-packs/:id', async (context) => {
    await services.rulePacks.delete(context.req.param('id'))
    return context.body(null, 204)
  })

  app.get('/api/rule-providers', async (context) => context.json(await services.ruleProviders.list()))
  app.get('/api/rule-providers/:id', async (context) =>
    context.json(await services.ruleProviders.get(context.req.param('id'))),
  )
  app.post('/api/rule-providers', async (context) => {
    const body = z.object({ name: z.string(), config: z.record(z.string(), jsonValue) }).parse(await context.req.json())
    return context.json(await services.ruleProviders.create(body.name, body.config as RuleProvider['config']), 201)
  })
  app.put('/api/rule-providers/:id', async (context) => {
    const body = z.object({ name: z.string(), config: z.record(z.string(), jsonValue) }).parse(await context.req.json())
    return context.json(await services.ruleProviders.update({
      id: context.req.param('id'), ...body,
    } as RuleProvider))
  })
  app.delete('/api/rule-providers/:id', async (context) => {
    await services.ruleProviders.delete(context.req.param('id'))
    return context.body(null, 204)
  })

  app.get('/api/profiles', async (context) => context.json(await services.profiles.list()))
  app.get('/api/profiles/:id', async (context) => context.json(await services.profiles.get(context.req.param('id'))))
  app.post('/api/profiles', async (context) => {
    const body = objectBody.parse(await context.req.json())
    return context.json(await services.profiles.create(body as never), 201)
  })
  app.put('/api/profiles/:id', async (context) => {
    const body = z.object({ profile: objectBody }).parse(await context.req.json())
    return context.json(await services.profiles.save(
      { ...(body.profile as unknown as Profile), id: context.req.param('id') },
    ))
  })
  app.post('/api/profiles/:id/preview', async (context) => context.json(await services.profiles.preview(context.req.param('id'))))
  app.post('/api/profiles/preview', async (context) => {
    const body = z.object({ profile: objectBody }).parse(await context.req.json())
    return context.json(services.profiles.previewDraft(body.profile as unknown as Profile))
  })
  app.delete('/api/profiles/:id', async (context) => {
    await services.profiles.delete(context.req.param('id'))
    return context.body(null, 204)
  })

  app.get('/api/profiles/:id/tokens', async (context) => context.json(
    (await services.subscriptions.list(context.req.param('id'))).map((token) => tokenResponse(token, context.req.url)),
  ))
  app.post('/api/profiles/:id/tokens', async (context) => {
    const body = z.object({ note: z.string().optional() }).parse(await optionalJson(context))
    const token = await services.subscriptions.issue(context.req.param('id'), body.note)
    return context.json(tokenResponse(token, context.req.url), 201)
  })
  app.get('/api/tokens/:id', async (context) => context.json(tokenResponse(
    await services.subscriptions.get(context.req.param('id')), context.req.url,
  )))
  app.delete('/api/tokens/:id', async (context) => {
    await services.subscriptions.revoke(context.req.param('id'))
    return context.body(null, 204)
  })

  app.notFound((context) => context.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404))
  return app
}

function tokenResponse(token: Awaited<ReturnType<ApplicationServices['subscriptions']['get']>>, requestUrl: string) {
  const subscriptionUrl = new URL('/api/profile', requestUrl)
  subscriptionUrl.searchParams.set('apikey', token.token)
  return {
    ...token,
    subscriptionUrl: subscriptionUrl.href,
  }
}

async function optionalJson(context: { req: { header(name: string): string | undefined; json(): Promise<unknown> } }): Promise<unknown> {
  const contentType = context.req.header('content-type')
  return contentType?.includes('application/json') ? context.req.json() : {}
}

function safeFilename(value: string): string {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'clashdash'
}
