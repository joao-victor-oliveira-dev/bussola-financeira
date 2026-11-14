import { Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import type { AccountOutType } from '@/api/generated/model'

export const ACCOUNT_TYPES: Record<AccountOutType, { label: string; icon: LucideIcon }> = {
  checking: { label: 'Conta corrente', icon: Landmark },
  savings: { label: 'Poupança', icon: PiggyBank },
  wallet: { label: 'Carteira', icon: Wallet },
  investment: { label: 'Investimento', icon: TrendingUp },
}

export const TX_KINDS = {
  expense: 'Despesa',
  income: 'Receita',
  transfer: 'Transferência',
} as const

export const TX_STATUS = { paid: 'Efetivado', pending: 'Pendente' } as const

export const INVOICE_STATUS = { open: 'Aberta', closed: 'Fechada', paid: 'Paga' } as const
