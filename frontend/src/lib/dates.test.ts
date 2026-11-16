import {
  formatDayHeader,
  formatShortDate,
  parseMonth,
  formatMonth,
  currentMonth,
  monthRange,
  shiftMonth,
  toISODate,
} from '@/lib/dates'

describe('datas', () => {
  it('toISODate usa a data local', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('currentMonth', () => {
    expect(currentMonth(new Date(2026, 10, 13))).toBe('2026-11')
  })

  it('monthRange cobre o mês inteiro', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('shiftMonth atravessa o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('formatMonth por extenso', () => {
    expect(formatMonth('2026-11')).toBe('novembro de 2026')
  })

  it('formatDayHeader usa Hoje/Ontem e depois o dia por extenso', () => {
    const today = new Date(2026, 10, 13)
    expect(formatDayHeader('2026-11-13', today)).toBe('Hoje')
    expect(formatDayHeader('2026-11-12', today)).toBe('Ontem')
    expect(formatDayHeader('2026-11-10', today)).toBe('terça-feira, 10 de novembro')
  })
})

describe('parseMonth', () => {
  const today = new Date(2026, 10, 13)
  it.each([
    ['2026-03', '2026-03'],
    [null, '2026-11'],
    ['2026-13', '2026-11'],
    ['2026-3', '2026-11'],
    ['lixo', '2026-11'],
  ])('%s → %s', (raw, expected) => {
    expect(parseMonth(raw, today)).toBe(expected)
  })
})

it('formatShortDate', () => {
  expect(formatShortDate('2026-11-20')).toBe('20 de nov')
})
