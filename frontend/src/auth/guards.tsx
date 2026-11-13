import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { FullScreenLoader } from '@/components/FullScreenLoader'

type FromState = { from?: string } | null

export function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RedirectIfAuth() {
  const { user, isLoading } = useAuth()
  const from = (useLocation().state as FromState)?.from
  if (isLoading) return <FullScreenLoader />
  if (user) return <Navigate to={from ?? '/'} replace />
  return <Outlet />
}
