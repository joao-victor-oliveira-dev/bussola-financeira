import { useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useBudgetsCopy, useBudgetsOverview } from '@/api/generated/budgets/budgets'
import { useCategoriesList } from '@/api/generated/categories/categories'
import type { BudgetItemOut } from '@/api/generated/model'
import { LoadError } from '@/components/charts/ChartCard'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, invalidateBudgets } from '@/finance/cache'
import { parseMonth } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BudgetFormDialog, type BudgetDialogState } from '@/pages/budget/BudgetFormDialog'
import { BudgetBar, BudgetStatusLabel } from '@/pages/budget/BudgetMeter'
import { MonthSwitcher } from '@/pages/transactions/TransactionFilters'

function remainingText(item: Pick<BudgetItemOut, 'remaining'>): string {
  const r = Number(item.remaining)
  if (r > 0) return `Faltam ${formatBRL(item.remaining)}`
  if (r === 0) return 'Limite atingido'
  return `${formatBRL(-r)} acima`
}

export function BudgetPage() {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const month = parseMonth(params.get('mes'))
  const overview = useBudgetsOverview({ month }, { query: { placeholderData: (prev) => prev } })
  const { data: categories = [] } = useCategoriesList()
  const copy = useBudgetsCopy()
  const [dialog, setDialog] = useState<BudgetDialogState>({
    open: false,
    budget: null,
    categoryId: null,
  })

  const data = overview.data
  const budgeted = new Set(data?.items.map((i) => i.category_id))
  const available = categories
    .filter((c) => c.kind === 'expense' && c.parent_id === null && !budgeted.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const openNew = (categoryId: number | null = null) =>
    setDialog({ open: true, budget: null, categoryId })

  const onCopy = async () => {
    try {
      const { created } = await copy.mutateAsync({ data: { to_month: month } })
      await invalidateBudgets(client)
      if (created) toast.success(`${created} orçamento(s) copiado(s) do mês anterior.`)
      else toast.info('O mês anterior não tem orçamentos para copiar.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Orçamento"
        description="Quanto você quer gastar por categoria e quanto já foi."
        actions={
          <Button onClick={() => openNew()} className="h-10 rounded-[10px] px-4">
            <Plus aria-hidden="true" />
            Novo orçamento
          </Button>
        }
      />

      <MonthSwitcher month={month} onChange={(m) => setParams({ mes: m }, { replace: true })} />

      {overview.isError && !data ? (
        <LoadError onRetry={() => overview.refetch()} />
      ) : !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : data.items.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <Target aria-hidden="true" className="size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Nenhum orçamento neste mês</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Defina um limite por categoria e acompanhe o quanto já foi gasto.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={onCopy} disabled={copy.isPending}>
              <Copy aria-hidden="true" />
              Copiar do mês anterior
            </Button>
            <Button onClick={() => openNew()}>
              <Plus aria-hidden="true" />
              Criar orçamento
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section
            data-testid="budget-total"
            className="grid gap-3 rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Total do mês</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatBRL(data.totals.spent)}{' '}
                  <span className="text-base font-normal text-muted-foreground">
                    de {formatBRL(data.totals.limit)}
                  </span>
                </p>
              </div>
              <span
                className={cn(
                  'text-sm font-medium tabular-nums',
                  Number(data.totals.remaining) < 0 && 'text-expense',
                )}
              >
                {remainingText(data.totals)}
              </span>
            </div>
            <BudgetBar percent={data.totals.percent} status={data.totals.status} />
          </section>

          <ul className="grid gap-3 sm:grid-cols-2">
            {data.items.map((item) => (
              <li
                key={item.id}
                aria-label={`${item.category_name}: ${item.percent}%`}
                className="rounded-2xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => setDialog({ open: true, budget: item, categoryId: null })}
                  className="grid w-full gap-3 rounded-2xl p-5 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium">
                      <span className="sr-only">Editar orçamento de</span> {item.category_name}
                    </span>
                    <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                      {item.percent.replace('.', ',')}%
                    </span>
                  </span>
                  <BudgetBar percent={item.percent} status={item.status} />
                  <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums">
                      {formatBRL(item.spent)}{' '}
                      <span className="text-muted-foreground">de {formatBRL(item.limit)}</span>
                    </span>
                    <BudgetStatusLabel status={item.status} />
                  </span>
                  <span className="text-xs text-muted-foreground">{remainingText(item)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {data && data.unbudgeted.length > 0 && (
        <section aria-label="Gastos sem orçamento" className="grid gap-3">
          <h2 className="font-semibold">Gastos sem orçamento</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {data.unbudgeted.map((u) => (
              <li key={u.category_id} className="flex items-center gap-3 px-5 py-3">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: u.color }}
                />
                <span className="flex-1 font-medium">{u.category_name}</span>
                <Money value={u.spent} tone="expense" className="text-sm font-semibold" />
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Definir limite para ${u.category_name}`}
                  onClick={() => openNew(u.category_id)}
                >
                  Definir limite
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BudgetFormDialog
        state={dialog}
        month={month}
        available={
          dialog.categoryId
            ? categories
                .filter((c) => c.id === dialog.categoryId || available.includes(c))
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            : available
        }
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  )
}
