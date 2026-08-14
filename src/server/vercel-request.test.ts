import { describe, expect, it } from 'vitest'

import { restoreVercelRequestPath } from './vercel-request.ts'

describe('Vercel request path restoration', () => {
  it('restores the API path and preserves the request', async () => {
    const request = new Request(
      'https://example.com/?clashdashRoute=auth/login&source=ui',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ok":true}' },
    )

    const restored = restoreVercelRequestPath(request)
    const url = new URL(restored.url)
    expect(url.pathname).toBe('/api/auth/login')
    expect(url.search).toBe('?source=ui')
    expect(restored.method).toBe('POST')
    expect(restored.headers.get('content-type')).toBe('application/json')
    await expect(restored.text()).resolves.toBe('{"ok":true}')
  })

  it('leaves requests without the internal route parameter unchanged', () => {
    const request = new Request('https://example.com/api/health')
    expect(restoreVercelRequestPath(request)).toBe(request)
  })
})
