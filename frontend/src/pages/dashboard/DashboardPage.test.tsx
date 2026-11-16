import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { currentMonth } from '@/lib/dates'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const nbsp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const account = {
  id: 1,
  name: 'Nubank',
  type: 'checking',
  initial_balance: '0.00',
  color: '#2fb5a2',
  archived: false,
  balance: '6000.00',
}

const summary = {
  month: '2026-11',
  balance: '6000.00',
  income: '5000.00',
  expense: '1250.00',
  savings_rate: '75.0',
  previous: { income: '4000.00', expense: '2500.00', savings_rate: '37.5' },
}

const cashflow = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}`,
  income: '5000.00',
  expense: '3000.00',
  net: '2000.00',
  balance: String(10000 + i * 2000) + '.00',
}))

const categories = [
  {
    id: 10,
    name: 'Alimentação',
    color: '#cda35e',
    total: '450.00',
    children: [
      { id: 11, name: 'Mercado', color: '#cda35e', total: '300.00' },
      { id: 12, name: 'Restaurantes', color: '#cda35e', total: '100.00' },
    ],
  },
  { id: 20, name: 'Moradia', color: '#2fb5a2', total: '2000.00', children: [] },
]

const tx = (over: Record<string, unknown>) => ({
  id: 1,
  kind: 'expense',
  amount: '10.00',
  date: '2026-11-10',
  description: 'Algo',
  account_id: 1,
  to_account_id: null,
  category_id: null,
  status: 'paid',
  notes: '',
  tag_ids: [],
  ...over,
})

const budgetItem = (id: number, name: string, percent: string, status: string) => ({
  id,
  category_id: id,
  category_name: name,
  color: '#2fb5a2',
  limit: '1000.00',
  spent: String(Number(percent) * 10) + '.00',
  remaining: '0.00',
  percent,
  status,
})

const budgets = {
  month: '2026-11',
  items: [
    budgetItem(1, 'Assinaturas', '111.0', 'over'),
    budgetItem(2, 'Moradia', '95.0', 'warning'),
    budgetItem(3, 'Lazer', '70.0', 'ok'),
    budgetItem(4, 'Saúde', '40.0', 'ok'),
    budgetItem(5, 'Compras', '30.0', 'ok'),
    budgetItem(6, 'Educação', '10.0', 'ok'),
  ],
  totals: { limit: '6000.00', spent: '3560.00', remaining: '2440.00' },
  unbudgeted: [],
}

function setup(path = '/', extra = {}) {
  return renderApp(path, {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/accounts': () => ({ status: 200, body: [account] }),
    'GET /api/categories': () => ({ status: 200, body: [] }),
    'GET /api/dashboard/summary': () => ({ status: 200, body: summary }),
    'GET /api/dashboard/cashflow': () => ({ status: 200, body: cashflow }),
    'GET /api/dashboard/categories': () => ({ status: 200, body: categories }),
    'GET /api/dashboard/top-expenses': () => ({
      status: 200,
      body: [tx({ id: 7, description: 'Aluguel', amount: '2000.00' })],
    }),
    'GET /api/budgets': () => ({ status: 200, body: budgets }),
    'GET /api/dashboard/invoices-due': () => ({
      status: 200,
      body: [
        {
          card_id: 3,
          card_name: 'Roxinho',
          card_color: '#b88cf2',
          reference: '2026-11',
          due_date: '2026-11-20',
          total: '1250.40',
          overdue: false,
        },
      ],
    }),
    'GET /api/dashboard/pending': () => ({
      status: 200,
      body: [tx({ id: 8, description: 'Streaming', amount: '55.90', status: 'pending' })],
    }),
    ...extra,
  })
}

it('mostra os KPIs com a variação contra o mês anterior', async () => {
  setup()
  expect(await screen.findByText('Olá, João')).toBeInTheDocument()
  const balance = await screen.findByRole('group', { name: 'Saldo total' })
  await waitFor(() => expect(nbsp(balance.textContent)).toContain('R$ 6.000,00'), {
    timeout: 3000,
  })
  const income = screen.getByRole('group', { name: 'Receitas' })
  await waitFor(() => expect(nbsp(income.textContent)).toContain('R$ 5.000,00'), {
    timeout: 3000,
  })
  expect(income).toHaveTextContent('+25,0%')
  const expense = screen.getByRole('group', { name: 'Despesas' })
  expect(expense).toHaveTextContent('-50,0%')
  const rate = screen.getByRole('group', { name: 'Taxa de poupança' })
  await waitFor(() => expect(rate).toHaveTextContent('75,0%'), { timeout: 3000 })
  expect(rate).toHaveTextContent('+37,5 p.p.')
})

it('usa o mês da URL em todos os widgets', async () => {
  const { fetchMock } = setup('/?mes=2026-10')
  await waitFor(() => {
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    for (const w of ['summary', 'cashflow', 'categories', 'top-expenses'])
      expect(urls).toContainEqual(expect.stringMatching(`/api/dashboard/${w}\\?month=2026-10`))
  })
})

it('sem mês na URL usa o mês atual', async () => {
  const { fetchMock } = setup('/')
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/dashboard/summary?month=${currentMonth()}`,
      expect.anything(),
    ),
  )
})

