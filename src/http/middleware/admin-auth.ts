import { createMiddleware } from 'hono/factory'

import type { AuthService } from '../../application/auth/auth-service.ts'
import { AdminTokenError } from '../../application/errors.ts'

export function adminAuth(auth: AuthService) {
  return createMiddleware(async (context, next) => {
    const authorization = context.req.header('authorization')
    if (!authorization?.startsWith('Bearer ')) throw new AdminTokenError('Admin Bearer token is required')
    await auth.authenticate(authorization.slice('Bearer '.length))
    await next()
  })
}
