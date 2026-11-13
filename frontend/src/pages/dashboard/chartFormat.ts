import { formatMonth, parseISODate } from '@/lib/dates'

const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const compact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** "2026-11" → "nov" (eixo) */
export const monthTick = (m: string) => shortMonth.format(parseISODate(`${m}-01`)).replace('.', '')

/** "2026-11" → "novembro de 2026" (tooltip, tabela) */
export const monthLong = formatMonth

/** 12500 → "R$ 12,5 mil" (eixo Y) */
export const moneyTick = (v: number) => compact.format(v)
