import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { useCardsList } from '@/api/generated/cards/cards'
import { useCategoriesList } from '@/api/generated/categories/categories'
import type { RecurringIn, RecurringOut, TransactionOutKind } from '@/api/generated/model'
import {
  getRecurringListQueryKey,
  useRecurringCreate,
  useRecurringDelete,
  useRecurringUpdate,
} from '@/api/generated/recurring/recurring'
import { AppDialog } from '@/components/AppDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { MoneyInput } from '@/components/MoneyInput'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { CategoryOptions } from '@/finance/CategoryOptions'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { toISODate } from '@/lib/dates'
import { maskBRLInput, parseBRL } from '@/lib/money'
import { KindToggle } from '@/pages/transactions/KindToggle'
import { SourceToggle } from '@/pages/transactions/SourceToggle'

const FREQUENCIES = { monthly: 'Mensal', weekly: 'Semanal', yearly: 'Anual' } as const
type Frequency = keyof typeof FREQUENCIES

type Props = { rule: RecurringOut | null; open: boolean; onOpenChange: (open: boolean) => void }

export function RecurringFormDialog({ rule, open, onOpenChange }: Props) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? 'Editar recorrência' : 'Nova recorrência'}
      description="Os lançamentos futuros são criados como pendentes; efetive cada um quando acontecer."
      className="sm:max-w-lg"
    >
      {open && (
        <RecurringForm key={rule?.id ?? 'new'} rule={rule} onDone={() => onOpenChange(false)} />
      )}
    </AppDialog>
  )
}

function RecurringForm({ rule, onDone }: { rule: RecurringOut | null; onDone: () => void }) {
  const client = useQueryClient()
  const { data: allAccounts = [] } = useAccountsList()
  const { data: allCards = [] } = useCardsList()
  const { data: categories = [] } = useCategoriesList()
  const create = useRecurringCreate()
  const update = useRecurringUpdate()
  const remove = useRecurringDelete()
  const accounts = allAccounts.filter((a) => !a.archived || a.id === rule?.account_id)
  const cards = allCards.filter((c) => !c.archived || c.id === rule?.credit_card_id)

  const [kind, setKind] = useState<TransactionOutKind>(rule?.kind ?? 'expense')
  const [amount, setAmount] = useState(rule ? maskBRLInput(rule.amount) : '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [start, setStart] = useState(() => rule?.start_date ?? toISODate(new Date()))
  const [end, setEnd] = useState(rule?.end_date ?? '')
  const [source, setSource] = useState<'account' | 'card'>(
    rule?.credit_card_id ? 'card' : 'account',
  )
  const [accountId, setAccountId] = useState(String(rule?.account_id ?? accounts[0]?.id ?? ''))
  const [cardId, setCardId] = useState(String(rule?.credit_card_id ?? cards[0]?.id ?? ''))
  const [toAccountId, setToAccountId] = useState(String(rule?.to_account_id ?? ''))
  const [categoryId, setCategoryId] = useState(String(rule?.category_id ?? ''))
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const onCard = kind === 'expense' && source === 'card'
  const isTransfer = kind === 'transfer'

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseBRL(amount)
    const next = {
      amount: parsed && Number(parsed) > 0 ? undefined : 'Informe um valor maior que zero.',
      description: description.trim() ? undefined : 'Informe a descrição.',
      source: onCard
        ? cardId
          ? undefined
          : 'Escolha o cartão.'
        : accountId
          ? undefined
          : 'Escolha a conta.',
      toAccount:
        !isTransfer || (toAccountId && toAccountId !== accountId)
          ? undefined
          : 'Escolha uma conta de destino diferente da origem.',
      start: start ? undefined : 'Informe quando começa.',
      end: !end || end >= start ? undefined : 'O fim precisa ser depois do início.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean) || !parsed) return
    const data: RecurringIn = {
      kind,
      amount: parsed,
      description: description.trim(),
      account_id: onCard ? null : Number(accountId),
      credit_card_id: onCard ? Number(cardId) : null,
      to_account_id: isTransfer ? Number(toAccountId) : null,
      category_id: !isTransfer && categoryId ? Number(categoryId) : null,
      frequency,
      start_date: start,
      end_date: end || null,
      active: rule?.active ?? true,
    }
    setError(null)
    try {
      if (rule) await update.mutateAsync({ ruleId: rule.id, data })
      else await create.mutateAsync({ data })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: getRecurringListQueryKey() }),
      invalidateMoney(client),
    ])
    toast.success(rule ? 'Recorrência atualizada.' : 'Recorrência criada.')
    onDone()
  }

  const onDelete = async () => {
    if (!rule) return
    try {
      await remove.mutateAsync({ ruleId: rule.id })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: getRecurringListQueryKey() }),
      invalidateMoney(client),
    ])
    toast.success('Recorrência excluída.')
    onDone()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <KindToggle
        value={kind}
        onChange={(k) => {
          setKind(k)
          if (k !== 'expense') setSource('account')
          setCategoryId('')
        }}
      />
      <Field label="Valor" error={errors.amount}>
        {({ id, describedBy, invalid }) => (
          <MoneyInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={amount}
            onChange={setAmount}
          />
        )}
      </Field>
      <Field label="Descrição" error={errors.description}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
            placeholder="Ex.: Aluguel"
            className={controlClass}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Frequência">
          {({ id }) => (
            <NativeSelect
              id={id}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {Object.entries(FREQUENCIES).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Começa em" error={errors.start}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={controlClass}
            />
          )}
        </Field>
        <Field label="Termina em (opcional)" error={errors.end}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={controlClass}
            />
          )}
        </Field>
      </div>

      {kind === 'expense' && cards.length > 0 && (
        <SourceToggle value={source} onChange={setSource} />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {onCard ? (
          <Field label="Cartão de crédito" error={errors.source}>
            {({ id }) => (
              <NativeSelect id={id} value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : (
          <Field label={isTransfer ? 'Da conta' : 'Conta'} error={errors.source}>
            {({ id }) => (
              <NativeSelect
                id={id}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}
        {isTransfer ? (
          <Field label="Para a conta" error={errors.toAccount}>
            {({ id }) => (
              <NativeSelect
                id={id}
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {accounts
                  .filter((a) => String(a.id) !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
        ) : (
          <Field label="Categoria">
            {({ id }) => (
              <NativeSelect
                id={id}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Sem categoria</option>
                <CategoryOptions categories={categories.filter((c) => c.kind === kind)} />
              </NativeSelect>
            )}
          </Field>
        )}
      </div>

      <FormError message={error} />
      <SubmitButton loading={create.isPending || update.isPending}>
        {rule ? 'Salvar alterações' : 'Criar recorrência'}
      </SubmitButton>
      {rule && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-expense hover:text-expense"
            onClick={() => setConfirming(true)}
          >
            Excluir recorrência
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Excluir esta recorrência?"
            description="As próximas ocorrências pendentes somem; as já efetivadas ficam no histórico."
            confirmLabel="Excluir"
            onConfirm={onDelete}
          />
        </>
      )}
    </form>
  )
}
