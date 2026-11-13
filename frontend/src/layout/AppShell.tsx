import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { BottomNav } from '@/layout/BottomNav'
import { Sidebar } from '@/layout/Sidebar'
import { Topbar } from '@/layout/Topbar'

const COLLAPSE_KEY = 'bussola:sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function storeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
  } catch {
    // preferência vale só nesta sessão
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const { pathname } = useLocation()
  const reduce = useReducedMotion()

  const toggle = () => {
    storeCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <motion.main
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-10"
        >
          <Outlet />
        </motion.main>
      </div>
      <BottomNav />
    </div>
  )
}
