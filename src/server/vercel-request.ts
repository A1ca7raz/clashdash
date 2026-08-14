const routeQuery = 'clashdashRoute'

export function restoreVercelRequestPath(request: Request): Request {
  const url = new URL(request.url)
  const route = url.searchParams.get(routeQuery)
  if (route === null) return request

  url.pathname = route ? `/api/${route.replace(/^\/+/, '')}` : '/api'
  url.searchParams.delete(routeQuery)
  return new Request(url, request)
}
