import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/utils'

type Tone = 'auto' | 'income' | 'expense' | 'neutral'

const toneClass: Record<Exclude<Tone, 'auto'>, string> = {
  income: 'text-income',
  expense: 'text-expense',
  neutral: '',
}

/** Valor em reais com números tabulares. `auto` pinta negativos de coral. */
export function Money({
  value,
  tone = 'neutral',
  sign,
  className,
}: {
  value: string
  tone?: Tone
  sign?: '+' | '-'
  className?: string
}) {
  const resolved = tone === 'auto' ? (value.trim().startsWith('-') ? 'expense' : 'neutral') : tone
  return (
    <span className={cn('tabular-nums', toneClass[resolved], className)}>
      {sign && <span aria-hidden="true">{sign} </span>}
      {formatBRL(value)}
    </span>
  )
}
