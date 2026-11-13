import { cn } from '@/lib/utils'

/** Agulha da bússola: latão aponta o norte, grafite claro o sul. */
export function NeedleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7', className)}>
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        opacity=".5"
      />
      <g transform="rotate(35 16 16)">
        <path d="M16 4 L19.5 16 L12.5 16 Z" fill="var(--brass)" />
        <path d="M16 28 L12.5 16 L19.5 16 Z" fill="currentColor" opacity=".75" />
      </g>
      <circle
        cx="16"
        cy="16"
        r="1.8"
        fill="var(--background)"
        stroke="var(--brass)"
        strokeWidth="1"
      />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn('inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}
    >
      <NeedleMark />
      {!compact && <span className="text-[1.05rem]">Bússola</span>}
    </span>
  )
}
