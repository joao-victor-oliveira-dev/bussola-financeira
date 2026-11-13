// Datas como "YYYY-MM-DD" (igual à API) e meses como "YYYY-MM", sempre no fuso local.

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function currentMonth(today = new Date()): string {
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Mês vindo da URL: inválido ou ausente → mês atual. */
export function parseMonth(raw: string | null, today = new Date()): string {
  return raw && MONTH_RE.test(raw) ? raw : currentMonth(today)
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${pad(last)}` }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return currentMonth(new Date(y, m - 1 + delta, 1))
}

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

export function formatMonth(month: string): string {
  return monthFmt.format(parseISODate(`${month}-01`))
}

export function formatDayHeader(iso: string, today = new Date()): string {
  const todayIso = toISODate(today)
  if (iso === todayIso) return 'Hoje'
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (iso === toISODate(yesterday)) return 'Ontem'
  return dayFmt.format(parseISODate(iso))
}
