import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCategoriesList } from '@/api/generated/categories/categories'
import {
  getRulesListQueryKey,
  useRulesCreate,
  useRulesDelete,
  useRulesList,
  useRulesUpdate,
} from '@/api/generated/rules/rules'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { CategoryOptions } from '@/finance/CategoryOptions'
import { errorMessage } from '@/finance/cache'
import { cn } from '@/lib/utils'

/** "Se a descrição contém X → categoria Y" (usadas para sugerir a categoria na importação). */
export function RulesPanel() {
  const client = useQueryClient()
  const { data: rules = [] } = useRulesList()
  const { data: categories = [] } = useCategoriesList()
  const create = useRulesCreate()
  const update = useRulesUpdate()
  const remove = useRulesDelete()
  const [pattern, setPattern] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const refresh = () => client.invalidateQueries({ queryKey: getRulesListQueryKey() })

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pattern.trim() || !categoryId) return setError('Informe o texto e a categoria.')
    setError(null)
    try {
      await create.mutateAsync({
        data: { pattern: pattern.trim(), category_id: Number(categoryId) },
      })
      setPattern('')
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <section aria-label="Regras de categorização" className="grid gap-3">
      <div>
        <h2 className="font-semibold">Regras de categorização</h2>
        <p className="text-sm text-muted-foreground">
          Sugerem a categoria quando a descrição contém o texto. Na revisão, marque “Lembrar as
          categorias que eu corrigir” para que suas correções virem regras.
        </p>
      </div>
      <form
        onSubmit={onAdd}
        noValidate
        className="grid items-end gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <Field label="Se a descrição contém">
          {({ id }) => (
            <input
              id={id}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Ex.: uber"
              maxLength={140}
              className={controlClass}
            />
          )}
        </Field>
        <Field label="Categoria da regra">
          {({ id }) => (
            <NativeSelect
              id={id}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="" disabled>
                Escolha…
              </option>
              <optgroup label="Despesas">
                <CategoryOptions categories={categories.filter((c) => c.kind === 'expense')} />
              </optgroup>
              <optgroup label="Receitas">
                <CategoryOptions categories={categories.filter((c) => c.kind === 'income')} />
              </optgroup>
            </NativeSelect>
          )}
        </Field>
        <Button type="submit" className="h-11" disabled={create.isPending}>
          Adicionar regra
        </Button>
        {error && (
          <div className="sm:col-span-3">
            <FormError message={error} />
          </div>
        )}
      </form>
      {rules.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rules.map((r) => (
            <li
              key={r.id}
              className={cn('flex items-center gap-3 px-5 py-2.5', !r.active && 'opacity-55')}
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                contém <strong className="font-medium">“{r.pattern}”</strong> →{' '}
                {names.get(r.category_id) ?? '—'}
                {r.priority > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">aprendida</span>
                )}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={r.active}
                aria-label={`Regra ${r.pattern} ativa`}
                onClick={() =>
                  act(() => update.mutateAsync({ ruleId: r.id, data: { active: !r.active } }))
                }
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  r.active ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform',
                    r.active && 'translate-x-4',
                  )}
                />
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Excluir regra ${r.pattern}`}
                onClick={() => act(() => remove.mutateAsync({ ruleId: r.id }))}
                className="text-muted-foreground hover:text-expense"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
