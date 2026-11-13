import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = React.ComponentProps<'input'> & { label: string; error?: string }

export function FormField({ label, error, ...input }: Props) {
  const id = useId()
  const errorId = `${id}-erro`
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 rounded-[10px] bg-surface-raised px-3.5 text-[0.95rem]"
        {...input}
      />
      {error && (
        <p id={errorId} className="text-sm text-expense">
          {error}
        </p>
      )}
    </div>
  )
}
