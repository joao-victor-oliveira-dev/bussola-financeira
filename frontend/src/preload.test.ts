import { preloadPages, registerPage } from '@/preload'

it('registrar a mesma página de novo (HMR) não duplica o carregamento', async () => {
  const first = vi.fn(async () => 'a')
  const again = vi.fn(async () => 'a')
  registerPage('teste-x', first)
  registerPage('teste-x', again)
  await preloadPages()
  expect(first).not.toHaveBeenCalled()
  expect(again).toHaveBeenCalledTimes(1)
})
