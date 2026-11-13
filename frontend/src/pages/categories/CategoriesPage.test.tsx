import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const cat = (id: number, name: string, kind = 'expense', parent_id: number | null = null) => ({
  id,
  name,
  kind,
  parent_id,
  color: '#2fb5a2',
})

const base = (extra = {}) => ({
  'GET /api/auth/me': () => ({ status: 200, body: joao }),
  'GET /api/categories': () => ({
    status: 200,
    body: [cat(1, 'Alimentação'), cat(2, 'Mercado', 'expense', 1), cat(3, 'Salário', 'income')],
  }),
  'GET /api/tags': () => ({ status: 200, body: [{ id: 9, name: 'viagem', color: '#6c9ef8' }] }),
  ...extra,
})

it('mostra a árvore de despesas e troca para receitas', async () => {
  renderApp('/categorias', base())
  const food = await screen.findByRole('button', { name: 'Editar Alimentação' })
  const group = food.closest('li')!
  expect(within(group).getByRole('button', { name: 'Editar Mercado' })).toBeInTheDocument()
  expect(screen.queryByText('Salário')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: 'Receitas' }))
  expect(await screen.findByRole('button', { name: 'Editar Salário' })).toBeInTheDocument()
})

it('cria subcategoria pelo atalho do grupo', async () => {
  let sent: unknown = null
  renderApp(
    '/categorias',
    base({
      'POST /api/categories': (init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return { status: 201, body: cat(4, 'Padaria', 'expense', 1) }
      },
    }),
  )
  await userEvent.click(
    await screen.findByRole('button', { name: 'Nova subcategoria em Alimentação' }),
  )
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByLabelText('Categoria pai')).toHaveValue('1')
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'Padaria')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar categoria' }))
  await waitFor(() =>
    expect(sent).toEqual({ name: 'Padaria', kind: 'expense', parent_id: 1, color: '#2fb5a2' }),
  )
})

it('erro ao excluir categoria em uso aparece no modal', async () => {
  renderApp(
    '/categorias',
    base({
      'DELETE /api/categories/2': () => ({
        status: 409,
        body: { detail: 'Esta categoria tem lançamentos e não pode ser excluída.' },
      }),
    }),
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Editar Mercado' }))
  const dialog = await screen.findByRole('dialog', { name: 'Editar categoria' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir categoria' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Esta categoria tem lançamentos',
  )
})

it('lista e cria tags', async () => {
  let sent: unknown = null
  renderApp(
    '/categorias',
    base({
      'POST /api/tags': (init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return { status: 201, body: { id: 10, name: 'casa', color: '#2fb5a2' } }
      },
    }),
  )
  await userEvent.click(await screen.findByRole('tab', { name: 'Tags' }))
  expect(await screen.findByRole('button', { name: 'Editar viagem' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Nova tag' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'casa')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar tag' }))
  await waitFor(() => expect(sent).toEqual({ name: 'casa', color: '#2fb5a2' }))
})
