import { useQueryClient } from '@tanstack/react-query'
import { Plus, Shapes } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { useCategoriesList } from '@/api/generated/categories/categories'
import type { TransactionOut } from '@/api/generated/model'
import { useTagsList } from '@/api/generated/tags/tags'
import {
  useTransactionsDelete,
  useTransactionsList,
  useTransactionsUpdate,
} from '@/api/generated/transactions/transactions'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NeedleMark } from '@/components/Logo'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, invalidateMoney } from '@/finance/cache'
import { cn } from '@/lib/utils'
import { MonthSwitcher, TransactionFilters } from '@/pages/transactions/TransactionFilters'
import {
  TransactionFormDialog,
  type TxDialogState,
} from '@/pages/transactions/TransactionFormDialog'
import { TransactionList, type TxActions } from '@/pages/transactions/TransactionList'
import { PAGE_SIZE, useTransactionFilters } from '@/pages/transactions/useTransactionFilters'

const TYPING = 'input, textarea, select, [contenteditable="true"]'
const MODAL = '[role="dialog"], [role="alertdialog"]'

export function TransactionsPage() {
  const client = useQueryClient()
  const { filters, update, clear, apiParams, hasFilters } = useTransactionFilters()
  const { data, isLoading } = useTransactionsList(apiParams, {
    query: { placeholderData: (prev) => prev },
  })
  const { data: accounts = [] } = useAccountsList()
  const { data: categories = [] } = useCategoriesList()
  const { data: tags = [] } = useTagsList()
  const patch = useTransactionsUpdate()
  const remove = useTransactionsDelete()

  const [dialog, setDialog] = useState<TxDialogState>({ open: false, tx: null, mode: 'create' })
  const [toDelete, setToDelete] = useState<TransactionOut | null>(null)

  const lookups = useMemo(
    () => ({
      accounts: new Map(accounts.map((a) => [a.id, a])),
      categories: new Map(categories.map((c) => [c.id, c])),
      tags: new Map(tags.map((t) => [t.id, t])),
    }),
    [accounts, categories, tags],
  )

  const openNew = () => setDialog({ open: true, tx: null, mode: 'create' })

  // Atalho "N" para novo lançamento (fora de campos de texto e de modais).
  useEffect(() => {
    if (dialog.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest(TYPING)) return
      if (document.querySelector(MODAL)) return
      e.preventDefault()
      setDialog({ open: true, tx: null, mode: 'create' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog.open])

  const actions: TxActions = {
    edit: (tx) => setDialog({ open: true, tx, mode: 'edit' }),
    duplicate: (tx) => setDialog({ open: true, tx, mode: 'duplicate' }),
    markPaid: async (tx) => {
      try {
        await patch.mutateAsync({ transactionId: tx.id, data: { status: 'paid' } })
        await invalidateMoney(client)
        toast.success('Lançamento efetivado.')
      } catch (err) {
        toast.error(errorMessage(err))
      }
    },
    remove: (tx) => setToDelete(tx),
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await remove.mutateAsync({ transactionId: toDelete.id })
      await invalidateMoney(client)
      toast.success('Lançamento excluído.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const items = data?.items ?? []
  const count = data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  // Página além da última (ex.: excluiu o único item da última página): volta para a última.
  const outOfRange = data !== undefined && filters.page > pages
  useEffect(() => {
    if (outOfRange) update({ page: pages })
  }, [outOfRange, pages, update])

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-16 md:pb-0">
      <PageHeader
        title="Lançamentos"
        actions={
          <>
            <Link
              to="/categorias"
              className={cn(buttonVariants({ variant: 'ghost' }), 'h-10 md:hidden')}
            >
              <Shapes aria-hidden="true" />
              Categorias
            </Link>
            <Button onClick={openNew} className="hidden h-10 rounded-[10px] px-4 md:inline-flex">
              <Plus aria-hidden="true" />
              Novo lançamento
              <kbd
                aria-hidden="true"
                className="ml-1 rounded border border-primary-foreground/30 px-1.5 text-xs font-normal"
              >
                N
              </kbd>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MonthSwitcher month={filters.month} onChange={(month) => update({ month })} />
          <dl className="grid w-full grid-cols-3 gap-3 text-sm sm:w-auto sm:gap-8 sm:text-right sm:text-base">
            <div data-testid="total-income">
              <dt className="text-xs text-muted-foreground">Receitas</dt>
              <dd className="font-semibold">
                <Money value={data?.totals.income ?? '0'} tone="income" />
              </dd>
            </div>
            <div data-testid="total-expense">
              <dt className="text-xs text-muted-foreground">Despesas</dt>
              <dd className="font-semibold">
                <Money value={data?.totals.expense ?? '0'} tone="expense" />
              </dd>
            </div>
            <div data-testid="total-net">
              <dt className="text-xs text-muted-foreground">Saldo</dt>
              <dd className="font-semibold">
                <Money value={data?.totals.net ?? '0'} tone="auto" />
              </dd>
            </div>
          </dl>
        </div>
        <TransactionFilters
          filters={filters}
          onChange={update}
          onClear={clear}
          hasFilters={hasFilters}
          accounts={accounts}
          categories={categories}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <NeedleMark className="size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">
            {hasFilters ? 'Nada encontrado com esses filtros' : 'Nenhum lançamento neste mês'}
          </h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            {hasFilters
              ? 'Ajuste ou limpe os filtros para ver outros lançamentos.'
              : 'Registre receitas, despesas e transferências para acompanhar o mês.'}
          </p>
          {!hasFilters && (
            <Button onClick={openNew} className="mt-6 h-10 rounded-[10px] px-4">
              <Plus aria-hidden="true" />
              Adicionar o primeiro
            </Button>
          )}
        </section>
      ) : (
        <TransactionList items={items} lookups={lookups} actions={actions} />
      )}

      {pages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between gap-4 text-sm">
          <Button
            variant="outline"
            disabled={filters.page <= 1}
            onClick={() => update({ page: filters.page - 1 })}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {filters.page} de {pages} · {count} lançamentos
          </span>
          <Button
            variant="outline"
            disabled={filters.page >= pages}
            onClick={() => update({ page: filters.page + 1 })}
          >
            Próxima
          </Button>
        </nav>
      )}

      <button
        type="button"
        aria-label="Adicionar lançamento"
        onClick={openNew}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 md:hidden"
      >
        <Plus className="size-6" aria-hidden="true" />
      </button>

      <TransactionFormDialog
        state={dialog}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir este lançamento?"
        description={toDelete ? `“${toDelete.description}” será removido de vez.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
