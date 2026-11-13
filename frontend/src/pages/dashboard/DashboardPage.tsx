import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { useCategoriesList } from '@/api/generated/categories/categories'
import {
  useDashboardCashflow,
  useDashboardCategories,
  useDashboardPending,
  useDashboardSummary,
  useDashboardTopExpenses,
} from '@/api/generated/dashboard/dashboard'
import { useAuth } from '@/auth/useAuth'
import { NeedleMark } from '@/components/Logo'
import { buttonVariants } from '@/components/ui/button'
import { parseMonth } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { CashflowChart } from '@/pages/dashboard/CashflowChart'
import { CategoryBreakdown } from '@/pages/dashboard/CategoryBreakdown'
import { KpiCards } from '@/pages/dashboard/KpiCards'
import { NetWorthChart } from '@/pages/dashboard/NetWorthChart'
import { PendingList, TopExpenses } from '@/pages/dashboard/TransactionLists'
import { MonthSwitcher } from '@/pages/transactions/TransactionFilters'

const keep = { query: { placeholderData: <T,>(prev: T) => prev } }

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.name.trim().split(/\s+/)[0] ?? ''
  const [params, setParams] = useSearchParams()
  const month = parseMonth(params.get('mes'))
  const setMonth = (m: string) => setParams({ mes: m }, { replace: true })

  const accounts = useAccountsList()
  const { data: categories = [] } = useCategoriesList()
  // Cada widget tem a própria query: carregam em paralelo e cada um mostra o próprio skeleton.
  const summary = useDashboardSummary({ month }, keep)
  const cashflow = useDashboardCashflow({ month }, keep)
  const breakdown = useDashboardCategories({ month }, keep)
  const top = useDashboardTopExpenses({ month }, keep)
  const pending = useDashboardPending()

  const lookups = useMemo(
    () => ({
      accounts: new Map((accounts.data ?? []).map((a) => [a.id, a])),
      categories: new Map(categories.map((c) => [c.id, c])),
    }),
    [accounts.data, categories],
  )

  const noAccounts = accounts.data?.length === 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Olá, {firstName}</h1>
          <p className="mt-1 text-muted-foreground">Como está o seu mês, em um olhar.</p>
        </div>
        {!noAccounts && <MonthSwitcher month={month} onChange={setMonth} />}
      </div>

      {noAccounts ? (
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <NeedleMark className="size-12 text-muted-foreground" />
          <h2 className="mt-5 text-lg font-semibold">Comece pela sua primeira conta</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Saldo, gastos por categoria e fluxo de caixa aparecem aqui assim que você cadastrar uma
            conta e registrar lançamentos.
          </p>
          <Link to="/contas" className={cn(buttonVariants(), 'mt-6 h-10 rounded-[10px] px-4')}>
            Cadastrar primeira conta
          </Link>
        </section>
      ) : (
        <>
          <KpiCards data={summary.data} loading={summary.isLoading} />
          <div className="grid gap-4 lg:grid-cols-3">
            <CashflowChart data={cashflow.data} loading={cashflow.isLoading} />
            <CategoryBreakdown data={breakdown.data} loading={breakdown.isLoading} />
            <NetWorthChart data={cashflow.data} loading={cashflow.isLoading} />
            <PendingList data={pending.data} loading={pending.isLoading} />
            <TopExpenses data={top.data} loading={top.isLoading} lookups={lookups} />
          </div>
        </>
      )}
    </div>
  )
}
