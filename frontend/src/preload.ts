// Registro das páginas lazy, separado do router para o AppShell não importar o router (ciclo).
const loaders: (() => Promise<unknown>)[] = []

export function registerPage(load: () => Promise<unknown>) {
  loaders.push(load)
}

/** Baixa todas as páginas (o app chama quando o navegador fica ocioso; os testes, antes). */
export function preloadPages() {
  return Promise.all(loaders.map((load) => load()))
}