it('despesas por categoria em ordem e com detalhe das subcategorias', async () => {
  setup()
  const card = await screen.findByRole('region', { name: 'Despesas por categoria' })
  const rows = await within(card).findAllByRole('button', { name: /R\$/ })
  expect(rows.map((r) => r.textContent?.match(/^[^R]+/)?.[0].trim())).toEqual([
    'Moradia',
    'Alimentação',
  ])
  expect(within(card).queryByText('Mercado')).not.toBeInTheDocument()
  await userEvent.click(within(card).getByRole('button', { name: /^Alimentação/ }))
  expect(within(card).getByText('Mercado')).toBeInTheDocument()
  expect(within(card).getByText('Restaurantes')).toBeInTheDocument()
})

it('lista maiores gastos e pendentes', async () => {
  setup()
  const top = await screen.findByRole('region', { name: 'Maiores gastos' })
  expect(await within(top).findByText('Aluguel')).toBeInTheDocument()
  const upcoming = screen.getByRole('region', { name: 'Próximos vencimentos' })
  expect(await within(upcoming).findByText('Streaming')).toBeInTheDocument()
})

it('gráficos têm tabela equivalente para leitor de tela', async () => {
  setup()
  const flow = await screen.findByRole('region', { name: /Fluxo de caixa/ })
  const table = await within(flow).findByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(13) // cabeçalho + 12 meses
})

it('sem contas convida a cadastrar a primeira', async () => {
  setup('/', { 'GET /api/accounts': () => ({ status: 200, body: [] }) })
  const link = await screen.findByRole('link', { name: 'Cadastrar primeira conta' })
  expect(link).toHaveAttribute('href', '/contas')
})

it('widget com erro mostra a falha e permite tentar de novo', async () => {
  let fail = true
  setup('/', {
    'GET /api/dashboard/summary': () =>
      fail ? { status: 403, body: { detail: 'x' } } : { status: 200, body: summary },
    'GET /api/dashboard/cashflow': () => ({ status: 403, body: { detail: 'x' } }),
  })
  const kpiError = await screen.findByRole('alert', { name: 'Resumo do mês' })
  expect(kpiError).toHaveTextContent('Não foi possível carregar')
  const flow = screen.getByRole('region', { name: /Fluxo de caixa/ })
  expect(await within(flow).findByText(/Não foi possível carregar/)).toBeInTheDocument()
  expect(within(flow).queryByText(/Os meses aparecem aqui/)).not.toBeInTheDocument()
  fail = false
  await userEvent.click(within(kpiError).getByRole('button', { name: 'Tentar de novo' }))
  expect(await screen.findByRole('group', { name: 'Saldo total' })).toBeInTheDocument()
})

it('clique duplo em efetivar pendente envia uma vez só', async () => {
  // Resposta lenta: o 2º clique chega com o 1º PATCH ainda em andamento.
  const patch = vi.fn(
    () =>
      new Promise<{ status: number; body: unknown }>((resolve) =>
        setTimeout(() => resolve({ status: 200, body: tx({ id: 8, status: 'paid' }) }), 300),
      ),
  )
  setup('/', { 'PATCH /api/transactions/8': patch })
  const btn = await screen.findByRole('button', { name: 'Marcar Streaming como efetivado' })
  await userEvent.dblClick(btn)
  await waitFor(() => expect(patch).toHaveBeenCalled())
  expect(patch).toHaveBeenCalledTimes(1)
})

it('próximos vencimentos mostra a fatura com atalho para pagar', async () => {
  setup()
  const upcoming = await screen.findByRole('region', { name: 'Próximos vencimentos' })
  expect(await within(upcoming).findByText('Fatura Roxinho')).toBeInTheDocument()
  expect(nbsp(upcoming.textContent)).toContain('R$ 1.250,40')
  const pay = within(upcoming).getByRole('link', { name: 'Pagar fatura Roxinho' })
  expect(pay).toHaveAttribute('href', '/cartoes?cartao=3&fatura=2026-11')
})

it('orçamento do mês mostra as 5 categorias mais apertadas', async () => {
  setup()
  const widget = await screen.findByRole('region', { name: 'Orçamento do mês' })
  const rows = await within(widget).findAllByRole('listitem')
  expect(rows.map((r) => r.getAttribute('aria-label')?.split(':')[0])).toEqual([
    'Assinaturas',
    'Moradia',
    'Lazer',
    'Saúde',
    'Compras',
  ])
  expect(rows[0]).toHaveTextContent('Estourou')
  expect(within(widget).getByRole('link', { name: 'Ver orçamento' })).toHaveAttribute(
    'href',
    expect.stringContaining('/orcamento'),
  )
})

it('sem orçamento, o widget convida a criar', async () => {
  setup('/', {
    'GET /api/budgets': () => ({
      status: 200,
      body: { ...budgets, items: [], totals: { limit: '0.00', spent: '0.00', remaining: '0.00' } },
    }),
  })
  const widget = await screen.findByRole('region', { name: 'Orçamento do mês' })
  expect(await within(widget).findByRole('link', { name: 'Definir orçamento' })).toBeInTheDocument()
})
