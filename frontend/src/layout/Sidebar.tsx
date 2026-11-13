import { motion, useReducedMotion } from 'motion/react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/layout/nav'

type Props = { collapsed: boolean; onToggle: () => void }

export function Sidebar({ collapsed, onToggle }: Props) {
  const reduce = useReducedMotion()
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 transition-[width] duration-200 md:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <div className={cn('flex items-center px-2', collapsed && 'justify-center px-0')}>
        <Logo compact={collapsed} />
      </div>

      <nav aria-label="Principal" className="mt-8 grid gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isActive && 'bg-sidebar-accent font-medium text-foreground',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-needle"
                    transition={
                      reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }
                    }
                    className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] bg-brass [clip-path:polygon(0_0,100%_18%,100%_82%,0_100%)]"
                  />
                )}
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        className="mt-auto flex h-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>
    </aside>
  )
}
