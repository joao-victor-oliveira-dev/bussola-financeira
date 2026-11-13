const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  const value = match?.slice(name.length + 1)
  return value ? decodeURIComponent(value) : null
}

function detailFrom(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  // Erros de validação do Ninja: { detail: [{ msg, loc, ... }] }
  if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg
  return status >= 500 ? 'Erro no servidor. Tente novamente.' : 'Não foi possível concluir a ação.'
}

/** Mutator do orval: sessão por cookie + CSRF em métodos que alteram dados. */
export async function customFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!SAFE_METHODS.has(method)) {
    const token = readCookie('csrftoken')
    if (token) headers.set('X-CSRFToken', token)
  }
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(url, { ...init, method, headers, credentials: 'include' })
  if (response.status === 204) return undefined as T

  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) throw new ApiError(response.status, detailFrom(body, response.status))
  return body as T
}

export async function ensureCsrf(): Promise<void> {
  if (readCookie('csrftoken')) return
  await fetch('/api/auth/csrf', { credentials: 'include' })
}
