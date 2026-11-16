import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

const RELOAD_KEY = 'bussola:chunk-reload'
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk/i

function isChunkError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR.test(error.message)
}

/** Já recarregou nos últimos 10 s? Evita loop se o chunk continuar faltando. */
function reloadedRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < 10_000
  } catch {
    return true // sem storage: não arrisca loop
  }
}

/**
 * Erro de rota. Depois de um deploy, a aba antiga pede um chunk que não existe mais:
 * recarrega uma vez sozinha (pega a versão nova). Outros erros mostram a mensagem.
 */
export function RouteError() {
  const error = useRouteError()
  const autoReload = isChunkError(error) && !reloadedRecently()

  useEffect(() => {
    if (!autoReload) return
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    } catch {
      // segue sem a marca
    }
    window.location.reload()
  }, [autoReload])

  if (autoReload) return null
  return (
    <div role="alert" className="mx-auto grid max-w-md gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar esta página</h1>
      <p className="text-muted-foreground">
        Pode ser a conexão ou uma versão nova do app. Recarregue para tentar de novo.
      </p>
      <Button onClick={() => window.location.reload()} className="mx-auto w-fit">
        Recarregar
      </Button>
    </div>
  )
}
