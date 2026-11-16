import { useSearchParams } from 'react-router'
import { useImportsGet } from '@/api/generated/imports/imports'
import { FormError } from '@/components/FormError'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ImportHistory } from '@/pages/import/ImportHistory'
import { PreviewTable } from '@/pages/import/PreviewTable'
import { RulesPanel } from '@/pages/import/RulesPanel'
import { UploadForm } from '@/pages/import/UploadForm'

export function ImportPage() {
  const [params, setParams] = useSearchParams()
  const batchId = Number(params.get('lote')) || null
  const open = (id: number) => setParams({ lote: String(id) }, { replace: true })
  const close = () => setParams({}, { replace: true })

  // Com Celery de verdade o lote chega "processing": consulta até virar prévia.
  const batch = useImportsGet(batchId ?? 0, {
    query: {
      enabled: batchId !== null,
      refetchInterval: (q) => (q.state.data?.status === 'processing' ? 1000 : false),
    },
  })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        title="Importar extrato"
        description="Traga os lançamentos do banco em OFX ou CSV, revise e confirme."
      />

      {batchId === null ? (
        <UploadForm onUploaded={(b) => open(b.id)} />
      ) : !batch.data || batch.data.status === 'processing' ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : batch.data.status === 'preview' ? (
        <PreviewTable key={batch.data.id} batch={batch.data} onDone={close} />
      ) : (
        <div className="grid gap-4">
          <FormError
            message={
              batch.data.status === 'failed'
                ? batch.data.error || 'Não foi possível ler o arquivo.'
                : 'Esta importação já foi concluída.'
            }
          />
          <Button variant="outline" className="w-fit" onClick={close}>
            Enviar outro arquivo
          </Button>
        </div>
      )}

      <ImportHistory onResume={open} />
      <RulesPanel />
    </div>
  )
}
