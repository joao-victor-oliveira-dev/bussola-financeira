import { formatBRL } from '@/lib/money'

type Item = { name?: string | number; value?: unknown; color?: string; dataKey?: unknown }

type Props = {
  active?: boolean
  payload?: readonly Item[]
  label?: string | number
  labelFormatter?: (label: string) => string
  /** Linha extra calculada a partir do ponto (ex.: "Resultado"). */
  footer?: (payload: readonly Item[]) => React.ReactNode
}

/** Tooltip dos gráficos: texto nas cores de texto, a cor da série só no marcador. */
export function ChartTooltip({ active, payload, label, labelFormatter, footer }: Props) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-44 rounded-xl border border-border bg-popover px-3.5 py-2.5 text-sm shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 font-medium first-letter:uppercase">
          {labelFormatter ? labelFormatter(String(label)) : label}
        </p>
      )}
      <ul className="grid gap-1">
        {payload.map((item) => (
          <li key={String(item.dataKey ?? item.name)} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums">
              {formatBRL(String(item.value ?? 0))}
            </span>
          </li>
        ))}
      </ul>
      {footer?.(payload)}
    </div>
  )
}
