import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const nbsp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const categories = [
  { id: 10, name: 'Alimentação', kind: 'expense', parent_id: null, color: '#cda35e' },
  { id: 11, name: 'Mercado', kind: 'expense', parent_id: 10, color: '#cda35e' },
  { id: 20, name: 'Moradia', kind: 'expense', parent_id: null, color: '#2fb5a2' },
  { id: 30, name: 'Lazer', kind: 'expense', parent_id: null, color: '#b88cf2' },
  { id: 40, name: 'Salário', kind: 'income', parent_id: null, color: '#41d095' },
]

const item = (over: Record<string, unknown>) => ({
  id: 1,
  category_id: 10,
  category_name: 'Alimentação',
  color: '#cda35e',
  limit: '1000.00',
  spent: '900.00',
  remaining: '100.00',
  percent: '90.0',
  status: 'warning',
  ...over,
})

const overview = (items: unknown[], unbudgeted: unknown[] = []) => ({
  month: '2026-11',
  items,
  totals: {
    limit: '3000.00',
    spent: '2100.00',
    remaining: '900.00',
    percent: '70.0',
    status: 'ok',
  },
  unbudgeted,
})

function setup(body: unknown, extra = {}) {
  return renderApp('/orcamento?mes=2026-11', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/categories': () => ({ status: 200, body: categories }),
    'GET /api/budgets': () => ({ status: 200, body }),
    ...extra,
  })
}

it('mostra cada orçamento com valores e situação em texto', async () => {
  setup(
    overview([
      item({}),
      item({
        id: 2,
        category_id: 20,
        category_name: 'Moradia',
        limit: '2000.00',
        spent: '1200.00',
        remaining: '800.00',
        percent: '60.0',
        status: 'ok',
      }),
    ]),
  )
  const food = await screen.findByRole('listitem', { name: /Alimentação/ })
  expect(nbsp(food.textContent)).toContain('R$ 900,00 de R$ 1.000,00')
  expect(food).toHaveTextContent('Perto do limite')
  expect(nbsp(food.textContent)).toContain('Faltam R$ 100,00')
  expect(screen.getByRole('listitem', { name: /Moradia/ })).toHaveTextContent('Dentro do limite')
  expect(nbsp(screen.getByTestId('budget-total').textContent)).toContain(
    'R$ 2.100,00 de R$ 3.000,00',
  )
})

it('estourado mostra quanto passou', async () => {
  setup(
    overview([item({ spent: '1150.00', remaining: '-150.00', percent: '115.0', status: 'over' })]),
  )
  const row = await screen.findByRole('listitem', { name: /Alimentação/ })
  expect(row).toHaveTextContent('Estourou')
  expect(nbsp(row.textContent)).toContain('R$ 150,00 acima')
})

it('mês vazio oferece copiar do mês anterior', async () => {
  let sent: unknown = null
  setup(overview([]), {
    'POST /api/budgets/copy': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 200, body: { created: 3 } }
    },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
  await waitFor(() => expect(sent).toEqual({ to_month: '2026-11' }))
})

it('novo orçamento só oferece categorias principais de despesa sem orçamento', async () => {
  let sent: unknown = null
  setup(overview([item({})]), {
    'POST /api/budgets': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 201, body: item({ id: 9, category_id: 20 }) }
    },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Novo orçamento' }))
  const dialog = await screen.findByRole('dialog')
  const select = within(dialog).getByLabelText('Categoria')
  const options = within(select)
    .getAllByRole('option')
    .map((o) => o.textContent)
  expect(options).toEqual(['Escolha…', 'Lazer', 'Moradia'])
  await userEvent.selectOptions(select, '20')
  await userEvent.type(within(dialog).getByLabelText('Limite do mês'), '350000')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar orçamento' }))
  await waitFor(() => expect(sent).toEqual({ category_id: 20, month: '2026-11', limit: '3500.00' }))
})

it('gasto sem orçamento permite definir limite direto', async () => {
  setup(
    overview(
      [item({})],
      [{ category_id: 30, category_name: 'Lazer', color: '#b88cf2', spent: '120.00' }],
    ),
  )
  const section = await screen.findByRole('region', { name: 'Gastos sem orçamento' })
  expect(nbsp(section.textContent)).toContain('R$ 120,00')
  await userEvent.click(within(section).getByRole('button', { name: 'Definir limite para Lazer' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByLabelText('Categoria')).toHaveValue('30')
})

it('editar o limite envia PATCH', async () => {
  let sent: unknown = null
  setup(overview([item({})]), {
    'PATCH /api/budgets/1': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 200, body: item({ limit: '1200.00' }) }
    },
  })
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar orçamento de Alimentação' }),
  )
  const dialog = await screen.findByRole('dialog')
  const limit = within(dialog).getByLabelText('Limite do mês')
  await userEvent.clear(limit)
  await userEvent.type(limit, '120000')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(sent).toEqual({ limit: '1200.00' }))
})

it('limite exatamente atingido não diz "faltam R$ 0,00"', async () => {
  setup(overview([item({ spent: '1000.00', remaining: '0.00', percent: '100.0', status: 'over' })]))
  const row = await screen.findByRole('listitem', { name: /Alimentação/ })
  expect(row).toHaveTextContent('Limite atingido')
  expect(row).not.toHaveTextContent('Faltam')
})

it('definir limite pelo gasto sem orçamento mantém a ordem alfabética', async () => {
  setup(
    overview(
      [item({})],
      [{ category_id: 30, category_name: 'Lazer', color: '#b88cf2', spent: '120.00' }],
    ),
  )
  const section = await screen.findByRole('region', { name: 'Gastos sem orçamento' })
  await userEvent.click(within(section).getByRole('button', { name: 'Definir limite para Lazer' }))
  const dialog = await screen.findByRole('dialog')
  const options = within(within(dialog).getByLabelText('Categoria'))
    .getAllByRole('option')
    .map((o) => o.textContent)
  expect(options).toEqual(['Escolha…', 'Lazer', 'Moradia'])
})
