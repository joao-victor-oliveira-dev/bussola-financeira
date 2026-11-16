import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { useCardsCreate, useCardsDelete, useCardsUpdate } from '@/api/generated/cards/cards'
import type { CardIn, CardOut } from '@/api/generated/model'
import { AppDialog } from '@/components/AppDialog'
import { ColorPicker } from '@/components/ColorPicker'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { MoneyInput } from '@/components/MoneyInput'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { errorMessage, invalidateCards } from '@/finance/cache'
import { maskBRLInput, parseBRL } from '@/lib/money'

const CARD_COLOR = '#6c9ef8'

type Props = { card: CardOut | null; open: boolean; onOpenChange: (open: boolean) => void }

export function CardFormDialog({ card, open, onOpenChange }: Props) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={card ? 'Editar cartão' : 'Novo cartão'}
      description={
        card ? undefined : 'Compras no cartão viram fatura; você paga a fatura de uma conta.'
      }
    >
      {open && <CardForm key={card?.id ?? 'new'} card={card} onDone={() => onOpenChange(false)} />}
    </AppDialog>
  )
}

const validDay = (v: string) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null
}

function CardForm({ card, onDone }: { card: CardOut | null; onDone: () => void }) {
  const client = useQueryClient()
  const { data: accounts = [] } = useAccountsList()
  const create = useCardsCreate()
  const update = useCardsUpdate()
  const remove = useCardsDelete()
  const [name, setName] = useState(card?.name ?? '')
  const [limit, setLimit] = useState(card ? maskBRLInput(card.limit) : '')
  const [closing, setClosing] = useState(String(card?.closing_day ?? 10))
  const [due, setDue] = useState(String(card?.due_day ?? 20))
  const [paymentAccount, setPaymentAccount] = useState(String(card?.payment_account_id ?? ''))
  const [color, setColor] = useState(card?.color ?? CARD_COLOR)
  const [archived, setArchived] = useState(card?.archived ?? false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedLimit = limit.trim() ? parseBRL(limit) : '0.00'
    const closingDay = validDay(closing)
    const dueDay = validDay(due)
    const next = {
      name: name.trim() ? undefined : 'Informe o nome do cartão.',
      limit: parsedLimit === null ? 'Valor inválido.' : undefined,
      closing: closingDay ? undefined : 'Use um dia entre 1 e 28.',
      due: dueDay ? undefined : 'Use um dia entre 1 e 28.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean) || !parsedLimit || !closingDay || !dueDay) return
    const data: CardIn = {
      name: name.trim(),
      limit: parsedLimit,
      closing_day: closingDay,
      due_day: dueDay,
      payment_account_id: paymentAccount ? Number(paymentAccount) : null,
      color,
      archived,
    }
    setError(null)
    try {
      if (card) await update.mutateAsync({ cardId: card.id, data })
      else await create.mutateAsync({ data })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await invalidateCards(client)
    toast.success(card ? 'Cartão atualizado.' : 'Cartão criado.')
    onDone()
  }

  const onDelete = async () => {
    if (!card) return
    try {
      await remove.mutateAsync({ cardId: card.id })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await invalidateCards(client)
    toast.success('Cartão excluído.')
    onDone()
  }

  const dayInput =
    (value: string, set: (v: string) => void) =>
    ({ id, describedBy, invalid }: { id: string; describedBy?: string; invalid?: boolean }) => (
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        type="number"
        inputMode="numeric"
        min={1}
        max={28}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={controlClass}
      />
    )

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field label="Nome" error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ex.: Roxinho"
            className={controlClass}
          />
        )}
      </Field>
      <Field label="Limite" error={errors.limit}>
        {({ id, describedBy, invalid }) => (
          <MoneyInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={limit}
            onChange={setLimit}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-5">
        <Field label="Dia de fechamento" error={errors.closing}>
          {dayInput(closing, setClosing)}
        </Field>
        <Field label="Dia de vencimento" error={errors.due}>
          {dayInput(due, setDue)}
        </Field>
      </div>
      <Field label="Conta de pagamento">
        {({ id }) => (
          <NativeSelect
            id={id}
            value={paymentAccount}
            onChange={(e) => setPaymentAccount(e.target.value)}
          >
            <option value="">Escolher na hora de pagar</option>
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </NativeSelect>
        )}
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Cor</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {card && (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="size-4 accent-primary"
          />
          Arquivar (some das listas, mas mantém o histórico)
        </label>
      )}
      <FormError message={error} />
      <SubmitButton loading={create.isPending || update.isPending}>
        {card ? 'Salvar alterações' : 'Criar cartão'}
      </SubmitButton>
      {card && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-expense hover:text-expense"
            onClick={() => setConfirming(true)}
          >
            Excluir cartão
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Excluir este cartão?"
            description="Só é possível excluir cartões sem compras. Para guardar o histórico, arquive."
            confirmLabel="Excluir"
            onConfirm={onDelete}
          />
        </>
      )}
    </form>
  )
}
