import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

import { createApp } from '../http/app.ts'
import { createServerContainer } from './container.ts'

const container = await createServerContainer()
const app = createApp(container.services, { cronSecret: container.config.cronSecret })
app.use('/assets/*', serveStatic({ root: './public' }))
app.get('*', serveStatic({ root: './public', path: 'index.html' }))

const server = serve({ fetch: app.fetch, port: container.config.port }, (info) => {
  console.log(`ClashDash listening on http://localhost:${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(async () => {
      await container.close()
      process.exit(0)
    })
  })
}
