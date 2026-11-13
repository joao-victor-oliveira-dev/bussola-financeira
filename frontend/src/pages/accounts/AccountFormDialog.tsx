import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useAccountsCreate,
  useAccountsDelete,
  useAccountsUpdate,
} from '@/api/generated/accounts/accounts'
import type { AccountIn, AccountOut, AccountOutType } from '@/api/generated/model'
import type { ApiError } from '@/api/http'
import { AppDialog } from '@/components/AppDialog'
import { ColorPicker } from '@/components/ColorPicker'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { MoneyInput } from '@/components/MoneyInput'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { ACCOUNT_TYPES } from '@/finance/labels'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { maskBRLInput, parseBRL } from '@/lib/money'
import { DEFAULT_COLOR } from '@/lib/palette'

type Props = { account: AccountOut | null; open: boolean; onOpenChange: (open: boolean) => void }

export function AccountFormDialog({ account, open, onOpenChange }: Props) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Editar conta' : 'Nova conta'}
      description={account ? undefined : 'Onde seu dinheiro fica: banco, carteira ou investimento.'}
    >
      {/* key reinicia o formulário a cada abertura */}
      {open && (
        <AccountForm
          key={account?.id ?? 'new'}
          account={account}
          onDone={() => onOpenChange(false)}
        />
      )}
    </AppDialog>
  )
}

function AccountForm({ account, onDone }: { account: AccountOut | null; onDone: () => void }) {
  const client = useQueryClient()
  const create = useAccountsCreate<ApiError>()
  const update = useAccountsUpdate<ApiError>()
  const remove = useAccountsDelete<ApiError>()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountOutType>(account?.type ?? 'checking')
  const [initial, setInitial] = useState(
    account ? maskBRLInput(account.initial_balance, { allowNegative: true }) : '',
  )
  const [color, setColor] = useState(account?.color ?? DEFAULT_COLOR)
  const [archived, setArchived] = useState(account?.archived ?? false)
  const [errors, setErrors] = useState<{ name?: string; initial?: string }>({})
  const [confirming, setConfirming] = useState(false)
  const mutation = account ? update : create

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const balance = initial.trim() ? parseBRL(initial, { allowNegative: true }) : '0.00'
    const next = {
      name: name.trim() ? undefined : 'Informe o nome da conta.',
      initial: balance === null ? 'Valor inválido.' : undefined,
    }
    setErrors(next)
    if (next.name || next.initial || balance === null) return
    const data: AccountIn = { name: name.trim(), type, initial_balance: balance, color, archived }
    try {
      if (account) await update.mutateAsync({ accountId: account.id, data })
      else await create.mutateAsync({ data })
    } catch {
      return
    }
    await invalidateMoney(client)
    toast.success(account ? 'Conta atualizada.' : 'Conta criada.')
    onDone()
  }

  const onDelete = async () => {
    if (!account) return
    try {
      await remove.mutateAsync({ accountId: account.id })
      await invalidateMoney(client)
      toast.success('Conta excluída.')
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

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
            placeholder="Ex.: Nubank"
            className={controlClass}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tipo">
          {({ id }) => (
            <NativeSelect
              id={id}
              value={type}
              onChange={(e) => setType(e.target.value as AccountOutType)}
            >
              {Object.entries(ACCOUNT_TYPES).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Saldo inicial" error={errors.initial}>
          {({ id, describedBy, invalid }) => (
            <MoneyInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              allowNegative
              value={initial}
              onChange={setInitial}
            />
          )}
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Cor</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {account && (
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
      <FormError message={mutation.error?.detail} />
      <SubmitButton loading={mutation.isPending}>
        {account ? 'Salvar alterações' : 'Criar conta'}
      </SubmitButton>
      {account && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-expense hover:text-expense"
            onClick={() => setConfirming(true)}
          >
            Excluir conta
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Excluir esta conta?"
            description="Só é possível excluir contas sem lançamentos. Para guardar o histórico, arquive."
            confirmLabel="Excluir"
            onConfirm={onDelete}
          />
        </>
      )}
    </form>
  )
}
