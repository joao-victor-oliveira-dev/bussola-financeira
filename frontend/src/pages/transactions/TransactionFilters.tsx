import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AccountOut, CategoryOut } from '@/api/generated/model'
import { NativeSelect, controlClass } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { CategoryOptions } from '@/finance/CategoryOptions'
import { TX_KINDS, TX_STATUS } from '@/finance/labels'
import { formatMonth, shiftMonth } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { TxFilters } from '@/pages/transactions/useTransactionFilters'

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string
  onChange: (month: string) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <p
        aria-live="polite"
        className="min-w-44 text-center text-lg font-semibold first-letter:uppercase"
      >
        {formatMonth(month)}
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}

type Props = {
  filters: TxFilters
  onChange: (patch: Partial<TxFilters>) => void
  onClear: () => void
  hasFilters: boolean
  accounts: AccountOut[]
  categories: CategoryOut[]
}

export function TransactionFilters({
  filters,
  onChange,
  onClear,
  hasFilters,
  accounts,
  categories,
}: Props) {
  const [search, setSearch] = useState(filters.q)

  // Busca com debounce.
  useEffect(() => {
    if (search === filters.q) return
    const t = setTimeout(() => onChange({ q: search }), 300)
    return () => clearTimeout(t)
  }, [search, filters.q, onChange])

  const selectClass = 'min-w-0'
  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          aria-label="Buscar"
          placeholder="Buscar na descrição ou observações"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(controlClass, 'pl-10')}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <NativeSelect
          aria-label="Filtrar por conta"
          className={selectClass}
          value={filters.account}
          onChange={(e) => onChange({ account: e.target.value })}
        >
          <option value="">Contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar por categoria"
          className={selectClass}
          value={filters.category}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          <option value="">Categorias</option>
          <optgroup label="Despesas">
            <CategoryOptions categories={categories.filter((c) => c.kind === 'expense')} />
          </optgroup>
          <optgroup label="Receitas">
            <CategoryOptions categories={categories.filter((c) => c.kind === 'income')} />
          </optgroup>
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar por tipo"
          className={selectClass}
          value={filters.kind}
          onChange={(e) => onChange({ kind: e.target.value as TxFilters['kind'] })}
        >
          <option value="">Tipos</option>
          {Object.entries(TX_KINDS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar por status"
          className={selectClass}
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value as TxFilters['status'] })}
        >
          <option value="">Status</option>
          {Object.entries(TX_STATUS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </NativeSelect>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('')
              onClear()
            }}
            className="col-span-2 h-11 text-muted-foreground lg:col-span-1"
          >
            <X aria-hidden="true" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
