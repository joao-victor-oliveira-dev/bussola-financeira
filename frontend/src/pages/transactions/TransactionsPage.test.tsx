import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { currentMonth, formatDayHeader, monthRange, shiftMonth, toISODate } from '@/lib/dates'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const nbsp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const accounts = [
  {
    id: 1,
    name: 'Corrente',
    type: 'checking',
    initial_balance: '0.00',
    color: '#2fb5a2',
    archived: false,
    balance: '0.00',
  },
  {
    id: 2,
    name: 'Reserva',
    type: 'savings',
    initial_balance: '0.00',
    color: '#6c9ef8',
    archived: false,
    balance: '0.00',
  },
]
const categories = [
  { id: 10, name: 'Alimentação', kind: 'expense', parent_id: null, color: '#cda35e' },
  { id: 11, name: 'Mercado', kind: 'expense', parent_id: 10, color: '#cda35e' },
  { id: 20, name: 'Salário', kind: 'income', parent_id: null, color: '#41d095' },
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

const page = (items: unknown[], totals = { income: '0.00', expense: '0.00', net: '0.00' }) => ({
  items,
  count: items.length,
  page: 1,
  page_size: 50,
  totals,
})

function setup(extra = {}, items: unknown[] = [], path = '/lancamentos') {
  return renderApp(path, {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/accounts': () => ({ status: 200, body: accounts }),
    'GET /api/categories': () => ({ status: 200, body: categories }),
    'GET /api/tags': () => ({ status: 200, body: [] }),
    'GET /api/transactions': () => ({ status: 200, body: page(items) }),
    ...extra,
  })
}

it('agrupa por dia e mostra os totais do filtro', async () => {
  setup({
    'GET /api/transactions': () => ({
      status: 200,
      body: page(
        [
          tx({
            id: 1,
            date: '2026-11-10',
            description: 'Salário',
            kind: 'income',
            amount: '5000.00',
            category_id: 20,
          }),
          tx({ id: 2, date: '2026-11-10', description: 'Feira', amount: '42.90', category_id: 11 }),
          tx({
            id: 3,
            date: '2026-11-03',
            description: 'Guardar',
            kind: 'transfer',
            to_account_id: 2,
            amount: '300.00',
          }),
        ],
        { income: '5000.00', expense: '42.90', net: '4957.10' },
      ),
    }),
  })
  const day10 = await screen.findByRole('region', { name: formatDayHeader('2026-11-10') })
  expect(within(day10).getByText('Salário', { selector: 'p' })).toBeInTheDocument()
  expect(within(day10).getByText('Feira')).toBeInTheDocument()
  expect(within(day10).getByText(/Mercado/)).toBeInTheDocument()
  const day3 = screen.getByRole('region', { name: formatDayHeader('2026-11-03') })
  expect(within(day3).getByText('Corrente → Reserva')).toBeInTheDocument()
  expect(nbsp(screen.getByTestId('total-income').textContent)).toContain('R$ 5.000,00')
  expect(nbsp(screen.getByTestId('total-expense').textContent)).toContain('R$ 42,90')
  expect(nbsp(screen.getByTestId('total-net').textContent)).toContain('R$ 4.957,10')
})

it('busca o mês atual e navega para o mês anterior', async () => {
  const { fetchMock } = setup()
  const now = monthRange(currentMonth())
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`date_from=${now.from}&date_to=${now.to}`),
      expect.anything(),
    ),
  )
  await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
  const prev = monthRange(shiftMonth(currentMonth(), -1))
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`date_from=${prev.from}&date_to=${prev.to}`),
      expect.anything(),
    ),
  )
})

it('estado vazio no mês', async () => {
  setup()
  expect(await screen.findByText('Nenhum lançamento neste mês')).toBeInTheDocument()
})

