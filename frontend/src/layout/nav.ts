import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
  { to: '/contas', label: 'Contas', icon: Wallet },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/orcamento', label: 'Orçamento', icon: Target },
]
