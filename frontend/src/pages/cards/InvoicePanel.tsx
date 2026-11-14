import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import {
  useCardsInvoice,
  useCardsInvoicePay,
  useCardsInvoiceUnpay,
} from '@/api/generated/cards/cards'
import type { CardOut, InvoiceDetailOut } from '@/api/generated/model'
import { AppDialog } from '@/components/AppDialog'
import { LoadError } from '@/components/charts/ChartCard'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { Money } from '@/components/Money'
import { SubmitButton } from '@/components/SubmitButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, invalidateCards } from '@/finance/cache'
import { INVOICE_STATUS } from '@/finance/labels'
import { formatShortDate, toISODate } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { MonthSwitcher } from '@/pages/transactions/TransactionFilters'

type Props = {
  card: CardOut
  reference: string
  onReferenceChange: (ref: string) => void
  onEdit: () => void
}

export function InvoicePanel({ card, reference, onReferenceChange, onEdit }: Props) {
  const client = useQueryClient()
  const invoice = useCardsInvoice(card.id, reference, {
    query: { placeholderData: (prev) => prev },
  })
  const unpay = useCardsInvoiceUnpay()
  const [paying, setPaying] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const data = invoice.data

  const onUnpay = async () => {
    try {
      await unpay.mutateAsync({ cardId: card.id, reference })
      await invalidateCards(client)
      toast.success('Pagamento desfeito.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <section
      aria-label={`Fatura ${card.name}`}
      className="grid gap-5 rounded-2xl border border-border bg-card p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-8 w-1.5 rounded-full"
            style={{ backgroundColor: card.color }}
          />
          <h2 className="text-lg font-semibold">Fatura {card.name}</h2>
          <Button variant="ghost" size="icon" aria-label="Editar cartão" onClick={onEdit}>
            <Pencil />
          </Button>
        </div>
        <MonthSwitcher month={reference} onChange={onReferenceChange} />
      </header>

      {invoice.isError && !data ? (
        <LoadError onRetry={() => invoice.refetch()} />
      ) : !data ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="text-xl font-semibold">
                <Money value={data.total} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fecha em</dt>
              <dd className="font-medium">{formatShortDate(data.closing_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vence em</dt>
              <dd className="font-medium">{formatShortDate(data.due_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Situação</dt>
              <dd>
                <Badge variant={data.status === 'paid' ? 'secondary' : 'outline'}>
                  {INVOICE_STATUS[data.status]}
                </Badge>
              </dd>
            </div>
          </dl>

          {data.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma compra nesta fatura.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 py-3">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatShortDate(tx.date)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{tx.description}</span>
                    {tx.installment && (
                      <span className="text-xs text-muted-foreground">
                        Parcela {tx.installment}
                      </span>
                    )}
                  </span>
                  <Money value={tx.amount} tone="expense" className="font-semibold" />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {data.status === 'paid' ? (
              <Button variant="outline" onClick={() => setUndoing(true)}>
                Desfazer pagamento
              </Button>
            ) : (
              <Button onClick={() => setPaying(true)} disabled={Number(data.total) <= 0}>
                Pagar fatura
              </Button>
            )}
          </div>
        </>
      )}

      {data && (
        <PayInvoiceDialog
          open={paying}
          onOpenChange={setPaying}
          card={card}
          invoice={data}
          reference={reference}
        />
      )}
      <ConfirmDialog
        open={undoing}
        onOpenChange={setUndoing}
        title="Desfazer o pagamento?"
        description="A transferência do pagamento será removida e a fatura volta a ficar em aberto."
        confirmLabel="Desfazer"
        onConfirm={onUnpay}
      />
    </section>
  )
}

function PayInvoiceDialog({
  open,
  onOpenChange,
  card,
  invoice,
  reference,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: CardOut
  invoice: InvoiceDetailOut
  reference: string
}) {
  const client = useQueryClient()
  const { data: accounts = [] } = useAccountsList()
  const pay = useCardsInvoicePay()
  const active = accounts.filter((a) => !a.archived)
  const [accountId, setAccountId] = useState(String(card.payment_account_id ?? active[0]?.id ?? ''))
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountId) return setError('Escolha a conta de pagamento.')
    setError(null)
    try {
      await pay.mutateAsync({
        cardId: card.id,
        reference,
        data: { account_id: Number(accountId), date },
      })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await invalidateCards(client)
    toast.success('Fatura paga.')
    onOpenChange(false)
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pagar fatura"
      description="Vira uma transferência da conta para o cartão: não conta como despesa de novo."
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <Field label="Pagar com a conta">
          {({ id }) => (
            <NativeSelect id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="" disabled>
                Escolha…
              </option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Data do pagamento">
          {({ id }) => (
            <input
              id={id}
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={controlClass}
            />
          )}
        </Field>
        <FormError message={error} />
        <SubmitButton loading={pay.isPending}>
          {`Confirmar pagamento de ${formatBRL(invoice.total)}`}
        </SubmitButton>
      </form>
    </AppDialog>
  )
}
