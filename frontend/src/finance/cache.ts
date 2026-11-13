import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/http'
import { getAccountsListQueryKey } from '@/api/generated/accounts/accounts'
import { getCategoriesListQueryKey } from '@/api/generated/categories/categories'
import { getTagsListQueryKey } from '@/api/generated/tags/tags'

/** Lançamentos mudam saldos e o painel: invalida tudo que depende deles. */
export function invalidateMoney(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: getAccountsListQueryKey() }),
    client.invalidateQueries({ queryKey: ['/api/transactions'] }),
    client.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith('/api/dashboard/'),
    }),
  ])
}

export function invalidateCatalog(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: getCategoriesListQueryKey() }),
    client.invalidateQueries({ queryKey: getTagsListQueryKey() }),
  ])
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.detail : 'Algo deu errado. Tente novamente.'
}
