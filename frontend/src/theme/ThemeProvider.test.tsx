import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ThemeToggle } from '@/theme/ThemeToggle'

const KEY = 'bussola:theme'

function setup() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

it('começa escuro por padrão', () => {
  setup()
  expect(document.documentElement).toHaveClass('dark')
})

it('toggle alterna e persiste', async () => {
  setup()
  await userEvent.click(screen.getByRole('button', { name: /tema/i }))
  expect(document.documentElement).not.toHaveClass('dark')
  expect(localStorage.getItem(KEY)).toBe('light')
})

it('respeita a preferência salva', () => {
  localStorage.setItem(KEY, 'light')
  setup()
  expect(document.documentElement).not.toHaveClass('dark')
})

it('funciona com localStorage quebrado', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  setup()
  expect(document.documentElement).toHaveClass('dark')
  await userEvent.click(screen.getByRole('button', { name: /tema/i }))
  expect(document.documentElement).not.toHaveClass('dark')
})
