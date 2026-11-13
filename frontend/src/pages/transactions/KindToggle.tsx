import { motion, useReducedMotion } from 'motion/react'
import type { TransactionOutKind } from '@/api/generated/model'
import { cn } from '@/lib/utils'

const OPTIONS: { value: TransactionOutKind; label: string; active: string }[] = [
  { value: 'expense', label: 'Despesa', active: 'text-expense' },
  { value: 'income', label: 'Receita', active: 'text-income' },
  { value: 'transfer', label: 'Transferência', active: 'text-primary' },
]

/** Seletor segmentado de tipo; o indicador desliza entre as opções. */
export function KindToggle({
  value,
  onChange,
}: {
  value: TransactionOutKind
  onChange: (kind: TransactionOutKind) => void
}) {
  const reduce = useReducedMotion()
  return (
    <div
      role="radiogroup"
      aria-label="Tipo"
      className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
    >
      {OPTIONS.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-9 rounded-lg text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              selected && o.active,
            )}
          >
            {selected && (
              <motion.span
                layoutId="kind-indicator"
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }
                }
                className="absolute inset-0 rounded-lg bg-card shadow-sm ring-1 ring-border"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
