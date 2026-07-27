export type RemoteContentFetchOptions = {
  userAgent?: string
  headers?: Readonly<Record<string, readonly string[]>>
}

export interface RemoteContentFetcher {
  fetch(url: string, options?: RemoteContentFetchOptions): Promise<string>
}
