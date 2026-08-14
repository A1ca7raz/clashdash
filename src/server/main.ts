import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

import { createApp } from '../http/app.ts'
import { createServerContainer } from './container.ts'
import { databaseType } from './config.ts'
import { runtimeLogger } from './runtime-logger.ts'

const container = await createServerContainer()
const app = createApp(container.services, {
  cronSecret: container.config.cronSecret,
  logRequest: (entry) => runtimeLogger.request(entry),
  logUnexpectedError: (cause, method, path) => runtimeLogger.unexpectedHttpError(cause, method, path),
})
app.use('/assets/*', serveStatic({ root: './public' }))
app.get('*', serveStatic({ root: './public', path: 'index.html' }))

const server = serve({ fetch: app.fetch, port: container.config.port }, (info) => {
  runtimeLogger.info('server.started', {
    port: info.port,
    mode: container.config.mode,
    database: databaseType(container.config.databaseUrl),
  })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    runtimeLogger.info('server.stopping', { signal })
    server.close(async () => {
      await container.close()
      runtimeLogger.info('server.stopped')
      process.exit(0)
    })
  })
}
