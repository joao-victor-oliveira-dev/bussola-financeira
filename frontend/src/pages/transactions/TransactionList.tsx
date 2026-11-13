import { ArrowLeftRight, MoreHorizontal } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { AccountOut, CategoryOut, TagOut, TransactionOut } from '@/api/generated/model'
import { Money } from '@/components/Money'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDayHeader } from '@/lib/dates'

export type TxActions = {
  edit: (tx: TransactionOut) => void
  duplicate: (tx: TransactionOut) => void
  markPaid: (tx: TransactionOut) => void
  remove: (tx: TransactionOut) => void
}

type Lookups = {
  accounts: Map<number, AccountOut>
  categories: Map<number, CategoryOut>
  tags: Map<number, TagOut>
}

function groupByDay(items: TransactionOut[]): [string, TransactionOut[]][] {
  const groups = new Map<string, TransactionOut[]>()
  for (const tx of items) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
  return [...groups]
}

export function TransactionList({
  items,
  lookups,
  actions,
}: {
  items: TransactionOut[]
  lookups: Lookups
  actions: TxActions
}) {
  const reduce = useReducedMotion()
  return (
    <div className="grid gap-6">
      <AnimatePresence initial={false} mode="popLayout">
        {groupByDay(items).map(([day, txs]) => {
          const headingId = `dia-${day}`
          return (
            <motion.section
              key={day}
              aria-labelledby={headingId}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2
                id={headingId}
                className="mb-2 px-1 text-sm font-medium text-muted-foreground first-letter:uppercase"
              >
                {formatDayHeader(day)}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {txs.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} lookups={lookups} actions={actions} />
                ))}
              </ul>
            </motion.section>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function TransactionRow({
  tx,
  lookups,
  actions,
}: {
  tx: TransactionOut
  lookups: Lookups
  actions: TxActions
}) {
  const account = lookups.accounts.get(tx.account_id)
  const category = tx.category_id ? lookups.categories.get(tx.category_id) : undefined
  const isTransfer = tx.kind === 'transfer'
  const subtitle = isTransfer
    ? `${account?.name ?? '—'} → ${lookups.accounts.get(tx.to_account_id ?? 0)?.name ?? '—'}`
    : `${category?.name ?? 'Sem categoria'} · ${account?.name ?? '—'}`
  const dotColor = isTransfer ? undefined : (category?.color ?? 'var(--muted-foreground)')

  return (
    <li className="flex items-center gap-1 pr-2">
      <button
        type="button"
        onClick={() => actions.edit(tx)}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-muted"
        >
          {isTransfer ? (
            <ArrowLeftRight className="size-4 text-primary" />
          ) : (
            <span className="size-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <p className="truncate font-medium">{tx.description}</p>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="truncate">{subtitle}</span>
            {tx.tag_ids.map((id) => {
              const tag = lookups.tags.get(id)
              return tag ? (
                <span key={id} className="text-xs" style={{ color: tag.color }}>
                  #{tag.name}
                </span>
              ) : null
            })}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Money
            value={tx.amount}
            tone={tx.kind === 'income' ? 'income' : tx.kind === 'expense' ? 'expense' : 'neutral'}
            sign={tx.kind === 'income' ? '+' : tx.kind === 'expense' ? '-' : undefined}
            className="font-semibold"
          />
          {tx.status === 'pending' && (
            <Badge variant="outline" className="border-brass/50 text-brass">
              Pendente
            </Badge>
          )}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Ações de ${tx.description}`}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => actions.edit(tx)}>Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.duplicate(tx)}>Duplicar</DropdownMenuItem>
          {tx.status === 'pending' && (
            <DropdownMenuItem onClick={() => actions.markPaid(tx)}>
              Marcar como efetivado
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => actions.remove(tx)}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
