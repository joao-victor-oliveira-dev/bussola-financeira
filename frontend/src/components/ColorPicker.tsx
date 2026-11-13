import { Check } from 'lucide-react'
import { PALETTE } from '@/lib/palette'
import { cn } from '@/lib/utils'

type Props = { value: string; onChange: (color: string) => void; label?: string }

export function ColorPicker({ value, onChange, label = 'Cor' }: Props) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {PALETTE.map((c) => {
        const selected = c.value.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c.name}
            onClick={() => onChange(c.value)}
            style={{ backgroundColor: c.value }}
            className={cn(
              'grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:hover:scale-110',
              selected && 'ring-2 ring-foreground',
            )}
          >
            {selected && <Check className="size-4 text-black/70" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}
