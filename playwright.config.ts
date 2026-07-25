import { defineConfig } from '@playwright/test'

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const e2eDatabasePath = `/tmp/clashdash-e2e-${process.pid}.sqlite`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:43219',
    trace: 'retain-on-failure',
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:43219/api/health',
    timeout: 20_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      PORT: '43219',
      CLASHDASH_DATABASE_DIALECT: 'sqlite',
      CLASHDASH_DATABASE_PATH: e2eDatabasePath,
      CLASHDASH_JWT_SECRET: 'e2e-jwt-secret-that-is-at-least-32-bytes',
      CLASHDASH_TOKEN_KEY: 'BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU',
      CLASHDASH_TOTP_KEY: 'BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY',
      CLASHDASH_ADMIN_USERNAME: 'e2e-admin',
      CLASHDASH_ADMIN_PASSWORD: 'correct horse battery staple',
    },
  },
})
