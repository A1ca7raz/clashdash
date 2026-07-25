export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

const tokenKey = 'clashdash.admin-token'

export function getAdminToken(): string | null { return localStorage.getItem(tokenKey) }
export function setAdminToken(token: string): void {
  localStorage.setItem(tokenKey, token)
  window.dispatchEvent(new Event('clashdash-auth'))
}
export function clearAdminToken(): void {
  localStorage.removeItem(tokenKey)
  window.dispatchEvent(new Event('clashdash-auth'))
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string } } | undefined
    const code = payload?.error?.code ?? 'REQUEST_FAILED'
    if (response.status === 401 && code === 'INVALID_ADMIN_TOKEN') clearAdminToken()
    throw new ApiError(response.status, code, payload?.error?.message ?? `HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return api(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
export function put<T>(path: string, body: unknown): Promise<T> {
  return api(path, { method: 'PUT', body: JSON.stringify(body) })
}
export function remove(path: string): Promise<void> { return api(path, { method: 'DELETE' }) }
