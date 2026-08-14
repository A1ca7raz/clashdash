import { createServerContainer } from '../src/server/container.ts'
import { databaseType } from '../src/server/config.ts'

const container = await createServerContainer(process.env)
console.log(`Database migration complete (${databaseType(container.config.databaseUrl)})`)
await container.close()
