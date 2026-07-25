export interface AdminTokenService {
  issue(username: string): Promise<string>
  verify(token: string): Promise<{ username: string }>
}
