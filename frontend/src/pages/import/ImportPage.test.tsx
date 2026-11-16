import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { joao, renderApp } from '@/test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const account = {
  id: 1,
  name: 'Nubank',
  type: 'checking',
  initial_balance: '0.00',
  color: '#b88cf2',
  archived: false,
  balance: '0.00',
}

const categories = [
  { id: 10, name: 'Mercado', kind: 'expense', parent_id: null, color: '#cda35e' },
  { id: 11, name: 'Transporte', kind: 'expense', parent_id: null, color: '#f27a6e' },
  { id: 20, name: 'Salário', kind: 'income', parent_id: null, color: '#41d095' },
]

const batch = (over: Record<string, unknown> = {}) => ({
  id: 7,
  account_id: 1,
  filename: 'extrato.csv',
  format: 'csv',
  status: 'preview',
  error: '',
  parse_errors: [],
  total_rows: 3,
  duplicate_rows: 1,
  created_count: 0,
  created_at: '2026-11-16T10:00:00Z',
  ...over,
})

const rows = [
  {
    id: 101,
    line: 2,
    date: '2026-11-03',
    description: 'Supermercado Dia',
    kind: 'expense',
    amount: '42.90',
    suggested_category_id: 10,
    is_duplicate: false,
  },
  {
    id: 102,
    line: 3,
    date: '2026-11-04',
    description: 'Uber Trip',
    kind: 'expense',
    amount: '12.00',
    suggested_category_id: null,
    is_duplicate: false,
  },
  {
    id: 103,
    line: 4,
    date: '2026-11-05',
    description: 'Empresa X',
    kind: 'income',
    amount: '7800.00',
    suggested_category_id: 20,
    is_duplicate: true,
  },
]

function setup(path = '/importar', extra = {}) {
  return renderApp(path, {
    'GET /api/auth/me': () => ({ status: 200, body: joao }),
    'GET /api/accounts': () => ({ status: 200, body: [account] }),
    'GET /api/categories': () => ({ status: 200, body: categories }),
    'GET /api/imports': () => ({ status: 200, body: [] }),
    'GET /api/rules': () => ({ status: 200, body: [] }),
    'GET /api/imports/7': () => ({ status: 200, body: { ...batch(), rows } }),
    ...extra,
  })
}

it('envia o arquivo como FormData e abre a prévia', async () => {
  let form: FormData | null = null
  const { router } = setup('/importar', {
    'POST /api/imports': (init: RequestInit) => {
      form = init.body as FormData
      return { status: 201, body: batch() }
    },
  })
  await screen.findByRole('option', { name: 'Nubank' }) // contas carregadas
  await userEvent.selectOptions(screen.getByLabelText('Conta'), '1')
  const file = new File(['Data,Valor\n'], 'extrato.csv', { type: 'text/csv' })
  await userEvent.upload(screen.getByLabelText('Arquivo do extrato'), file)
  await userEvent.click(screen.getByRole('button', { name: 'Enviar extrato' }))
  await waitFor(() => expect(form).not.toBeNull())
  expect(form!.get('account_id')).toBe('1')
  expect(form!.get('preset')).toBe('auto')
  expect((form!.get('file') as File).name).toBe('extrato.csv')
  await waitFor(() => expect(router.state.location.search).toBe('?lote=7'))
  expect(await screen.findByText('Supermercado Dia')).toBeInTheDocument()
})

it('CSV personalizado pede o mapeamento das colunas', async () => {
  let form: FormData | null = null
  setup('/importar', {
    'POST /api/imports': (init: RequestInit) => {
      form = init.body as FormData
      return { status: 201, body: batch() }
    },
  })
  await screen.findByRole('option', { name: 'Nubank' }) // contas carregadas
  await userEvent.selectOptions(screen.getByLabelText('Conta'), '1')
  await userEvent.upload(
    screen.getByLabelText('Arquivo do extrato'),
    new File(['x'], 'banco.csv', { type: 'text/csv' }),
  )
  await userEvent.selectOptions(screen.getByLabelText('Formato do CSV'), 'personalizado')
  await userEvent.type(screen.getByLabelText('Coluna da data'), 'dia')
  await userEvent.type(screen.getByLabelText('Coluna da descrição'), 'texto')
  await userEvent.type(screen.getByLabelText('Coluna do valor'), 'quanto')
  await userEvent.click(screen.getByRole('button', { name: 'Enviar extrato' }))
  await waitFor(() => expect(form).not.toBeNull())
  expect(JSON.parse(String(form!.get('mapping')))).toEqual({
    date: 'dia',
    description: 'texto',
    amount: 'quanto',
    date_format: 'dd/mm/aaaa',
    decimal: ',',
  })
})

