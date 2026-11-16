import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useBudgetsCreate,
  useBudgetsDelete,
  useBudgetsUpdate,
} from '@/api/generated/budgets/budgets'
import type { BudgetItemOut, CategoryOut } from '@/api/generated/model'
import { AppDialog } from '@/components/AppDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect } from '@/components/forms'
import { MoneyInput } from '@/components/MoneyInput'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { errorMessage, invalidateBudgets } from '@/finance/cache'
import { formatMonth } from '@/lib/dates'
import { maskBRLInput, parseBRL } from '@/lib/money'

export type BudgetDialogState = {
  open: boolean
  budget: BudgetItemOut | null
  categoryId: number | null
}

type Props = {
  state: BudgetDialogState
  month: string
  /** Categorias principais de despesa que ainda não têm orçamento no mês. */
  available: CategoryOut[]
  onOpenChange: (open: boolean) => void
}

export function BudgetFormDialog({ state, month, available, onOpenChange }: Props) {
  return (
    <AppDialog
      open={state.open}
      onOpenChange={onOpenChange}
      title={state.budget ? `Orçamento de ${state.budget.category_name}` : 'Novo orçamento'}
      description={`Limite de gasto para ${formatMonth(month)}.`}
    >
      {state.open && (
        <BudgetForm
          key={state.budget?.id ?? `new-${state.categoryId}`}
          state={state}
          month={month}
          available={available}
          onDone={() => onOpenChange(false)}
        />
      )}
    </AppDialog>
  )
}

function BudgetForm({
  state,
  month,
  available,
  onDone,
}: {
  state: BudgetDialogState
  month: string
  available: CategoryOut[]
  onDone: () => void
}) {
  const client = useQueryClient()
  const create = useBudgetsCreate()
  const update = useBudgetsUpdate()
  const remove = useBudgetsDelete()
  const { budget } = state
  const [categoryId, setCategoryId] = useState(String(state.categoryId ?? ''))
  const [limit, setLimit] = useState(budget ? maskBRLInput(budget.limit) : '')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const refresh = () => invalidateBudgets(client)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseBRL(limit)
    const next = {
      category: budget || categoryId ? undefined : 'Escolha a categoria.',
      limit: parsed && Number(parsed) > 0 ? undefined : 'Informe um limite maior que zero.',
    }
    setErrors(next)
    if (next.category || next.limit || !parsed) return
    setError(null)
    try {
      if (budget) await update.mutateAsync({ budgetId: budget.id, data: { limit: parsed } })
      else
        await create.mutateAsync({
          data: { category_id: Number(categoryId), month, limit: parsed },
        })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await refresh()
    toast.success(budget ? 'Orçamento atualizado.' : 'Orçamento criado.')
    onDone()
  }

  const onDelete = async () => {
    if (!budget) return
    try {
      await remove.mutateAsync({ budgetId: budget.id })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await refresh()
    toast.success('Orçamento removido.')
    onDone()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {!budget && (
        <Field label="Categoria" error={errors.category}>
          {({ id, describedBy, invalid }) => (
            <NativeSelect
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}
      <Field label="Limite do mês" error={errors.limit}>
        {({ id, describedBy, invalid }) => (
          <MoneyInput
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            size="hero"
            value={limit}
            onChange={setLimit}
          />
        )}
      </Field>
      <FormError message={error} />
      <SubmitButton loading={create.isPending || update.isPending}>
        {budget ? 'Salvar alterações' : 'Criar orçamento'}
      </SubmitButton>
      {budget && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-expense hover:text-expense"
            onClick={() => setConfirming(true)}
          >
            Remover orçamento
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Remover este orçamento?"
            description="Os lançamentos continuam; só o limite deste mês é removido."
            confirmLabel="Remover"
            onConfirm={onDelete}
          />
        </>
      )}
    </form>
  )
}
