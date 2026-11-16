import { screen } from '@testing-library/react'
import { joao, renderApp } from '@/test/renderApp'

vi.mock('@/pages/accounts/AccountsPage', () => ({
  AccountsPage: () => {
    throw new Error('quebrou')
  },
}))

afterEach(() => vi.unstubAllGlobals())

it('erro numa página mantém o menu (o usuário consegue sair dali)', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  renderApp('/contas', { 'GET /api/auth/me': () => ({ status: 200, body: joao }) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar')
  expect(screen.getAllByRole('navigation', { name: 'Principal' }).length).toBeGreaterThan(0)
})
