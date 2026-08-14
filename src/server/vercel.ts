import { createApp } from '../http/app.ts'
import { createServerContainer } from './container.ts'
import { runtimeLogger } from './runtime-logger.ts'
import { restoreVercelRequestPath } from './vercel-request.ts'

const container = await createServerContainer(process.env)
const app = createApp(container.services, {
  cronSecret: container.config.cronSecret,
  logRequest: (entry) => runtimeLogger.request(entry),
  logUnexpectedError: (cause, method, path) => runtimeLogger.unexpectedHttpError(cause, method, path),
})

export default {
  fetch(request: Request): Response | Promise<Response> {
    return app.fetch(restoreVercelRequestPath(request))
  },
}
