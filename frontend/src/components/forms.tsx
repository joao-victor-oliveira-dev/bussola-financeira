import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Superfície padrão dos controles de formulário do app. */
export const controlClass =
  'h-11 w-full rounded-[10px] border border-input bg-surface-raised px-3.5 text-[0.95rem] outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-expense disabled:opacity-50'

type FieldProps = {
  label: string
  error?: string
  className?: string
  children: (ids: { id: string; describedBy?: string; invalid?: boolean }) => React.ReactNode
}

/** Rótulo + controle + erro, com ids de acessibilidade já ligados. */
export function Field({ label, error, className, children }: FieldProps) {
  const id = useId()
  const errorId = `${id}-erro`
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        describedBy: error ? errorId : undefined,
        invalid: error ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="text-sm text-expense">
          {error}
        </p>
      )}
    </div>
  )
}

/** <select> nativo estilizado: acessível, com o seletor do sistema no celular. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(controlClass, 'appearance-none pr-10')} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
