import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

it('o primeiro Tab leva ao link "Pular para o conteúdo"', async () => {
  renderApp('/contas', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/accounts': () => ({ status: 200, body: [] }),
  })
  await screen.findByRole('heading', { name: 'Contas' })
  await userEvent.tab()
  const skip = screen.getByRole('link', { name: 'Pular para o conteúdo' })
  expect(skip).toHaveFocus()
  expect(skip).toHaveAttribute('href', '#conteudo')
  expect(document.getElementById('conteudo')?.tagName).toBe('MAIN')
})
