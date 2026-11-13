import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { authLogout, authMe } from '@/api/generated/auth/auth'
import type { UserOut } from '@/api/generated/model'
import { ApiError } from '@/api/http'
import { ME_KEY } from '@/queryClient'

async function fetchMeOrNull(): Promise<UserOut | null> {
  try {
    return await authMe()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function useAuth() {
  const client = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMeOrNull,
    staleTime: Infinity,
  })

  const setUser = useCallback((user: UserOut | null) => client.setQueryData(ME_KEY, user), [client])

  const logout = useCallback(async () => {
    try {
      await authLogout()
    } finally {
      client.clear()
      client.setQueryData(ME_KEY, null)
    }
  }, [client])

  return { user: data ?? null, isLoading, setUser, logout }
}
