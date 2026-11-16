import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { BudgetItemOutStatus } from '@/api/generated/model'
import { BUDGET_STATUS } from '@/finance/labels'
import { cn } from '@/lib/utils'

const TONE: Record<BudgetItemOutStatus, { bar: string; text: string; icon: typeof CheckCircle2 }> =
  {
    ok: { bar: 'bg-primary', text: 'text-muted-foreground', icon: CheckCircle2 },
    warning: { bar: 'bg-brass', text: 'text-brass', icon: CircleAlert },
    over: { bar: 'bg-expense', text: 'text-expense', icon: AlertTriangle },
  }

/** Barra de progresso do orçamento (meter): a cor muda com a situação, sempre com rótulo. */
export function BudgetBar({
  percent,
  status,
  thin,
}: {
  percent: string
  status: BudgetItemOutStatus
  thin?: boolean
}) {
  const reduce = useReducedMotion()
  const width = Math.min(Number(percent), 100)
  return (
    <span
      aria-hidden="true"
      className={cn('block overflow-hidden rounded-full bg-muted', thin ? 'h-1.5' : 'h-2')}
    >
      <motion.span
        className={cn('block h-full rounded-full', TONE[status].bar)}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </span>
  )
}

export function BudgetStatusLabel({ status }: { status: BudgetItemOutStatus }) {
  const { text, icon: Icon } = TONE[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', text)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {BUDGET_STATUS[status]}
    </span>
  )
}
