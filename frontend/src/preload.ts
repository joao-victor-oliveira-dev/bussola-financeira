// Registro das páginas lazy, separado do router para o AppShell não importar o router (ciclo).
// Map por nome: reavaliar o router (HMR, testes) substitui em vez de duplicar.
const loaders = new Map<string, () => Promise<unknown>>()

export function registerPage(name: string, load: () => Promise<unknown>) {
  loaders.set(name, load)
}

/** Baixa todas as páginas (o app chama quando o navegador fica ocioso; os testes, antes). */
export function preloadPages() {
  return Promise.all([...loaders.values()].map((load) => load()))
}
