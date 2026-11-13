import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const loggedOut = { 'GET /api/auth/me': () => ({ status: 401, body: { detail: 'x' } }) }

it('valida e-mail e senha antes de enviar', async () => {
  const { fetchMock } = renderApp('/login', loggedOut)
  await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
  expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument()
  expect(screen.getByText('A senha deve ter ao menos 8 caracteres.')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/login', expect.anything())
})

it("login ok navega para / e mostra 'Olá, João'", async () => {
  let logged = false
  const { router } = renderApp('/login', {
    'GET /api/auth/me': () =>
      logged ? { status: 200, body: joao } : { status: 401, body: { detail: 'x' } },
    'POST /api/auth/login': (init) => {
      expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc')
      logged = true
      return { status: 200, body: joao }
    },
  })
  await userEvent.type(await screen.findByLabelText('E-mail'), 'joao@x.com')
  await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(await screen.findByText('Olá, João')).toBeInTheDocument()
})

it("login 401 mostra 'E-mail ou senha inválidos.'", async () => {
  renderApp('/login', {
    ...loggedOut,
    'POST /api/auth/login': () => ({ status: 401, body: { detail: 'E-mail ou senha inválidos.' } }),
  })
  await userEvent.type(await screen.findByLabelText('E-mail'), 'joao@x.com')
  await userEvent.type(screen.getByLabelText('Senha'), 'senha-errada-1')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
})

it('cadastro cria a conta e entra no app', async () => {
  const { router } = renderApp('/cadastro', {
    ...loggedOut,
    'POST /api/auth/register': () => ({ status: 201, body: joao }),
  })
  await userEvent.type(await screen.findByLabelText('Nome'), 'João Silva')
  await userEvent.type(screen.getByLabelText('E-mail'), 'joao@x.com')
  await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123')
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
})