it('prévia: duplicada vem desmarcada, sugestão preenchida e confirmar envia as edições', async () => {
  let sent: unknown = null
  setup('/importar?lote=7', {
    'POST /api/imports/7/confirm': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return { status: 200, body: { created: 2, rules_learned: 1 } }
    },
  })
  const dup = await screen.findByRole('checkbox', { name: 'Incluir Empresa X' })
  expect(dup).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Incluir Uber Trip' })).toBeChecked()
  expect(screen.getByLabelText('Categoria de Supermercado Dia')).toHaveValue('10')
  // categoria só do mesmo tipo da linha
  const uberCat = screen.getByLabelText('Categoria de Uber Trip')
  expect(within(uberCat).queryByRole('option', { name: 'Salário' })).not.toBeInTheDocument()
  await userEvent.selectOptions(uberCat, '11')
  await userEvent.click(screen.getByRole('checkbox', { name: /Lembrar as categorias/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Importar 2 lançamentos' }))
  await waitFor(() =>
    expect(sent).toEqual({
      rows: [
        { id: 101, include: true, category_id: 10 },
        { id: 102, include: true, category_id: 11 },
        { id: 103, include: false, category_id: 20 },
      ],
      learn: true,
    }),
  )
})

it('lote que falhou mostra o erro', async () => {
  setup('/importar?lote=7', {
    'GET /api/imports/7': () => ({
      status: 200,
      body: { ...batch({ status: 'failed', error: 'O arquivo não parece ser um OFX.' }), rows: [] },
    }),
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo não parece ser um OFX.')
})

it('histórico permite desfazer uma importação', async () => {
  const del = vi.fn(() => ({ status: 204 }))
  setup('/importar', {
    'GET /api/imports': () => ({
      status: 200,
      body: [batch({ status: 'done', created_count: 2 })],
    }),
    'DELETE /api/imports/7': del,
  })
  const history = await screen.findByRole('region', { name: 'Importações anteriores' })
  await userEvent.click(within(history).getByRole('button', { name: 'Desfazer extrato.csv' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
  await waitFor(() => expect(del).toHaveBeenCalled())
})

it('cria regra de categorização', async () => {
  let sent: unknown = null
  setup('/importar', {
    'POST /api/rules': (init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return {
        status: 201,
        body: {
          id: 1,
          pattern: 'uber',
          category_id: 11,
          kind: 'expense',
          priority: 0,
          active: true,
        },
      }
    },
  })
  const rules = await screen.findByRole('region', { name: 'Regras de categorização' })
  await userEvent.type(within(rules).getByLabelText('Se a descrição contém'), 'Uber')
  await userEvent.selectOptions(within(rules).getByLabelText('Categoria da regra'), '11')
  await userEvent.click(within(rules).getByRole('button', { name: 'Adicionar regra' }))
  await waitFor(() => expect(sent).toEqual({ pattern: 'Uber', category_id: 11 }))
})

it('lote que não existe mais mostra erro e permite recomeçar', async () => {
  const { router } = setup('/importar?lote=7', {
    'GET /api/imports/7': () => ({ status: 404, body: { detail: 'Não encontrado.' } }),
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não encontrado.')
  await userEvent.click(screen.getByRole('button', { name: 'Enviar outro arquivo' }))
  await waitFor(() => expect(router.state.location.search).toBe(''))
})

it('painel de regras deixa claro que aprender é opcional', async () => {
  setup()
  const rules = await screen.findByRole('region', { name: 'Regras de categorização' })
  expect(rules).toHaveTextContent('Lembrar as categorias que eu corrigir')
})
