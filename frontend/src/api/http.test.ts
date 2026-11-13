import { ApiError, customFetch, ensureCsrf } from '@/api/http'

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  document.cookie = 'csrftoken=abc; path=/'
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

it('envia X-CSRFToken em POST', async () => {
  const fetchMock = mockFetch(200, { ok: true })
  await customFetch('/api/auth/login', { method: 'POST', body: '{}' })
  const init = fetchMock.mock.calls[0][1] as RequestInit
  expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc')
  expect(init.credentials).toBe('include')
})

it('não envia CSRF em GET', async () => {
  const fetchMock = mockFetch(200, {})
  await customFetch('/api/auth/me', { method: 'GET' })
  const init = fetchMock.mock.calls[0][1] as RequestInit
  expect(new Headers(init.headers).has('X-CSRFToken')).toBe(false)
})

it('lança ApiError com detail', async () => {
  mockFetch(401, { detail: 'x' })
  await expect(customFetch('/api/auth/me', { method: 'GET' })).rejects.toMatchObject({
    status: 401,
    detail: 'x',
  })
  mockFetch(401, { detail: 'x' })
  await expect(customFetch('/api/auth/me', { method: 'GET' })).rejects.toBeInstanceOf(ApiError)
})

it('erro de validação do Ninja vira mensagem legível', async () => {
  mockFetch(422, { detail: [{ msg: 'value is not a valid email address' }] })
  await expect(customFetch('/api/x', { method: 'POST' })).rejects.toMatchObject({
    status: 422,
    detail: 'value is not a valid email address',
  })
})

it('204 resolve undefined', async () => {
  mockFetch(204)
  await expect(customFetch('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
})

it('ensureCsrf busca o cookie só quando não existe', async () => {
  const fetchMock = mockFetch(200, { detail: 'ok' })
  await ensureCsrf()
  expect(fetchMock).not.toHaveBeenCalled()
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  await ensureCsrf()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/csrf',
    expect.objectContaining({ credentials: 'include' }),
  )
})

it('resposta não-JSON (ex.: 502 do proxy) vira ApiError legível', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })),
  )
  await expect(customFetch('/api/x', { method: 'GET' })).rejects.toMatchObject({
    status: 502,
    detail: 'Erro no servidor. Tente novamente.',
  })
})
