import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { RouteError } from '@/components/RouteError'

function Boom({ error }: { error: Error }): never {
  throw error
}

function renderWith(error: Error) {
  const router = createMemoryRouter([
    { path: '/', element: <Boom error={error} />, errorElement: <RouteError /> },
  ])
  render(<RouterProvider router={router} />)
}

const reload = vi.fn()

beforeEach(() => {
  reload.mockReset()
  sessionStorage.clear()
  vi.stubGlobal('location', { ...window.location, reload })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

it('chunk que sumiu após um deploy: recarrega uma vez sozinho', () => {
  renderWith(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
  expect(reload).toHaveBeenCalledTimes(1)
})

it('se já recarregou, não entra em loop: mostra a mensagem com botão', async () => {
  sessionStorage.setItem('bussola:chunk-reload', String(Date.now()))
  renderWith(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
  expect(reload).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar esta página')
  await userEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
  expect(reload).toHaveBeenCalledTimes(1)
})

it('outro erro não recarrega sozinho', () => {
  renderWith(new Error('bug qualquer'))
  expect(reload).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

it('CSS de chunk que sumiu (preload do Vite) também recarrega sozinho', () => {
  renderWith(new Error('Unable to preload CSS for /assets/BudgetPage-abc.css'))
  expect(reload).toHaveBeenCalledTimes(1)
})
