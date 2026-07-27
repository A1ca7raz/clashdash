import type { HttpRequestLog } from '../http/middleware/request-logger.ts'
import type { ProviderRefreshLog } from '../application/providers/provider-refresh-service.ts'

type LogValue = boolean | number | string
type LogFields = Record<string, LogValue | undefined>

export const runtimeLogger = {
  info(event: string, fields: LogFields = {}) { write('info', event, fields) },
  request(entry: HttpRequestLog) {
    const level = entry.status >= 500 ? 'error' : entry.status >= 400 ? 'warn' : 'info'
    write(level, 'http.request', entry)
  },
  unexpectedHttpError(cause: unknown, method: string, path: string) {
    write('error', 'http.unhandled_error', { method, path }, cause)
  },
  providerRefresh(entry: ProviderRefreshLog) {
    write(entry.status === 'failed' ? 'error' : 'info', 'provider.refresh', {
      providerId: entry.providerId,
      status: entry.status,
      durationMs: entry.durationMs,
      nodeCount: entry.status === 'succeeded' ? entry.nodeCount : undefined,
    }, entry.status === 'failed' ? entry.cause : undefined)
  },
}

function write(level: 'error' | 'info' | 'warn', event: string, fields: LogFields, cause?: unknown): void {
  const record = {
    time: new Date().toISOString(),
    level,
    event,
    ...withoutUndefined(fields),
    ...(cause === undefined ? {} : { error: serializeError(cause) }),
  }
  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function withoutUndefined(fields: LogFields): Record<string, LogValue> {
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, LogValue] => entry[1] !== undefined),
  )
}

function serializeError(cause: unknown): { name: string; message: string; stack?: string } {
  if (!(cause instanceof Error)) return { name: 'Error', message: String(cause) }
  return {
    name: cause.name,
    message: cause.message,
    ...(cause.stack ? { stack: cause.stack } : {}),
  }
}
