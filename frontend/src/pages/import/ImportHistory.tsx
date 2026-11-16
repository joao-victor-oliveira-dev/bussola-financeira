import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  getImportsListQueryKey,
  useImportsDelete,
  useImportsList,
} from '@/api/generated/imports/imports'
import type { BatchOut } from '@/api/generated/model'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { formatShortDate, toISODate } from '@/lib/dates'

const STATUS = {
  processing: 'Processando',
  preview: 'Aguardando revisão',
  done: 'Importado',
  failed: 'Falhou',
  undone: 'Desfeito',
} as const

export function ImportHistory({ onResume }: { onResume: (id: number) => void }) {
  const client = useQueryClient()
  const { data: batches = [] } = useImportsList()
  const remove = useImportsDelete()
  const [undoing, setUndoing] = useState<BatchOut | null>(null)

  const onUndo = async () => {
    if (!undoing) return
    try {
      await remove.mutateAsync({ batchId: undoing.id })
      await Promise.all([
        client.invalidateQueries({ queryKey: getImportsListQueryKey() }),
        invalidateMoney(client),
      ])
      toast.success('Importação desfeita.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (batches.length === 0) return null
  return (
    <section aria-label="Importações anteriores" className="grid gap-3">
      <h2 className="font-semibold">Importações anteriores</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {batches.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{b.filename}</span>
              <span className="text-xs text-muted-foreground">
                {formatShortDate(toISODate(new Date(b.created_at)))}
                {b.status === 'done' && ` · ${b.created_count} lançamento(s)`}
                {b.status === 'failed' && b.error && ` · ${b.error}`}
              </span>
            </span>
            <Badge variant={b.status === 'done' ? 'secondary' : 'outline'}>
              {STATUS[b.status]}
            </Badge>
            {b.status === 'preview' && (
              <Button variant="outline" size="sm" onClick={() => onResume(b.id)}>
                Revisar
              </Button>
            )}
            {b.status === 'done' && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Desfazer ${b.filename}`}
                onClick={() => setUndoing(b)}
              >
                Desfazer
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => !open && setUndoing(null)}
        title="Desfazer esta importação?"
        description={
          undoing
            ? `Os ${undoing.created_count} lançamento(s) criados por "${undoing.filename}" serão removidos.`
            : ''
        }
        confirmLabel="Desfazer"
        onConfirm={onUndo}
      />
    </section>
  )
}
