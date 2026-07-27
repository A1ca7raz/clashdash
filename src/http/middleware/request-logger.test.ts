import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { requestLogger, type HttpRequestLog } from './request-logger.ts'

describe('HTTP request logger', () => {
  it('records method, path, status, and duration without query secrets', async () => {
    const logs: HttpRequestLog[] = []
    const app = new Hono()
    app.use('*', requestLogger((entry) => logs.push(entry)))
    app.get('/api/profile', (context) => context.text('ok'))

    const response = await app.request('/api/profile?apikey=secret-token')

    expect(response.status).toBe(200)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ method: 'GET', path: '/api/profile', status: 200 })
    expect(logs[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(logs)).not.toContain('secret-token')
  })

  it('records the mapped status when a route throws', async () => {
    const logs: HttpRequestLog[] = []
    const app = new Hono()
    app.use('*', requestLogger((entry) => logs.push(entry)))
    app.onError((_cause, context) => context.json({ error: 'invalid' }, 422))
    app.get('/invalid', () => { throw new Error('invalid') })

    await app.request('/invalid')

    expect(logs[0]).toMatchObject({ method: 'GET', path: '/invalid', status: 422 })
  })
})
