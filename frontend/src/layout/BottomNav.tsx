import { motion, useReducedMotion } from 'motion/react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/layout/nav'

export function BottomNav() {
  const reduce = useReducedMotion()
  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.filter((item) => item.mobile !== false).map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                  isActive && 'text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="bottom-needle"
                      transition={
                        reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }
                      }
                      className="absolute -top-px h-0.5 w-8 rounded-full bg-brass"
                    />
                  )}
                  <Icon className="size-5" aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
