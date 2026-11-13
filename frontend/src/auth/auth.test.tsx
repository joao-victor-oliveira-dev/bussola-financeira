import { screen, waitFor } from '@testing-library/react'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

it('sem sessão, / redireciona para /login', async () => {
  const { router } = renderApp('/', {
    'GET /api/auth/me': () => ({ status: 401, body: { detail: 'x' } }),
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
})

it('logado, /login redireciona para /', async () => {
  const { router } = renderApp('/login', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(await screen.findByText('Olá, João')).toBeInTheDocument()
})

it('logado, /cadastro redireciona para /', async () => {
  const { router } = renderApp('/cadastro', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
})

it('401 em query qualquer leva para /login', async () => {
  const { router, queryClient } = renderApp('/', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/qualquer': () => ({ status: 401, body: { detail: 'sessão expirou' } }),
  })
  await screen.findByText('Olá, João')
  const { customFetch } = await import('@/api/http')
  await queryClient
    .fetchQuery({ queryKey: ['/api/qualquer'], queryFn: () => customFetch('/api/qualquer') })
    .catch(() => {})
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
})

it('sair encerra a sessão e volta ao login', async () => {
  const { router, fetchMock } = renderApp('/', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'POST /api/auth/logout': () => ({ status: 204 }),
  })
  const userEvent = (await import('@testing-library/user-event')).default
  await userEvent.click(await screen.findByRole('button', { name: 'Sair' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.anything())
})
