import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { SummaryOut } from '@/api/generated/model'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/money'
import { useCountUp } from '@/lib/useCountUp'
import { cn } from '@/lib/utils'

const pct = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

type Delta = { text: string; good: boolean; up: boolean } | null

function relative(current: string, previous: string, higherIsGood: boolean): Delta {
  const prev = Number(previous)
  if (!prev) return null
  const change = ((Number(current) - prev) / prev) * 100
  if (!Number.isFinite(change) || change === 0) return null
  return { text: `${pct.format(change)}%`, good: change > 0 === higherIsGood, up: change > 0 }
}

function points(current: string | null, previous: string | null): Delta {
  if (current === null || previous === null) return null
  const change = Number(current) - Number(previous)
  if (change === 0) return null
  return { text: `${pct.format(change)} p.p.`, good: change > 0, up: change > 0 }
}

function Kpi({
  label,
  value,
  format,
  delta,
  hint,
  emphasis,
}: {
  label: string
  value: number | null
  format: (n: number) => string
  delta?: Delta
  hint: string
  emphasis?: boolean
}) {
  const animated = useCountUp(value ?? 0)
  const Arrow = delta?.up ? ArrowUpRight : ArrowDownRight
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5',
        emphasis && 'col-span-2 bg-surface-raised lg:col-span-1',
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'font-semibold tracking-tight tabular-nums',
          emphasis ? 'text-3xl' : 'text-xl sm:text-2xl',
        )}
      >
        {value === null ? '—' : format(animated)}
      </p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {delta ? (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                delta.good ? 'text-income' : 'text-expense',
              )}
            >
              <Arrow aria-hidden="true" className="size-3.5" />
              {delta.text}
            </span>
            <span>{hint}</span>
          </>
        ) : (
          <span>{hint}</span>
        )}
      </p>
    </div>
  )
}

const rateFmt = (n: number) =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

export function KpiCards({ data, loading }: { data?: SummaryOut; loading: boolean }) {
  if (loading || !data)
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )
  const vsPrev = 'vs mês anterior'
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi
        label="Saldo total"
        value={Number(data.balance)}
        format={formatBRL}
        hint="em todas as contas, hoje"
        emphasis
      />
      <Kpi
        label="Receitas"
        value={Number(data.income)}
        format={formatBRL}
        delta={relative(data.income, data.previous.income, true)}
        hint={vsPrev}
      />
      <Kpi
        label="Despesas"
        value={Number(data.expense)}
        format={formatBRL}
        delta={relative(data.expense, data.previous.expense, false)}
        hint={vsPrev}
      />
      <Kpi
        label="Taxa de poupança"
        value={data.savings_rate === null ? null : Number(data.savings_rate)}
        format={rateFmt}
        delta={points(data.savings_rate, data.previous.savings_rate)}
        hint={data.savings_rate === null ? 'sem receitas no mês' : vsPrev}
      />
    </div>
  )
}
