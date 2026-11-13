import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SubmitButton({ loading, children }: { loading: boolean; children: string }) {
  return (
    <Button type="submit" disabled={loading} className="h-11 w-full rounded-[10px] text-[0.95rem]">
      {loading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  )
}
