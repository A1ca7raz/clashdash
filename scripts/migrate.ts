import { createServerContainer } from '../src/server/container.ts'

const container = await createServerContainer(process.env)
console.log(`Database migration complete (${container.config.dialect})`)
await container.close()
