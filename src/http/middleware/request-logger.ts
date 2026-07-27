import type { MiddlewareHandler } from 'hono'

export type HttpRequestLog = {
  method: string
  path: string
  status: number
  durationMs: number
}

export function requestLogger(write: (entry: HttpRequestLog) => void): MiddlewareHandler {
  return async (context, next) => {
    const startedAt = performance.now()
    await next()
    write({
      method: context.req.method,
      path: requestPath(context.req.url),
      status: context.res.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    })
  }
}

export function requestPath(url: string): string {
  try { return new URL(url).pathname }
  catch { return '/' }
}
