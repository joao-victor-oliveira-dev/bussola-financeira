import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createQueryClient } from '@/queryClient'
import { routes } from '@/router'
import { ThemeProvider } from '@/theme/ThemeProvider'

type Handler = (init: RequestInit) => { status: number; body?: unknown }

/** Mocka fetch por "MÉTODO /url" e renderiza o app inteiro numa rota. */
export function renderApp(path: string, handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${(init.method ?? 'GET').toUpperCase()} ${url}`
    const handler = handlers[key]
    if (!handler)
      return new Response(JSON.stringify({ detail: `sem mock: ${key}` }), { status: 500 })
    const { status, body } = handler(init)
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'csrftoken=abc; path=/'

  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = createQueryClient()
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { router, fetchMock, queryClient }
}

export const joao = { id: 1, email: 'joao@x.com', name: 'João Silva' }
