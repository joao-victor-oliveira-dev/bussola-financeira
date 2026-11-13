import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const nbsp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

const acc = (over: Record<string, unknown>) => ({
  id: 1,
  name: 'Nubank',
  type: 'checking',
  initial_balance: '0.00',
  color: '#6c9ef8',
  archived: false,
  balance: '0.00',
  ...over,
})

const me = { 'GET /api/auth/me': () => ({ status: 200, body: joao }) }

it('lista contas com saldo formatado e saldo total', async () => {
  renderApp('/contas', {
    ...me,
    'GET /api/accounts': () => ({
      status: 200,
      body: [
        acc({ id: 1, name: 'Nubank', balance: '1234.50' }),
        acc({ id: 2, name: 'Carteira', type: 'wallet', balance: '-34.50' }),
      ],
    }),
  })
  const card = await screen.findByRole('button', { name: /Nubank/ })
  expect(nbsp(card.textContent)).toContain('R$ 1.234,50')
  expect(nbsp(screen.getByRole('button', { name: /Carteira/ }).textContent)).toContain('-R$ 34,50')
  expect(nbsp(screen.getByTestId('total-balance').textContent)).toBe('R$ 1.200,00')
})

it('arquivadas ficam recolhidas', async () => {
  renderApp('/contas', {
    ...me,
    'GET /api/accounts': () => ({
      status: 200,
      body: [acc({ id: 1 }), acc({ id: 2, name: 'Antiga', archived: true })],
    }),
  })
  const toggle = await screen.findByRole('button', { name: /Arquivadas \(1\)/ })
  expect(screen.queryByRole('button', { name: /Antiga/ })).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(screen.getByRole('button', { name: /Antiga/ })).toBeInTheDocument()
})

it('estado vazio convida a criar a primeira conta', async () => {
  renderApp('/contas', { ...me, 'GET /api/accounts': () => ({ status: 200, body: [] }) })
  expect(await screen.findByText('Nenhuma conta ainda')).toBeInTheDocument()
})

it('cria conta com o valor convertido para decimal', async () => {
  let created: unknown = null
  const list = [acc({ id: 1 })]
  renderApp('/contas', {
    ...me,
    'GET /api/accounts': () => ({ status: 200, body: list }),
    'POST /api/accounts': (init) => {
      created = JSON.parse(String(init.body))
      list.push(acc({ id: 2, name: 'Reserva', type: 'savings', balance: '1500.00' }))
      return { status: 201, body: list[1] }
    },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'Reserva')
  await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'savings')
  await userEvent.type(within(dialog).getByLabelText('Saldo inicial'), '150000')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar conta' }))
  await waitFor(() =>
    expect(created).toEqual({
      name: 'Reserva',
      type: 'savings',
      initial_balance: '1500.00',
      color: '#2fb5a2',
      archived: false,
    }),
  )
  expect(await screen.findByRole('button', { name: /Reserva/ })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('mostra o erro da API no formulário', async () => {
  renderApp('/contas', {
    ...me,
    'GET /api/accounts': () => ({ status: 200, body: [] }),
    'POST /api/accounts': () => ({
      status: 409,
      body: { detail: 'Já existe uma conta com esse nome.' },
    }),
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'Nubank')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar conta' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Já existe uma conta com esse nome.',
  )
})
