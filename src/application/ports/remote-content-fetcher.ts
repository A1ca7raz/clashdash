export interface RemoteContentFetcher {
  fetch(url: string): Promise<string>
}
