import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCardsList } from '@/api/generated/cards/cards'
import type { CardOut } from '@/api/generated/model'
import { NeedleMark } from '@/components/Logo'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { parseMonth } from '@/lib/dates'
import { CardFormDialog } from '@/pages/cards/CardFormDialog'
import { CreditCardTile } from '@/pages/cards/CreditCardTile'
import { InvoicePanel } from '@/pages/cards/InvoicePanel'

export function CardsPage() {
  const { data: cards, isLoading } = useCardsList()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<{ open: boolean; card: CardOut | null }>({
    open: false,
    card: null,
  })

  const active = (cards ?? []).filter((c) => !c.archived)
  // Cartão e fatura abertos ficam na URL (o painel linka direto para "pagar fatura").
  const selected = cards?.find((c) => String(c.id) === params.get('cartao')) ?? null
  const reference = selected
    ? parseMonth(params.get('fatura') ?? selected.current_invoice.reference)
    : null

  const select = (card: CardOut, ref = card.current_invoice.reference) =>
    setParams({ cartao: String(card.id), fatura: ref }, { replace: true })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        title="Cartões"
        description="Faturas, limite usado e pagamento de cada cartão."
        actions={
          <Button
            onClick={() => setDialog({ open: true, card: null })}
            className="h-10 rounded-[10px] px-4"
          >
            <Plus aria-hidden="true" />
            Novo cartão
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-[1.586] rounded-2xl" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <NeedleMark className="size-12 text-muted-foreground" />
          <h2 className="mt-5 text-lg font-semibold">Nenhum cartão ainda</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Cadastre seu cartão de crédito para acompanhar a fatura, as parcelas e o limite.
          </p>
          <Button
            onClick={() => setDialog({ open: true, card: null })}
            className="mt-6 h-10 rounded-[10px] px-4"
          >
            <Plus aria-hidden="true" />
            Cadastrar primeiro cartão
          </Button>
        </section>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((c, i) => (
            <CreditCardTile
              key={c.id}
              card={c}
              index={i}
              selected={selected?.id === c.id}
              onOpen={() => select(c)}
            />
          ))}
        </div>
      )}

      {selected && reference && (
        <InvoicePanel
          card={selected}
          reference={reference}
          onReferenceChange={(ref) => select(selected, ref)}
          onEdit={() => setDialog({ open: true, card: selected })}
        />
      )}

      <CardFormDialog
        open={dialog.open}
        card={dialog.card}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  )
}
