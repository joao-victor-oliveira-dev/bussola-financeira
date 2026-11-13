import { maskBRLInput } from '@/lib/money'
import { cn } from '@/lib/utils'
import { controlClass } from '@/components/forms'

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'size'> & {
  value: string
  onChange: (masked: string) => void
  allowNegative?: boolean
  size?: 'default' | 'hero'
}

/** Campo de valor em reais: guarda o texto mascarado ("1.234,56"); converta com parseBRL. */
export function MoneyInput({
  value,
  onChange,
  allowNegative,
  size = 'default',
  className,
  ...props
}: Props) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground',
          size === 'hero' && 'left-4 text-xl',
        )}
      >
        R$
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={value}
        onChange={(e) => onChange(maskBRLInput(e.target.value, { allowNegative }))}
        className={cn(
          controlClass,
          'pl-11 tabular-nums',
          size === 'hero' && 'h-16 pl-14 text-3xl font-semibold tracking-tight',
          className,
        )}
        {...props}
      />
    </div>
  )
}