it('o formulário troca os campos conforme o tipo', async () => {
  setup()
  await userEvent.click(await screen.findByRole('button', { name: 'Novo lançamento' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByLabelText('Categoria')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Transferência' }))
  expect(within(dialog).queryByLabelText('Categoria')).not.toBeInTheDocument()
  expect(within(dialog).getByLabelText('Para a conta')).toBeInTheDocument()
})

it('cria despesa enviando o valor convertido', async () => {
  let sent: unknown = null
  setup({
    'POST /api/transactions': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 201, body: tx({ id: 99 }) }
    },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Novo lançamento' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Valor'), '4290')
  expect(within(dialog).getByLabelText('Valor')).toHaveValue('42,90')
  await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Feira')
  await userEvent.selectOptions(within(dialog).getByLabelText('Conta'), '1')
  await userEvent.selectOptions(within(dialog).getByLabelText('Categoria'), '11')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar lançamento' }))
  await waitFor(() =>
    expect(sent).toEqual({
      kind: 'expense',
      amount: '42.90',
      date: toISODate(new Date()),
      description: 'Feira',
      account_id: 1,
      to_account_id: null,
      category_id: 11,
      status: 'paid',
      notes: '',
      tag_ids: [],
    }),
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('valida valor e descrição antes de enviar', async () => {
  const { fetchMock } = setup()
  await userEvent.click(await screen.findByRole('button', { name: 'Novo lançamento' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar lançamento' }))
  expect(await within(dialog).findByText('Informe um valor maior que zero.')).toBeInTheDocument()
  expect(within(dialog).getByText('Informe a descrição.')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalledWith('/api/transactions', expect.anything())
})

it('a tecla N abre o modal, mas não enquanto digita na busca', async () => {
  setup()
  const search = await screen.findByLabelText('Buscar')
  await userEvent.type(search, 'n')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(document.body)
  await userEvent.keyboard('n')
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

it('excluir pede confirmação', async () => {
  const del = vi.fn(() => ({ status: 204 }))
  setup({ 'DELETE /api/transactions/2': del }, [tx({ id: 2, description: 'Feira' })])
  await userEvent.click(await screen.findByRole('button', { name: 'Ações de Feira' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
  expect(del).not.toHaveBeenCalled()
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
  await waitFor(() => expect(del).toHaveBeenCalled())
})

it('página além da última volta para a página 1', async () => {
  const { fetchMock } = setup(
    {
      'GET /api/transactions': () => ({
        status: 200,
        body: { ...page([]), count: 10, page: 3 },
      }),
    },
    [],
    '/lancamentos?pagina=3',
  )
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=1&'), expect.anything()),
  )
})

it('parâmetros inválidos na URL caem no mês atual e na página 1', async () => {
  const { fetchMock } = setup({}, [], '/lancamentos?mes=2026-13x&pagina=-1')
  const now = monthRange(currentMonth())
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`date_from=${now.from}&date_to=${now.to}&page=1&`),
      expect.anything(),
    ),
  )
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('NaN'), expect.anything())
})

it('a tecla N não abre o formulário com a confirmação de exclusão aberta', async () => {
  setup({}, [tx({ id: 2, description: 'Feira' })])
  await userEvent.click(await screen.findByRole('button', { name: 'Ações de Feira' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
  await screen.findByRole('alertdialog')
  await userEvent.keyboard('n')
  expect(screen.queryByRole('dialog', { name: 'Novo lançamento' })).not.toBeInTheDocument()
})

it('editar transferência com destino arquivado mantém o destino visível', async () => {
  const archivedAccounts = accounts.map((a) => (a.id === 2 ? { ...a, archived: true } : a))
  setup({ 'GET /api/accounts': () => ({ status: 200, body: archivedAccounts }) }, [
    tx({ id: 5, kind: 'transfer', description: 'Guardar', to_account_id: 2 }),
  ])
  await userEvent.click(await screen.findByText('Guardar'))
  const dialog = await screen.findByRole('dialog')
  const dest = within(dialog).getByLabelText('Para a conta') as HTMLSelectElement
  expect(dest.value).toBe('2')
  expect(dest.selectedOptions[0]?.textContent).toBe('Reserva')
})
