import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCategoriesCreate,
  useCategoriesDelete,
  useCategoriesUpdate,
} from '@/api/generated/categories/categories'
import type { CategoryOut, CategoryOutKind } from '@/api/generated/model'
import { AppDialog } from '@/components/AppDialog'
import { ColorPicker } from '@/components/ColorPicker'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { errorMessage, invalidateCatalog } from '@/finance/cache'
import { DEFAULT_COLOR } from '@/lib/palette'

export type CategoryDialogState = {
  open: boolean
  category: CategoryOut | null
  kind: CategoryOutKind
  parentId: number | null
}

type Props = {
  state: CategoryDialogState
  categories: CategoryOut[]
  onOpenChange: (open: boolean) => void
}

export function CategoryFormDialog({ state, categories, onOpenChange }: Props) {
  const { open, category } = state
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? 'Editar categoria' : 'Nova categoria'}
    >
      {open && (
        <CategoryForm
          key={category?.id ?? `new-${state.parentId}`}
          state={state}
          categories={categories}
          onDone={() => onOpenChange(false)}
        />
      )}
    </AppDialog>
  )
}

function CategoryForm({
  state,
  categories,
  onDone,
}: {
  state: CategoryDialogState
  categories: CategoryOut[]
  onDone: () => void
}) {
  const { category, kind } = state
  const client = useQueryClient()
  const create = useCategoriesCreate()
  const update = useCategoriesUpdate()
  const remove = useCategoriesDelete()
  const [name, setName] = useState(category?.name ?? '')
  const [parentId, setParentId] = useState<number | null>(category?.parent_id ?? state.parentId)
  const [color, setColor] = useState(category?.color ?? DEFAULT_COLOR)
  const [nameError, setNameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const hasChildren = category ? categories.some((c) => c.parent_id === category.id) : false
  const parents = categories.filter(
    (c) => c.kind === kind && c.parent_id === null && c.id !== category?.id,
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setNameError('Informe o nome da categoria.')
    setNameError(undefined)
    setError(null)
    try {
      if (category) {
        await update.mutateAsync({
          categoryId: category.id,
          data: { name: name.trim(), parent_id: parentId, color },
        })
      } else {
        await create.mutateAsync({ data: { name: name.trim(), kind, parent_id: parentId, color } })
      }
    } catch (err) {
      return setError(errorMessage(err))
    }
    await invalidateCatalog(client)
    toast.success(category ? 'Categoria atualizada.' : 'Categoria criada.')
    onDone()
  }

  const onDelete = async () => {
    if (!category) return
    setError(null)
    try {
      await remove.mutateAsync({ categoryId: category.id })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await invalidateCatalog(client)
    toast.success('Categoria excluída.')
    onDone()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field label="Nome" error={nameError}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className={controlClass}
          />
        )}
      </Field>
      <Field label="Categoria pai">
        {({ id }) => (
          <NativeSelect
            id={id}
            value={parentId ?? ''}
            disabled={hasChildren}
            onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Nenhuma (categoria principal)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Cor</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <FormError message={error} />
      <SubmitButton loading={create.isPending || update.isPending}>
        {category ? 'Salvar alterações' : 'Criar categoria'}
      </SubmitButton>
      {category && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-expense hover:text-expense"
            onClick={() => setConfirming(true)}
          >
            Excluir categoria
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Excluir esta categoria?"
            description="Só é possível excluir categorias sem lançamentos e sem subcategorias."
            confirmLabel="Excluir"
            onConfirm={onDelete}
          />
        </>
      )}
    </form>
  )
}
