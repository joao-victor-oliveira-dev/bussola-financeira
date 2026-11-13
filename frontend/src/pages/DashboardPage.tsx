import { useAuth } from '@/auth/useAuth'
import { NeedleMark } from '@/components/Logo'

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
  new Date(),
)

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.name.trim().split(/\s+/)[0] ?? ''

  return (
    <div>
      <h1 className="text-2xl font-semibold sm:text-3xl">Olá, {firstName}</h1>
      <p className="mt-1 text-muted-foreground first-letter:uppercase">{monthLabel}</p>

      <section className="mt-8 flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-14 text-center">
        <NeedleMark className="size-12 text-muted-foreground" />
        <h2 className="mt-5 text-lg font-semibold">Nenhum lançamento ainda</h2>
        <p className="mt-2 max-w-md text-muted-foreground">
          Saldo, gastos por categoria e fluxo de caixa aparecem aqui assim que você registrar o
          primeiro lançamento.
        </p>
      </section>
    </div>
  )
}
