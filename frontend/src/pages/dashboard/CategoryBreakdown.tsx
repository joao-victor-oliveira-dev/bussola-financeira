import { ChevronRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { CategorySlice } from '@/api/generated/model'
import { ChartCard } from '@/components/charts/ChartCard'
import { formatBRL, sumMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const share = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

function Bar({ ratio, thin }: { ratio: number; thin?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <span aria-hidden="true" className={cn('block rounded-full bg-muted', thin ? 'h-1' : 'h-1.5')}>
      <motion.span
        className="block h-full rounded-full bg-chart-expense"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.max(ratio * 100, 1.5)}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </span>
  )
}

/** Ranking de despesas por categoria principal; clique mostra as subcategorias. */
export function CategoryBreakdown({ data, loading }: { data?: CategorySlice[]; loading: boolean }) {
  const [open, setOpen] = useState<number | null | 'none'>('none')
  const slices = [...(data ?? [])].sort((a, b) => Number(b.total) - Number(a.total))
  const total = Number(sumMoney(slices.map((s) => s.total)))
  const max = Math.max(...slices.map((s) => Number(s.total)), 1)

  return (
    <ChartCard
      title="Despesas por categoria"
      description={total ? `Total de ${formatBRL(total)} no mês` : undefined}
      loading={loading}
      empty={!loading && slices.length === 0}
      emptyText="Nenhuma despesa neste mês."
    >
      <ul className="grid gap-1">
        {slices.map((s) => {
          const value = Number(s.total)
          const expanded = open === s.id
          const canExpand = s.children.length > 0
          return (
            <li key={s.id ?? 'none'}>
              <button
                type="button"
                aria-label={`${s.name}: ${formatBRL(s.total)}, ${share.format(value / total)} das despesas`}
                aria-expanded={canExpand ? expanded : undefined}
                disabled={!canExpand}
                onClick={() => setOpen(expanded ? 'none' : s.id)}
                className="grid w-full gap-1.5 rounded-lg px-2 py-2 text-left transition-colors enabled:hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate font-medium">{s.name}</span>
                  {canExpand && (
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                  )}
                  <span className="ml-auto tabular-nums">{formatBRL(s.total)}</span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {share.format(value / total)}
                  </span>
                </span>
                <Bar ratio={value / max} />
              </button>
              {expanded && (
                <ul className="mb-1 ml-5 grid gap-2 border-l border-border py-1 pl-3">
                  {s.children.map((c) => (
                    <li key={c.id} className="grid gap-1 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-muted-foreground">{c.name}</span>
                        <span className="ml-auto tabular-nums">{formatBRL(c.total)}</span>
                      </span>
                      <Bar ratio={Number(c.total) / max} thin />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}
