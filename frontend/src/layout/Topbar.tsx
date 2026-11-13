import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/theme/ThemeToggle'

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout().catch(() => {})
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Logo className="md:hidden" />
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        {user && (
          <span
            title={user.email}
            className="ml-1 grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold"
          >
            {initials(user.name)}
          </span>
        )}
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sair"
          title="Sair"
          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  )
}
