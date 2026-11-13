import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { useCategoriesList } from '@/api/generated/categories/categories'
import type { TransactionIn, TransactionOut, TransactionOutKind } from '@/api/generated/model'
import { useTagsList } from '@/api/generated/tags/tags'
import {
  useTransactionsCreate,
  useTransactionsUpdate,
} from '@/api/generated/transactions/transactions'
import { AppDialog } from '@/components/AppDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { MoneyInput } from '@/components/MoneyInput'
import { SubmitButton } from '@/components/SubmitButton'
import { CategoryOptions } from '@/finance/CategoryOptions'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { toISODate } from '@/lib/dates'
import { maskBRLInput, parseBRL } from '@/lib/money'
import { cn } from '@/lib/utils'
import { KindToggle } from '@/pages/transactions/KindToggle'

export type TxDialogState = {
  open: boolean
  tx: TransactionOut | null
  mode: 'create' | 'edit' | 'duplicate'
}

const TITLES = {
  create: 'Novo lançamento',
  edit: 'Editar lançamento',
  duplicate: 'Duplicar lançamento',
}

export function TransactionFormDialog({
  state,
  onOpenChange,
}: {
  state: TxDialogState
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AppDialog
      open={state.open}
      onOpenChange={onOpenChange}
      title={TITLES[state.mode]}
      className="sm:max-w-lg"
    >
      {state.open && (
        <TransactionForm
          key={`${state.mode}-${state.tx?.id ?? 'new'}`}
          state={state}
          onDone={() => onOpenChange(false)}
        />
      )}
    </AppDialog>
  )
}

type Errors = Partial<Record<'amount' | 'description' | 'account' | 'toAccount', string>>

function TransactionForm({ state, onDone }: { state: TxDialogState; onDone: () => void }) {
  const { tx, mode } = state
  const client = useQueryClient()
  const { data: allAccounts = [] } = useAccountsList()
  const { data: categories = [] } = useCategoriesList()
  const { data: tags = [] } = useTagsList()
  const create = useTransactionsCreate()
  const update = useTransactionsUpdate()

  // Arquivadas ficam fora, exceto as já usadas pelo lançamento em edição.
  const accounts = allAccounts.filter(
    (a) => !a.archived || a.id === tx?.account_id || a.id === tx?.to_account_id,
  )
  const [kind, setKind] = useState<TransactionOutKind>(tx?.kind ?? 'expense')
  const [amount, setAmount] = useState(tx ? maskBRLInput(tx.amount) : '')
  const [description, setDescription] = useState(tx?.description ?? '')
  const [date, setDate] = useState(() => tx?.date ?? toISODate(new Date()))
  const [accountId, setAccountId] = useState(String(tx?.account_id ?? accounts[0]?.id ?? ''))
  const [toAccountId, setToAccountId] = useState(String(tx?.to_account_id ?? ''))
  const [categoryId, setCategoryId] = useState(String(tx?.category_id ?? ''))
  const [tagIds, setTagIds] = useState<number[]>(tx?.tag_ids ?? [])
  const [paid, setPaid] = useState(mode === 'edit' ? tx?.status !== 'pending' : true)
  const [notes, setNotes] = useState(tx?.notes ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  if (allAccounts.length === 0)
    return (
      <div className="grid gap-4 text-sm text-muted-foreground">
        <p>Para registrar lançamentos, cadastre primeiro uma conta.</p>
        <Link to="/contas" onClick={onDone} className="font-medium text-primary hover:underline">
          Ir para Contas
        </Link>
      </div>
    )

  const changeKind = (next: TransactionOutKind) => {
    setKind(next)
    const current = categories.find((c) => String(c.id) === categoryId)
    if (current && current.kind !== next) setCategoryId('')
  }

  const toggleTag = (id: number) =>
    setTagIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseBRL(amount)
    const isTransfer = kind === 'transfer'
    const next: Errors = {
      amount: parsed && Number(parsed) > 0 ? undefined : 'Informe um valor maior que zero.',
      description: description.trim() ? undefined : 'Informe a descrição.',
      account: accountId ? undefined : 'Escolha a conta.',
      toAccount:
        !isTransfer || (toAccountId && toAccountId !== accountId)
          ? undefined
          : 'Escolha uma conta de destino diferente da origem.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean) || !parsed) return

    const data: TransactionIn = {
      kind,
      amount: parsed,
      date,
      description: description.trim(),
      account_id: Number(accountId),
      to_account_id: isTransfer ? Number(toAccountId) : null,
      category_id: !isTransfer && categoryId ? Number(categoryId) : null,
      status: paid ? 'paid' : 'pending',
      notes: notes.trim(),
      tag_ids: tagIds,
    }
    setApiError(null)
    try {
      if (mode === 'edit' && tx) await update.mutateAsync({ transactionId: tx.id, data })
      else await create.mutateAsync({ data })
    } catch (err) {
      return setApiError(errorMessage(err))
    }
    await invalidateMoney(client)
    toast.success(mode === 'edit' ? 'Lançamento atualizado.' : 'Lançamento adicionado.')
    onDone()
  }

  const kindCategories = categories.filter((c) => c.kind === kind)

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <KindToggle value={kind} onChange={changeKind} />

      <Field label="Valor" error={errors.amount}>
        {({ id, describedBy, invalid }) => (
          <MoneyInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            size="hero"
            value={amount}
            onChange={setAmount}
            className={cn(kind === 'income' && 'text-income', kind === 'expense' && 'text-expense')}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-[1fr_11rem]">
        <Field label="Descrição" error={errors.description}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
              placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado'}
              className={controlClass}
            />
          )}
        </Field>
        <Field label="Data">
          {({ id }) => (
            <input
              id={id}
              type="date"
              required
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={controlClass}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={kind === 'transfer' ? 'Da conta' : 'Conta'} error={errors.account}>
          {({ id, describedBy, invalid }) => (
            <NativeSelect
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
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
        {kind === 'transfer' ? (
          <Field label="Para a conta" error={errors.toAccount}>
            {({ id, describedBy, invalid }) => (
              <NativeSelect
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
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
                <CategoryOptions categories={kindCategories} />
              </NativeSelect>
            )}
          </Field>
        )}
      </div>

      {tags.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => {
              const on = tagIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    on
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <Field label="Observações">
        {({ id }) => (
          <textarea
            id={id}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={cn(controlClass, 'h-auto py-2.5')}
          />
        )}
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
          className="size-4 accent-primary"
        />
        Efetivado (o dinheiro já saiu ou entrou na conta)
      </label>

      <FormError message={apiError} />
      <SubmitButton loading={create.isPending || update.isPending}>
        {mode === 'edit' ? 'Salvar alterações' : 'Adicionar lançamento'}
      </SubmitButton>
    </form>
  )
}
