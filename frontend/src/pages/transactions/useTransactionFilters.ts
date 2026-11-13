import { useSearchParams } from 'react-router'
import type {
  TransactionsListKind,
  TransactionsListParams,
  TransactionsListStatus,
} from '@/api/generated/model'
import { monthRange, parseMonth } from '@/lib/dates'

// Filtros vivem na URL: dá para voltar, recarregar e compartilhar o link.
const KEYS = {
  month: 'mes',
  account: 'conta',
  category: 'categoria',
  kind: 'tipo',
  status: 'status',
  q: 'q',
  page: 'pagina',
} as const

export type TxFilters = {
  month: string
  account: string
  category: string
  kind: '' | NonNullable<TransactionsListKind>
  status: '' | NonNullable<TransactionsListStatus>
  q: string
  page: number
}

export const PAGE_SIZE = 50

// Valores inválidos na URL (link velho, digitação) caem no padrão em vez de quebrar a API.
function parsePage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export function useTransactionFilters() {
  const [params, setParams] = useSearchParams()

  const filters: TxFilters = {
    month: parseMonth(params.get(KEYS.month)),
    account: params.get(KEYS.account) ?? '',
    category: params.get(KEYS.category) ?? '',
    kind: (params.get(KEYS.kind) ?? '') as TxFilters['kind'],
    status: (params.get(KEYS.status) ?? '') as TxFilters['status'],
    q: params.get(KEYS.q) ?? '',
    page: parsePage(params.get(KEYS.page)),
  }

  /** Atualiza filtros; qualquer mudança que não seja de página volta para a página 1. */
  const update = (patch: Partial<TxFilters>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          const name = KEYS[key as keyof TxFilters]
          if (value === '' || value === undefined || (key === 'page' && value === 1))
            next.delete(name)
          else next.set(name, String(value))
        }
        if (!('page' in patch)) next.delete(KEYS.page)
        return next
      },
      { replace: true },
    )

  const clear = () => update({ account: '', category: '', kind: '', status: '', q: '' })

  const { from, to } = monthRange(filters.month)
  const apiParams: TransactionsListParams = {
    date_from: from,
    date_to: to,
    ...(filters.account && { account: Number(filters.account) }),
    ...(filters.category && { category: Number(filters.category) }),
    ...(filters.kind && { kind: filters.kind }),
    ...(filters.status && { status: filters.status }),
    ...(filters.q.trim() && { q: filters.q.trim() }),
    page: filters.page,
    page_size: PAGE_SIZE,
  }

  const hasFilters = Boolean(
    filters.account || filters.category || filters.kind || filters.status || filters.q,
  )

  return { filters, update, clear, apiParams, hasFilters }
}
