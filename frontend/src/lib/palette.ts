// Mesma paleta das categorias padrão do backend (apps/finance/services.py).
export const PALETTE = [
  { value: '#2fb5a2', name: 'Teal' },
  { value: '#cda35e', name: 'Latão' },
  { value: '#f27a6e', name: 'Coral' },
  { value: '#41d095', name: 'Verde' },
  { value: '#6c9ef8', name: 'Azul' },
  { value: '#b88cf2', name: 'Lilás' },
  { value: '#f2b85e', name: 'Âmbar' },
  { value: '#8a9ba3', name: 'Cinza' },
] as const

export const DEFAULT_COLOR = PALETTE[0].value
