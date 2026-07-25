import cron, { type ScheduledTask } from 'node-cron'

import type { ProviderScheduler } from '../../application/ports/provider-scheduler.ts'
import type { ImportProvider } from '../../domain/models/provider.ts'

type ScheduledHandle =
  | { type: 'cron'; task: ScheduledTask }
  | { type: 'timer'; timer: NodeJS.Timeout }

export class NodeCronScheduler implements ProviderScheduler {
  private readonly handles = new Map<string, ScheduledHandle>()

  constructor(private readonly refresh: (providerId: string) => Promise<unknown>) {}

  schedule(provider: ImportProvider): void {
    this.remove(provider.id)
    const expression = cronExpressionForInterval(provider.interval)
    if (expression) {
      const task = cron.schedule(expression, () => { void this.refresh(provider.id).catch(() => undefined) })
      this.handles.set(provider.id, { type: 'cron', task })
    } else {
      const timer = setInterval(() => { void this.refresh(provider.id).catch(() => undefined) }, provider.interval * 1000)
      timer.unref()
      this.handles.set(provider.id, { type: 'timer', timer })
    }
  }

  remove(providerId: string): void {
    const handle = this.handles.get(providerId)
    if (!handle) return
    if (handle.type === 'cron') void handle.task.destroy()
    else clearInterval(handle.timer)
    this.handles.delete(providerId)
  }

  shutdown(): void {
    for (const providerId of [...this.handles.keys()]) this.remove(providerId)
  }
}

export function cronExpressionForInterval(seconds: number): string | undefined {
  if (!Number.isInteger(seconds) || seconds <= 0) return undefined
  if (seconds < 60 && 60 % seconds === 0) return `*/${seconds} * * * * *`
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    if (minutes < 60 && 60 % minutes === 0) return `0 */${minutes} * * * *`
    if (minutes % 60 === 0) {
      const hours = minutes / 60
      if (hours < 24 && 24 % hours === 0) return `0 0 */${hours} * * *`
    }
  }
  return undefined
}
