import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  Repeat,
  Shapes,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/** `mobile: false` deixa o item fora da barra inferior (cabem 5). */
export type NavItem = { to: string; label: string; icon: LucideIcon; mobile?: false }

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
  { to: '/contas', label: 'Contas', icon: Wallet },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/orcamento', label: 'Orçamento', icon: Target },
  { to: '/recorrencias', label: 'Recorrências', icon: Repeat, mobile: false },
  { to: '/categorias', label: 'Categorias', icon: Shapes, mobile: false },
]
