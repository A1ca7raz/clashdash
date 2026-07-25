export class ProviderLock {
  private readonly queues = new Map<string, Promise<void>>()

  async run<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(providerId) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => current)
    this.queues.set(providerId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(providerId) === tail) this.queues.delete(providerId)
    }
  }
}
