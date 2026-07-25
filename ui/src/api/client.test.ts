// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, clearAdminToken, getAdminToken, setAdminToken } from './client.ts'

describe('UI API client', () => {
  afterEach(() => { clearAdminToken(); vi.unstubAllGlobals() })

  it('attaches the admin token and clears it after a 401', async () => {
    setAdminToken('admin-token')
    const fetchMock = vi.fn(async (_path: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer admin-token')
      return new Response(JSON.stringify({ error: { code: 'INVALID_ADMIN_TOKEN', message: 'expired' } }), {
        status: 401, headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(api('/api/nodes')).rejects.toThrow('expired')
    expect(getAdminToken()).toBeNull()
  })

  it('keeps the session when a sensitive action rejects its current password', async () => {
    setAdminToken('admin-token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'UNAUTHORIZED', message: 'Invalid current password' },
    }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await expect(api('/api/account/password', { method: 'POST' })).rejects.toThrow('Invalid current password')
    expect(getAdminToken()).toBe('admin-token')
  })
})
