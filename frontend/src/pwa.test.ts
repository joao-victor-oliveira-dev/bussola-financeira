import { pwaOptions } from '../pwa.config'

it('o service worker nunca serve a API (dado financeiro sempre da rede)', () => {
  const deny = pwaOptions.workbox?.navigateFallbackDenylist ?? []
  expect(deny.some((re) => re.test('/api/accounts'))).toBe(true)
  expect(pwaOptions.workbox?.runtimeCaching ?? []).toEqual([])
  expect(pwaOptions.workbox?.globPatterns?.join()).not.toMatch(/json/)
})

it('manifest instalável: nome, ícones 192/512 e maskable', () => {
  const m = pwaOptions.manifest
  if (!m) throw new Error('sem manifest')
  expect(m.display).toBe('standalone')
  const sizes = (m.icons ?? []).map((i) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`)
  expect(sizes).toEqual(['192x192', '512x512', '512x512:maskable'])
})
