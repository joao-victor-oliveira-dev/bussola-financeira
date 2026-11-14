import { formatBRL, maskBRLInput, parseBRL, splitMoney, sumMoney } from '@/lib/money'

const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('formatBRL', () => {
  it('formata string decimal da API em reais', () => {
    expect(nbsp(formatBRL('1234.5'))).toBe('R$ 1.234,50')
    expect(nbsp(formatBRL('0'))).toBe('R$ 0,00')
  })

  it('formata negativos', () => {
    expect(nbsp(formatBRL('-30.25'))).toBe('-R$ 30,25')
  })

  it('aceita número', () => {
    expect(nbsp(formatBRL(99.9))).toBe('R$ 99,90')
  })
})

describe('parseBRL', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['R$ 1.234,56', '1234.56'],
    ['10', '10.00'],
    ['10,5', '10.50'],
    ['0,01', '0.01'],
    ['1.000.000,00', '1000000.00'],
  ])('%s → %s', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '1,234', '1,2,3'])('recusa %j', (input) => {
    expect(parseBRL(input)).toBeNull()
  })

  it('negativo só quando permitido', () => {
    expect(parseBRL('-50,00')).toBeNull()
    expect(parseBRL('-50,00', { allowNegative: true })).toBe('-50.00')
  })
})

describe('maskBRLInput', () => {
  it('trata os dígitos como centavos enquanto digita', () => {
    expect(maskBRLInput('5')).toBe('0,05')
    expect(maskBRLInput('123456')).toBe('1.234,56')
    expect(maskBRLInput('1.234,567')).toBe('12.345,67')
  })

  it('apaga para vazio', () => {
    expect(maskBRLInput('')).toBe('')
    expect(maskBRLInput('0,0')).toBe('')
  })

  it('mantém o sinal quando permitido', () => {
    expect(maskBRLInput('-1234', { allowNegative: true })).toBe('-12,34')
    expect(maskBRLInput('-1234')).toBe('12,34')
  })

  it('converte valor da API para exibição', () => {
    expect(maskBRLInput('42.90')).toBe('42,90')
  })
})

describe('sumMoney', () => {
  it('soma strings decimais sem erro de ponto flutuante', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30')
    expect(sumMoney(['1234.50', '-34.50'])).toBe('1200.00')
    expect(sumMoney(['-5', '2.5'])).toBe('-2.50')
    expect(sumMoney([])).toBe('0.00')
  })
})

describe('splitMoney', () => {
  it('igual ao backend: arredonda para baixo e o resto vai na 1ª', () => {
    expect(splitMoney('100.00', 3)).toEqual(['33.34', '33.33', '33.33'])
    expect(splitMoney('10.00', 6)).toEqual(['1.70', '1.66', '1.66', '1.66', '1.66', '1.66'])
    expect(splitMoney('3000.00', 10)).toEqual(Array(10).fill('300.00'))
  })
})
