import type { Context } from 'hono'
import { ZodError } from 'zod'

import {
  AdminTokenError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  TotpRequiredError,
  ValidationError,
} from '../application/errors.ts'

export function handleHttpError(cause: Error, context: Context): Response {
  if (cause instanceof ZodError) {
    return context.json({ error: { code: 'INVALID_REQUEST', message: 'Request validation failed', issues: cause.issues } }, 400)
  }
  if (cause instanceof TotpRequiredError) {
    return context.json({ error: { code: 'TOTP_REQUIRED', message: cause.message } }, 401)
  }
  if (cause instanceof AdminTokenError) {
    return context.json({ error: { code: 'INVALID_ADMIN_TOKEN', message: cause.message } }, 401)
  }
  if (cause instanceof AuthenticationError) {
    return context.json({ error: { code: 'UNAUTHORIZED', message: cause.message } }, 401)
  }
  if (cause instanceof NotFoundError) {
    return context.json({ error: { code: 'NOT_FOUND', message: cause.message } }, 404)
  }
  if (cause instanceof ConflictError) {
    return context.json({ error: { code: 'CONFLICT', message: cause.message } }, 409)
  }
  if (cause instanceof ValidationError) {
    return context.json({ error: { code: 'VALIDATION_ERROR', message: cause.message } }, 422)
  }
  return context.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
}
