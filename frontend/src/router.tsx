import { Navigate, type RouteObject } from 'react-router'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'
import { AppShell } from '@/layout/AppShell'
import { AccountsPage } from '@/pages/accounts/AccountsPage'
import { CategoriesPage } from '@/pages/categories/CategoriesPage'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { TransactionsPage } from '@/pages/transactions/TransactionsPage'

export const routes: RouteObject[] = [
  {
    element: <RedirectIfAuth />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/cadastro', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/lancamentos', element: <TransactionsPage /> },
          { path: '/contas', element: <AccountsPage /> },
          { path: '/categorias', element: <CategoriesPage /> },
          { path: '/cartoes', element: <ComingSoonPage title="Cartões" /> },
          { path: '/orcamento', element: <ComingSoonPage title="Orçamento" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]
