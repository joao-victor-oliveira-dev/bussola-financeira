import { type ComponentType, lazy, Suspense } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'
import { RouteError } from '@/components/RouteError'
import { Skeleton } from '@/components/ui/skeleton'
import { AppShell } from '@/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { registerPage } from '@/preload'

/**
 * Cada página vira um chunk próprio (o Recharts, por exemplo, só baixa no painel).
 * O login fica no pacote inicial: é a primeira tela de quem chega.
 */
function page(load: () => Promise<ComponentType>) {
  registerPage(load)
  const Page = lazy(async () => ({ default: await load() }))
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="grid gap-4">
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      }
    >
      <Page />
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <RedirectIfAuth />,
        children: [
          { path: '/login', element: <LoginPage /> },
          {
            path: '/cadastro',
            element: page(async () => (await import('@/pages/RegisterPage')).RegisterPage),
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            errorElement: <RouteError />,
            children: [
              {
                path: '/',
                element: page(
                  async () => (await import('@/pages/dashboard/DashboardPage')).DashboardPage,
                ),
              },
              {
                path: '/lancamentos',
                element: page(
                  async () =>
                    (await import('@/pages/transactions/TransactionsPage')).TransactionsPage,
                ),
              },
              {
                path: '/contas',
                element: page(
                  async () => (await import('@/pages/accounts/AccountsPage')).AccountsPage,
                ),
              },
              {
                path: '/categorias',
                element: page(
                  async () => (await import('@/pages/categories/CategoriesPage')).CategoriesPage,
                ),
              },
              {
                path: '/recorrencias',
                element: page(
                  async () => (await import('@/pages/recurring/RecurringPage')).RecurringPage,
                ),
              },
              {
                path: '/importar',
                element: page(async () => (await import('@/pages/import/ImportPage')).ImportPage),
              },
              {
                path: '/cartoes',
                element: page(async () => (await import('@/pages/cards/CardsPage')).CardsPage),
              },
              {
                path: '/orcamento',
                element: page(async () => (await import('@/pages/budget/BudgetPage')).BudgetPage),
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
