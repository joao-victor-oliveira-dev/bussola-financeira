import { useQueryClient } from '@tanstack/react-query'
import { Plus, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { useCardsList } from '@/api/generated/cards/cards'
import type { RecurringOut } from '@/api/generated/model'
import {
  getRecurringListQueryKey,
  useRecurringList,
  useRecurringUpdate,
} from '@/api/generated/recurring/recurring'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { formatShortDate, parseISODate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { RecurringFormDialog } from '@/pages/recurring/RecurringFormDialog'

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })

function frequencyLabel(rule: Pick<RecurringOut, 'frequency' | 'start_date'>): string {
  const start = parseISODate(rule.start_date)
  if (rule.frequency === 'weekly') return `Semanal, toda ${weekday.format(start)}`
  if (rule.frequency === 'yearly') return `Anual, todo ${formatShortDate(rule.start_date)}`
  return `Mensal, todo dia ${start.getDate()}`
}

export function RecurringPage() {
  const client = useQueryClient()
  const { data: rules, isLoading } = useRecurringList()
  const { data: accounts = [] } = useAccountsList()
  const { data: cards = [] } = useCardsList()
  const update = useRecurringUpdate()
  const [dialog, setDialog] = useState<{ open: boolean; rule: RecurringOut | null }>({
    open: false,
    rule: null,
  })

  const names = useMemo(
    () => ({
      accounts: new Map(accounts.map((a) => [a.id, a.name])),
      cards: new Map(cards.map((c) => [c.id, c.name])),
    }),
    [accounts, cards],
  )

  const toggle = async (rule: RecurringOut) => {
    try {
      await update.mutateAsync({ ruleId: rule.id, data: { active: !rule.active } })
      await Promise.all([
        client.invalidateQueries({ queryKey: getRecurringListQueryKey() }),
        invalidateMoney(client),
      ])
      toast.success(rule.active ? 'Recorrência pausada.' : 'Recorrência retomada.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const sourceName = (r: RecurringOut) =>
    r.credit_card_id
      ? `Cartão ${names.cards.get(r.credit_card_id) ?? ''}`.trim()
      : (names.accounts.get(r.account_id ?? 0) ?? '—')

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Recorrências"
        description="Contas que se repetem viram lançamentos pendentes, até 60 dias à frente."
        actions={
          <Button
            onClick={() => setDialog({ open: true, rule: null })}
            className="h-10 rounded-[10px] px-4"
          >
            <Plus aria-hidden="true" />
            Nova recorrência
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !rules?.length ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <Repeat aria-hidden="true" className="size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Nenhuma recorrência ainda</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Cadastre salário, aluguel e assinaturas uma vez; o Bússola cria os lançamentos de cada
            mês para você.
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rules.map((r) => (
            <li
              key={r.id}
              aria-label={r.description}
              className={cn('flex items-center gap-3 pr-4', !r.active && 'opacity-60')}
            >
              <button
                type="button"
                onClick={() => setDialog({ open: true, rule: r })}
                className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3.5 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{r.description}</span>
                  <Money
                    value={r.amount}
                    tone={
                      r.kind === 'income' ? 'income' : r.kind === 'expense' ? 'expense' : 'neutral'
                    }
                    sign={r.kind === 'income' ? '+' : r.kind === 'expense' ? '-' : undefined}
                    className="shrink-0 font-semibold"
                  />
                </span>
                <span className="text-sm text-muted-foreground">
                  {frequencyLabel(r)} · {sourceName(r)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.active
                    ? r.next_dates.length
                      ? `Próximas: ${r.next_dates.map(formatShortDate).join(', ')}`
                      : 'Sem próximas datas (terminou)'
                    : 'Pausada'}
                </span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={r.active}
                aria-label="Ativa"
                title={r.active ? 'Pausar' : 'Retomar'}
                onClick={() => toggle(r)}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  r.active ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform',
                    r.active && 'translate-x-5',
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <RecurringFormDialog
        open={dialog.open}
        rule={dialog.rule}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  )
}
