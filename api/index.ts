import { handle } from 'hono/vercel'

import { createApp } from '../src/http/app.ts'
import { createServerContainer } from '../src/server/container.ts'
import { runtimeLogger } from '../src/server/runtime-logger.ts'

const container = await createServerContainer(process.env)
const app = createApp(container.services, {
  cronSecret: container.config.cronSecret,
  logRequest: (entry) => runtimeLogger.request(entry),
  logUnexpectedError: (cause, method, path) => runtimeLogger.unexpectedHttpError(cause, method, path),
})

export default handle(app)
