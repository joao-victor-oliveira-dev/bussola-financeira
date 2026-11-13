import { NeedleMark } from '@/components/Logo'

export function FullScreenLoader() {
  return (
    <div role="status" aria-label="Carregando" className="grid min-h-dvh place-items-center">
      <NeedleMark className="size-10 animate-spin text-muted-foreground [animation-duration:2.4s]" />
    </div>
  )
}
