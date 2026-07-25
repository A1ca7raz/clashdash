import { describe, expect, it } from 'vitest'

import { createApp } from '@/http/app.ts'

describe('HTTP app', () => {
  it('reports its health', async () => {
    const response = await createApp().request('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })
})
