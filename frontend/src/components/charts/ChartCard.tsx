import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  description?: string
  actions?: React.ReactNode
  loading?: boolean
  empty?: boolean
  emptyText?: string
  className?: string
  children: React.ReactNode
}

/** Moldura de cada widget do painel: título, skeleton próprio e estado vazio próprio. */
export function ChartCard({
  title,
  description,
  actions,
  loading,
  empty,
  emptyText = 'Sem dados neste período.',
  className,
  children,
}: Props) {
  return (
    <section
      aria-label={title}
      className={cn(
        'relative flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5',
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {loading ? (
        <Skeleton className="min-h-48 flex-1 rounded-xl" />
      ) : empty ? (
        <p className="grid min-h-32 flex-1 place-items-center text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        children
      )}
    </section>
  )
}
