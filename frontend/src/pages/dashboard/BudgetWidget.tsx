import { Link } from 'react-router'
import type { BudgetOverviewOut } from '@/api/generated/model'
import { ChartCard, type WidgetState } from '@/components/charts/ChartCard'
import { buttonVariants } from '@/components/ui/button'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BudgetBar, BudgetStatusLabel } from '@/pages/budget/BudgetMeter'

/** As 5 categorias mais perto (ou além) do limite no mês. */
export function BudgetWidget({
  data,
  month,
  loading,
  error,
  onRetry,
}: { data?: BudgetOverviewOut; month: string } & WidgetState) {
  const top = [...(data?.items ?? [])]
    .sort((a, b) => Number(b.percent) - Number(a.percent))
    .slice(0, 5)
  const link = `/orcamento?mes=${month}`

  return (
    <ChartCard
      title="Orçamento do mês"
      description={
        data && top.length
          ? `${formatBRL(data.totals.spent)} de ${formatBRL(data.totals.limit)}`
          : undefined
      }
      loading={loading}
      error={error}
      onRetry={onRetry}
      actions={
        top.length > 0 && (
          <Link to={link} className="text-sm font-medium text-primary hover:underline">
            Ver orçamento
          </Link>
        )
      }
    >
      {top.length === 0 ? (
        <div className="grid min-h-32 flex-1 place-items-center gap-3 text-center text-sm text-muted-foreground">
          <p>Defina limites por categoria para acompanhar o mês.</p>
          <Link to={link} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Definir orçamento
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {top.map((item) => (
            <li
              key={item.id}
              aria-label={`${item.category_name}: ${item.percent}%`}
              className="grid gap-1.5"
            >
              <span className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate font-medium">{item.category_name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatBRL(item.spent)} / {formatBRL(item.limit)}
                </span>
              </span>
              <BudgetBar percent={item.percent} status={item.status} thin />
              <BudgetStatusLabel status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}
