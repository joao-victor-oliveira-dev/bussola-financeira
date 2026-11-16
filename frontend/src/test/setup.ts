import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// O app inteiro renderiza em cada teste; com a máquina carregada (CI) 1 s de findBy* é pouco.
configure({ asyncUtilTimeout: 3000 })

// Páginas são lazy: transforma todas antes dos testes (no app isso acontece no ocioso).
await import('@/router') // registra as páginas
const { preloadPages } = await import('@/preload')
await preloadPages()

// jsdom não implementa matchMedia (usado pelo Motion para prefers-reduced-motion)
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom não implementa ResizeObserver (usado pelo ResponsiveContainer do Recharts)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
