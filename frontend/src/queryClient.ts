import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query'
import { ApiError } from '@/api/http'
import { getAuthMeQueryKey } from '@/api/generated/auth/auth'

export const ME_KEY = getAuthMeQueryKey()

const isMeKey = (key: QueryKey) => key[0] === ME_KEY[0]

/** Sessão expirou: limpa dados do usuário e zera o "me". RequireAuth leva ao /login. */
function handleUnauthorized(client: QueryClient) {
  client.removeQueries({ predicate: (q) => !isMeKey(q.queryKey) })
  client.setQueryData(ME_KEY, null)
}

const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isUnauthorized(error) && !isMeKey(query.queryKey)) handleUnauthorized(client)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        // 401 no login é "senha errada", não sessão expirada: só reage se havia usuário logado.
        if (isUnauthorized(error) && client.getQueryData(ME_KEY)) handleUnauthorized(client)
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  })
  return client
}
