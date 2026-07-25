import type { RemoteContentFetcher } from '../../application/ports/remote-content-fetcher.ts'

export type NodeFetcherOptions = {
  timeoutMs?: number
  maximumBytes?: number
  userAgent?: string
}

export class NodeFetcher implements RemoteContentFetcher {
  private readonly timeoutMs: number
  private readonly maximumBytes: number
  private readonly userAgent: string

  constructor(options: NodeFetcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maximumBytes = options.maximumBytes ?? 10 * 1024 * 1024
    this.userAgent = options.userAgent ?? 'ClashDash/0.1'
  }

  async fetch(url: string): Promise<string> {
    const target = new URL(url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error(`Unsupported Provider URL protocol: ${target.protocol}`)
    }
    const response = await fetch(target, {
      headers: { 'user-agent': this.userAgent, accept: 'text/yaml,text/plain,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`Provider request failed with HTTP ${response.status}`)
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > this.maximumBytes) {
      throw new Error(`Provider response exceeds ${this.maximumBytes} bytes`)
    }
    if (!response.body) return ''

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > this.maximumBytes) {
        await reader.cancel()
        throw new Error(`Provider response exceeds ${this.maximumBytes} bytes`)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
}
