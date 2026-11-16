import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCategoriesList } from '@/api/generated/categories/categories'
import {
  getImportsListQueryKey,
  useImportsConfirm,
  useImportsDelete,
} from '@/api/generated/imports/imports'
import type { BatchDetailOut } from '@/api/generated/model'
import { getRulesListQueryKey } from '@/api/generated/rules/rules'
import { FormError } from '@/components/FormError'
import { NativeSelect } from '@/components/forms'
import { Money } from '@/components/Money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CategoryOptions } from '@/finance/CategoryOptions'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { formatShortDate } from '@/lib/dates'

type RowState = { include: boolean; categoryId: string }

/** Passo 2: revisar e confirmar. */
export function PreviewTable({ batch, onDone }: { batch: BatchDetailOut; onDone: () => void }) {
  const client = useQueryClient()
  const { data: categories = [] } = useCategoriesList()
  const confirm = useImportsConfirm()
  const discard = useImportsDelete()
  const [state, setState] = useState<Record<number, RowState>>(() =>
    Object.fromEntries(
      batch.rows.map((r) => [
        r.id,
        { include: !r.is_duplicate, categoryId: String(r.suggested_category_id ?? '') },
      ]),
    ),
  )
  const [learn, setLearn] = useState(false) // aprender é opt-in (spec: "opcionalmente aprendida")
  const [error, setError] = useState<string | null>(null)

  const selected = batch.rows.filter((r) => state[r.id]?.include).length
  const set = (id: number, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }))

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: getImportsListQueryKey() }),
      client.invalidateQueries({ queryKey: getRulesListQueryKey() }),
      invalidateMoney(client),
    ])

  const onConfirm = async () => {
    setError(null)
    try {
      const res = await confirm.mutateAsync({
        batchId: batch.id,
        data: {
          rows: batch.rows.map((r) => ({
            id: r.id,
            include: state[r.id].include,
            category_id: state[r.id].categoryId ? Number(state[r.id].categoryId) : null,
          })),
          learn,
        },
      })
      await refresh()
      toast.success(
        `${res.created} lançamento(s) importado(s)` +
          (res.rules_learned ? ` · ${res.rules_learned} regra(s) aprendida(s)` : ''),
      )
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const onDiscard = async () => {
    try {
      await discard.mutateAsync({ batchId: batch.id })
      await refresh()
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section aria-label="Revisar importação" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Revise antes de importar</h2>
          <p className="text-sm text-muted-foreground">
            {batch.filename} · {batch.total_rows} linhas · {batch.duplicate_rows} já existiam
            (desmarcadas) · {selected} a importar
          </p>
        </div>
      </div>

      {batch.parse_errors.length > 0 && (
        <p className="rounded-xl border border-brass/40 bg-brass/10 px-4 py-2.5 text-sm">
          {batch.parse_errors.length} linha(s) do arquivo foram ignoradas (ex.: linha{' '}
          {batch.parse_errors[0][0]}: {batch.parse_errors[0][1]}).
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {batch.rows.map((r) => {
          const row = state[r.id]
          return (
            <li
              key={r.id}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_5rem_minmax(0,1fr)_auto_14rem] ${row.include ? '' : 'opacity-55'}`}
            >
              <input
                type="checkbox"
                aria-label={`Incluir ${r.description}`}
                checked={row.include}
                onChange={(e) => set(r.id, { include: e.target.checked })}
                className="size-4 accent-primary"
              />
              <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">
                {formatShortDate(r.date)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.description}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="sm:hidden">{formatShortDate(r.date)}</span>
                  {r.is_duplicate && (
                    <Badge variant="outline" className="border-brass/50 text-brass">
                      Já existe
                    </Badge>
                  )}
                </span>
              </span>
              <Money
                value={r.amount}
                tone={r.kind === 'income' ? 'income' : 'expense'}
                sign={r.kind === 'income' ? '+' : '-'}
                className="text-sm font-semibold"
              />
              <NativeSelect
                aria-label={`Categoria de ${r.description}`}
                value={row.categoryId}
                onChange={(e) => set(r.id, { categoryId: e.target.value })}
                className="col-span-3 sm:col-span-1"
              >
                <option value="">Sem categoria</option>
                <CategoryOptions categories={categories.filter((c) => c.kind === r.kind)} />
              </NativeSelect>
            </li>
          )
        })}
      </ul>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={learn}
          onChange={(e) => setLearn(e.target.checked)}
          className="size-4 accent-primary"
        />
        Lembrar as categorias que eu corrigir (cria regras para as próximas importações)
      </label>

      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDiscard} disabled={discard.isPending}>
          Descartar
        </Button>
        <Button onClick={onConfirm} disabled={confirm.isPending || selected === 0}>
          {`Importar ${selected} lançamento${selected === 1 ? '' : 's'}`}
        </Button>
      </div>
    </section>
  )
}
