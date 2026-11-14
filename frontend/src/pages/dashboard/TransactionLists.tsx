import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link } from 'react-router'
import type { AccountOut, CategoryOut, InvoiceDueOut, TransactionOut } from '@/api/generated/model'
import { useTransactionsUpdate } from '@/api/generated/transactions/transactions'
import { ChartCard, type WidgetState } from '@/components/charts/ChartCard'
import { Money } from '@/components/Money'
import { Button, buttonVariants } from '@/components/ui/button'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { parseISODate, toISODate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const fmtDate = (iso: string) => shortDate.format(parseISODate(iso)).replace('.', '')

type Lookups = { accounts: Map<number, AccountOut>; categories: Map<number, CategoryOut> }

export function TopExpenses({
  data,
  loading,
  error,
  onRetry,
  lookups,
}: { data?: TransactionOut[]; lookups: Lookups } & WidgetState) {
  return (
    <ChartCard
      title="Maiores gastos"
      description="As 5 maiores despesas do mês"
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !data?.length}
      emptyText="Nenhuma despesa neste mês."
      className="lg:col-span-3"
    >
      <ol className="divide-y divide-border">
        {data?.map((tx, i) => {
          const category = tx.category_id ? lookups.categories.get(tx.category_id) : undefined
          return (
            <li key={tx.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <span className="w-5 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{tx.description}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {category?.name ?? 'Sem categoria'} ·{' '}
                  {lookups.accounts.get(tx.account_id ?? 0)?.name ?? 'Cartão'} · {fmtDate(tx.date)}
                </span>
              </span>
              <Money value={tx.amount} tone="expense" className="font-semibold" />
            </li>
          )
        })}
      </ol>
    </ChartCard>
  )
}

export function UpcomingList({
  data,
  invoices,
  loading,
  error,
  onRetry,
}: { data?: TransactionOut[]; invoices?: InvoiceDueOut[] } & WidgetState) {
  const client = useQueryClient()
  const update = useTransactionsUpdate()
  const [today] = useState(() => toISODate(new Date()))
  const [busy, setBusy] = useState<Set<number>>(() => new Set())
  // Trava síncrona: o 2º clique de um duplo chega antes do re-render que desabilita o botão.
  const inFlight = useRef(new Set<number>())

  const markPaid = async (tx: TransactionOut) => {
    if (inFlight.current.has(tx.id)) return
    inFlight.current.add(tx.id)
    setBusy((s) => new Set(s).add(tx.id))
    try {
      await update.mutateAsync({ transactionId: tx.id, data: { status: 'paid' } })
      await invalidateMoney(client)
      toast.success('Lançamento efetivado.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      inFlight.current.delete(tx.id)
      setBusy((s) => {
        const next = new Set(s)
        next.delete(tx.id)
        return next
      })
    }
  }

  return (
    <ChartCard
      title="Próximos vencimentos"
      description="Faturas e lançamentos pendentes"
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !data?.length && !invoices?.length}
      emptyText="Nada pendente. Tudo em dia."
    >
      <ul className="divide-y divide-border">
        {invoices?.map((inv) => (
          <li
            key={`${inv.card_id}-${inv.reference}`}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span
              aria-hidden="true"
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: inv.card_color }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">Fatura {inv.card_name}</span>
              <span
                className={inv.overdue ? 'text-xs text-expense' : 'text-xs text-muted-foreground'}
              >
                {inv.overdue ? 'Vencida' : 'Vence'} em {fmtDate(inv.due_date)}
              </span>
            </span>
            <Money value={inv.total} tone="expense" className="text-sm font-semibold" />
            <Link
              to={`/cartoes?cartao=${inv.card_id}&fatura=${inv.reference}`}
              aria-label={`Pagar fatura ${inv.card_name}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
            >
              Pagar
            </Link>
          </li>
        ))}
        {data?.map((tx) => {
          const late = tx.date < today
          return (
            <li key={tx.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{tx.description}</span>
                <span className={late ? 'text-xs text-expense' : 'text-xs text-muted-foreground'}>
                  {late ? `Atrasado · ${fmtDate(tx.date)}` : fmtDate(tx.date)}
                </span>
              </span>
              <Money
                value={tx.amount}
                tone={
                  tx.kind === 'income' ? 'income' : tx.kind === 'expense' ? 'expense' : 'neutral'
                }
                className="text-sm font-semibold"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Marcar ${tx.description} como efetivado`}
                title="Marcar como efetivado"
                onClick={() => markPaid(tx)}
                disabled={busy.has(tx.id)}
                className="text-muted-foreground hover:text-income"
              >
                <Check />
              </Button>
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}
