import { CreditCard, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'account', label: 'Conta', icon: Wallet },
  { value: 'card', label: 'Cartão', icon: CreditCard },
] as const

/** "Pagar com": conta (sai do saldo) ou cartão (vai para a fatura). */
export function SourceToggle({
  value,
  onChange,
}: {
  value: 'account' | 'card'
  onChange: (value: 'account' | 'card') => void
}) {
  return (
    <div role="radiogroup" aria-label="Pagar com" className="flex items-center gap-2">
      <span className="mr-1 text-sm font-medium">Pagar com</span>
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === v
              ? 'border-primary/60 bg-primary/10 font-medium text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
