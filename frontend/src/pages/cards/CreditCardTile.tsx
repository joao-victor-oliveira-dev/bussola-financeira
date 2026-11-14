import { motion, useReducedMotion } from 'motion/react'
import type { CardOut } from '@/api/generated/model'
import { Money } from '@/components/Money'
import { INVOICE_STATUS } from '@/finance/labels'
import { formatShortDate } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/utils'

/** Cartão "físico": a cor do cartão em degradê, com a fatura atual e o limite usado abaixo. */
export function CreditCardTile({
  card,
  index,
  selected,
  onOpen,
}: {
  card: CardOut
  index: number
  selected: boolean
  onOpen: () => void
}) {
  const reduce = useReducedMotion()
  const inv = card.current_invoice
  const used = Number(card.limit) > 0 ? Number(card.limit_used) / Number(card.limit) : 0
  const tone = used >= 1 ? 'bg-expense' : used >= 0.8 ? 'bg-brass' : 'bg-primary'

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.05, ease: 'easeOut' }}
      className="grid gap-3"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        style={{
          backgroundImage: `linear-gradient(135deg, ${card.color} 0%, color-mix(in oklab, ${card.color} 45%, #0b1114) 100%)`,
        }}
        className={cn(
          'relative flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-2xl p-5 text-left text-white shadow-lg ring-offset-2 ring-offset-background transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:hover:-translate-y-0.5',
          selected && 'ring-2 ring-foreground',
        )}
      >
        {/* brilho sutil, como em plástico de cartão */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/2 -right-1/4 size-full rounded-full bg-white/10 blur-2xl"
        />
        <span className="relative flex items-start justify-between gap-3">
          <span className="text-lg font-semibold tracking-tight">{card.name}</span>
          <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">
            {INVOICE_STATUS[inv.status]}
          </span>
        </span>
        <span className="relative grid gap-0.5">
          <span className="text-xs text-white/75">Fatura atual</span>
          <Money value={inv.total} className="text-2xl font-semibold tracking-tight" />
          <span className="text-xs text-white/75">
            Fecha {formatShortDate(inv.closing_date)} · vence {formatShortDate(inv.due_date)}
          </span>
        </span>
      </button>
      <div className="grid gap-1.5 px-1">
        <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.span
            className={cn('block h-full rounded-full', tone)}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${Math.min(used, 1) * 100}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </span>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatBRL(card.limit_used)} de {formatBRL(card.limit)} usados
        </p>
      </div>
    </motion.div>
  )
}
