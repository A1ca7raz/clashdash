import { handle } from 'hono/vercel'

import { createApp } from '../src/http/app.ts'
import { createServerContainer } from '../src/server/container.ts'

const container = await createServerContainer(process.env)
const app = createApp(container.services, { cronSecret: container.config.cronSecret })

export default handle(app)
