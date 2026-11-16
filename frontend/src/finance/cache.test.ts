import { QueryClient } from '@tanstack/react-query'
import { invalidateCatalog, invalidateMoney } from '@/finance/cache'

function client() {
  const c = new QueryClient()
  for (const key of ['/api/dashboard/categories', '/api/categories', '/api/transactions'])
    c.setQueryData([key], [])
  return c
}

const stale = (c: QueryClient, key: string) => c.getQueryState([key])?.isInvalidated

it('mudar categorias/tags também invalida o painel (nomes e cores)', async () => {
  const c = client()
  await invalidateCatalog(c)
  expect(stale(c, '/api/dashboard/categories')).toBe(true)
  expect(stale(c, '/api/categories')).toBe(true)
})

it('mudar lançamentos invalida lista e painel', async () => {
  const c = client()
  await invalidateMoney(c)
  expect(stale(c, '/api/transactions')).toBe(true)
  expect(stale(c, '/api/dashboard/categories')).toBe(true)
})

it('mudar lançamentos também invalida cartões (limite e fatura)', async () => {
  const c = new QueryClient()
  c.setQueryData(['/api/cards'], [])
  c.setQueryData(['/api/cards/3/invoices/2026-11'], {})
  await invalidateMoney(c)
  expect(c.getQueryState(['/api/cards'])?.isInvalidated).toBe(true)
  expect(c.getQueryState(['/api/cards/3/invoices/2026-11'])?.isInvalidated).toBe(true)
})
