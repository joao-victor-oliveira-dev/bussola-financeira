import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const nbsp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const account = {
  id: 1,
  name: 'Corrente',
  type: 'checking',
  initial_balance: '0.00',
  color: '#2fb5a2',
  archived: false,
  balance: '5000.00',
}

const card = {
  id: 3,
  name: 'Roxinho',
  limit: '8000.00',
  closing_day: 10,
  due_day: 20,
  payment_account_id: 1,
  color: '#b88cf2',
  archived: false,
  limit_used: '2000.00',
  current_invoice: {
    reference: '2026-11',
    closing_date: '2026-11-10',
    due_date: '2026-11-20',
    total: '1250.40',
    status: 'open',
    payment_id: null,
  },
}

const item = {
  id: 50,
  kind: 'expense',
  amount: '400.00',
  date: '2026-11-03',
  description: 'Notebook (2/10)',
  account_id: null,
  credit_card_id: 3,
  to_account_id: null,
  to_credit_card_id: null,
  invoice: '2026-11',
  installment: '2/10',
  recurring_rule_id: null,
  category_id: null,
  status: 'paid',
  notes: '',
  tag_ids: [],
}

const invoice = (status = 'closed') => ({
  ...card.current_invoice,
  status,
  payment_id: status === 'paid' ? 99 : null,
  card_id: 3,
  items: [item],
})

function setup(path = '/cartoes', extra = {}) {
  return renderApp(path, {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/accounts': () => ({ status: 200, body: [account] }),
    'GET /api/categories': () => ({ status: 200, body: [] }),
    'GET /api/cards': () => ({ status: 200, body: [card] }),
    'GET /api/cards/3/invoices/2026-11': () => ({ status: 200, body: invoice() }),
    ...extra,
  })
}

it('lista cartões com limite usado e a fatura atual', async () => {
  setup()
  const tile = await screen.findByRole('button', { name: /Roxinho/ })
  expect(nbsp(tile.textContent)).toContain('R$ 1.250,40')
  const usage = screen.getByText(/de R\$ 8\.000,00/)
  expect(nbsp(usage.textContent)).toContain('R$ 2.000,00 de R$ 8.000,00')
})

it('cria cartão', async () => {
  let sent: unknown = null
  setup('/cartoes', {
    'POST /api/cards': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 201, body: { ...card, id: 4, name: 'Azul' } }
    },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Novo cartão' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'Azul')
  await userEvent.type(within(dialog).getByLabelText('Limite'), '500000')
  await userEvent.clear(within(dialog).getByLabelText('Dia de fechamento'))
  await userEvent.type(within(dialog).getByLabelText('Dia de fechamento'), '3')
  await userEvent.clear(within(dialog).getByLabelText('Dia de vencimento'))
  await userEvent.type(within(dialog).getByLabelText('Dia de vencimento'), '10')
  await userEvent.selectOptions(within(dialog).getByLabelText('Conta de pagamento'), '1')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar cartão' }))
  await waitFor(() =>
    expect(sent).toEqual({
      name: 'Azul',
      limit: '5000.00',
      closing_day: 3,
      due_day: 10,
      payment_account_id: 1,
      color: '#6c9ef8',
      archived: false,
    }),
  )
})

it('dia fora de 1..28 é recusado no formulário', async () => {
  const { fetchMock } = setup()
  await userEvent.click(await screen.findByRole('button', { name: 'Novo cartão' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'X')
  await userEvent.clear(within(dialog).getByLabelText('Dia de fechamento'))
  await userEvent.type(within(dialog).getByLabelText('Dia de fechamento'), '31')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar cartão' }))
  expect(await within(dialog).findByText('Use um dia entre 1 e 28.')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalledWith(
    '/api/cards',
    expect.objectContaining({ method: 'POST' }),
  )
})

it('abre a fatura pelo link e paga', async () => {
  let paid: unknown = null
  setup('/cartoes?cartao=3&fatura=2026-11', {
    'POST /api/cards/3/invoices/2026-11/pay': (init: RequestInit) => {
      paid = JSON.parse(String(init.body))
      return { status: 200, body: { ...card.current_invoice, status: 'paid', payment_id: 99 } }
    },
  })
  const panel = await screen.findByRole('region', { name: 'Fatura Roxinho' })
  expect(await within(panel).findByText('Notebook (2/10)')).toBeInTheDocument()
  expect(within(panel).getByText('Parcela 2/10')).toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: 'Pagar fatura' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByLabelText('Pagar com a conta')).toHaveValue('1')
  await userEvent.click(within(dialog).getByRole('button', { name: /Confirmar pagamento/ }))
  await waitFor(() => expect(paid).toMatchObject({ account_id: 1 }))
  expect((paid as { date: string }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

it('fatura paga oferece desfazer o pagamento', async () => {
  const unpay = vi.fn(() => ({ status: 200, body: card.current_invoice }))
  setup('/cartoes?cartao=3&fatura=2026-11', {
    'GET /api/cards/3/invoices/2026-11': () => ({ status: 200, body: invoice('paid') }),
    'DELETE /api/cards/3/invoices/2026-11/pay': unpay,
  })
  const panel = await screen.findByRole('region', { name: 'Fatura Roxinho' })
  expect(await within(panel).findByText('Paga')).toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: 'Desfazer pagamento' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
  await waitFor(() => expect(unpay).toHaveBeenCalled())
})

it('estado vazio sem cartões', async () => {
  setup('/cartoes', { 'GET /api/cards': () => ({ status: 200, body: [] }) })
  expect(await screen.findByText('Nenhum cartão ainda')).toBeInTheDocument()
})
