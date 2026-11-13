import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import type { AccountOut } from '@/api/generated/model'
import { NeedleMark } from '@/components/Logo'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { sumMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AccountCard } from '@/pages/accounts/AccountCard'
import { AccountFormDialog } from '@/pages/accounts/AccountFormDialog'

export function AccountsPage() {
  const { data: accounts, isLoading } = useAccountsList()
  const [dialog, setDialog] = useState<{ open: boolean; account: AccountOut | null }>({
    open: false,
    account: null,
  })
  const [showArchived, setShowArchived] = useState(false)

  const active = accounts?.filter((a) => !a.archived) ?? []
  const archived = accounts?.filter((a) => a.archived) ?? []
  const total = sumMoney((accounts ?? []).map((a) => a.balance))
  const openNew = () => setDialog({ open: true, account: null })
  const openEdit = (account: AccountOut) => setDialog({ open: true, account })

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Contas"
        description="Saldos calculados a partir dos lançamentos efetivados."
        actions={
          <Button onClick={openNew} className="h-10 rounded-[10px] px-4">
            <Plus aria-hidden="true" />
            Nova conta
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <>
          <section className="rounded-2xl border border-border bg-card px-6 py-5">
            <p className="text-sm text-muted-foreground">Saldo total</p>
            <p data-testid="total-balance" className="mt-1">
              <Money value={total} tone="auto" className="text-4xl font-semibold tracking-tight" />
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((a, i) => (
              <AccountCard key={a.id} account={a} index={i} onOpen={() => openEdit(a)} />
            ))}
          </div>

          {archived.length > 0 && (
            <section className="grid gap-4">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn('size-4 transition-transform', showArchived && 'rotate-90')}
                />
                Arquivadas ({archived.length})
              </button>
              {showArchived && (
                <div className="grid gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                  {archived.map((a, i) => (
                    <AccountCard key={a.id} account={a} index={i} onOpen={() => openEdit(a)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <NeedleMark className="size-12 text-muted-foreground" />
          <h2 className="mt-5 text-lg font-semibold">Nenhuma conta ainda</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Cadastre sua conta do banco ou a carteira para começar a registrar lançamentos.
          </p>
          <Button onClick={openNew} className="mt-6 h-10 rounded-[10px] px-4">
            <Plus aria-hidden="true" />
            Criar primeira conta
          </Button>
        </section>
      )}

      <AccountFormDialog
        open={dialog.open}
        account={dialog.account}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  )
}
