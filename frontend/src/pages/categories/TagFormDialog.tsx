import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import type { TagOut } from '@/api/generated/model'
import { useTagsCreate, useTagsDelete, useTagsUpdate } from '@/api/generated/tags/tags'
import { AppDialog } from '@/components/AppDialog'
import { ColorPicker } from '@/components/ColorPicker'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError } from '@/components/FormError'
import { Field, controlClass } from '@/components/forms'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { errorMessage, invalidateCatalog, invalidateMoney } from '@/finance/cache'
import { DEFAULT_COLOR } from '@/lib/palette'

type Props = { open: boolean; tag: TagOut | null; onOpenChange: (open: boolean) => void }

export function TagFormDialog({ open, tag, onOpenChange }: Props) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={tag ? 'Editar tag' : 'Nova tag'}>
      {open && <TagForm key={tag?.id ?? 'new'} tag={tag} onDone={() => onOpenChange(false)} />}
    </AppDialog>
  )
}

function TagForm({ tag, onDone }: { tag: TagOut | null; onDone: () => void }) {
  const client = useQueryClient()
  const create = useTagsCreate()
  const update = useTagsUpdate()
  const remove = useTagsDelete()
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState(tag?.color ?? DEFAULT_COLOR)
  const [nameError, setNameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setNameError('Informe o nome da tag.')
    setNameError(undefined)
    setError(null)
    const data = { name: name.trim(), color }
    try {
      if (tag) await update.mutateAsync({ tagId: tag.id, data })
      else await create.mutateAsync({ data })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await invalidateCatalog(client)
    toast.success(tag ? 'Tag atualizada.' : 'Tag criada.')
    onDone()
  }

  const onDelete = async () => {
    if (!tag) return
    try {
      await remove.mutateAsync({ tagId: tag.id })
    } catch (err) {
      return setError(errorMessage(err))
    }
    await Promise.all([invalidateCatalog(client), invalidateMoney(client)])
    toast.success('Tag excluída.')
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
            maxLength={40}
            placeholder="Ex.: viagem"
            className={controlClass}
          />
        )}
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Cor</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <FormError message={error} />
      <SubmitButton loading={create.isPending || update.isPending}>
        {tag ? 'Salvar alterações' : 'Criar tag'}
      </SubmitButton>
      {tag && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-expense hover:text-expense"
            onClick={() => setConfirming(true)}
          >
            Excluir tag
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Excluir esta tag?"
            description="Ela sai de todos os lançamentos marcados com ela."
            confirmLabel="Excluir"
            onConfirm={onDelete}
          />
        </>
      )}
    </form>
  )
}
