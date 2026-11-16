import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const account = {
  id: 1,
  name: 'Corrente',
  type: 'checking',
  initial_balance: '0.00',
  color: '#2fb5a2',
  archived: false,
  balance: '0.00',
}

const rule = {
  id: 5,
  kind: 'expense',
  amount: '2200.00',
  description: 'Aluguel',
  account_id: 1,
  credit_card_id: null,
  to_account_id: null,
  category_id: null,
  frequency: 'monthly',
  start_date: '2026-01-10',
  end_date: null,
  active: true,
  next_dates: ['2026-12-10', '2027-01-10', '2027-02-10'],
}

function setup(extra = {}, rules: unknown[] = [rule]) {
  return renderApp('/recorrencias', {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/accounts': () => ({ status: 200, body: [account] }),
    'GET /api/cards': () => ({ status: 200, body: [] }),
    'GET /api/categories': () => ({ status: 200, body: [] }),
    'GET /api/recurring': () => ({ status: 200, body: rules }),
    ...extra,
  })
}

it('lista a regra com frequência e próximas datas', async () => {
  setup()
  const row = await screen.findByRole('listitem', { name: 'Aluguel' })
  expect(row).toHaveTextContent('Mensal, todo dia 10')
  expect(row).toHaveTextContent('Próximas: 10 de dez, 10 de jan, 10 de fev')
  expect(row).toHaveTextContent('Corrente')
})

it('cria uma recorrência', async () => {
  let sent: unknown = null
  setup({
    'POST /api/recurring': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 201, body: { ...rule, id: 6 } }
    },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Nova recorrência' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Valor'), '5590')
  await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Streaming')
  await userEvent.selectOptions(within(dialog).getByLabelText('Frequência'), 'monthly')
  await userEvent.clear(within(dialog).getByLabelText('Começa em'))
  await userEvent.type(within(dialog).getByLabelText('Começa em'), '2026-11-18')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar recorrência' }))
  await waitFor(() =>
    expect(sent).toEqual({
      kind: 'expense',
      amount: '55.90',
      description: 'Streaming',
      account_id: 1,
      credit_card_id: null,
      to_account_id: null,
      category_id: null,
      frequency: 'monthly',
      start_date: '2026-11-18',
      end_date: null,
      active: true,
    }),
  )
})

it('pausa uma regra', async () => {
  let sent: unknown = null
  setup({
    'PATCH /api/recurring/5': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 200, body: { ...rule, active: false, next_dates: [] } }
    },
  })
  const row = await screen.findByRole('listitem', { name: 'Aluguel' })
  await userEvent.click(within(row).getByRole('switch', { name: 'Ativa' }))
  await waitFor(() => expect(sent).toEqual({ active: false }))
})

it('estado vazio', async () => {
  setup({}, [])
  expect(await screen.findByText('Nenhuma recorrência ainda')).toBeInTheDocument()
})
