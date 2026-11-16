// Dinheiro trafega como string decimal ("1234.56"). Nada de float em cálculo: só na exibição.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: string | number): string {
  return brl.format(Number(value))
}

type SignOpts = { allowNegative?: boolean }

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "1.234,56" | "R$ 10" → "1234.56" | "10.00"; inválido → null. */
export function parseBRL(input: string, { allowNegative = false }: SignOpts = {}): string | null {
  let s = input.replace(/R\$/g, '').replace(/\s/g, '')
  let sign = ''
  if (s.startsWith('-')) {
    if (!allowNegative) return null
    sign = '-'
    s = s.slice(1)
  }
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(s)) return null
  const [intRaw, dec = ''] = s.split(',')
  const intPart = intRaw.replace(/\./g, '').replace(/^0+(?=\d)/, '')
  return `${sign}${intPart}.${dec.padEnd(2, '0')}`
}

/** Máscara de digitação: os dígitos viram centavos ("123456" → "1.234,56"). */
export function maskBRLInput(raw: string, { allowNegative = false }: SignOpts = {}): string {
  const negative = allowNegative && raw.trim().startsWith('-')
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return negative ? '-' : ''
  const padded = digits.padStart(3, '0')
  const intPart = groupThousands(padded.slice(0, -2))
  return `${negative ? '-' : ''}${intPart},${padded.slice(-2)}`
}

function toCents(value: string): number {
  const [int, dec = ''] = value.replace('-', '').split('.')
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0').slice(0, 2))
  return value.trim().startsWith('-') ? -cents : cents
}

/** Soma valores decimais em centavos inteiros (sem erro de float). */
export function sumMoney(values: string[]): string {
  const total = values.reduce((acc, v) => acc + toCents(v), 0)
  const abs = Math.abs(total)
  return `${total < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const fromCents = (cents: number) =>
  `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`

/** Divide em parcelas como o backend: arredonda para baixo e o centavo restante vai na 1ª. */
export function splitMoney(total: string, count: number): string[] {
  const cents = toCents(total)
  const base = Math.floor(cents / count)
  const first = cents - base * (count - 1)
  return [fromCents(first), ...Array(count - 1).fill(fromCents(base))]
}
