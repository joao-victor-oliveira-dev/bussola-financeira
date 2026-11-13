import { render, screen } from '@testing-library/react'
import App from '@/App'

it('renderiza o nome do app', () => {
  render(<App />)
  expect(screen.getByText('Bússola')).toBeInTheDocument()
})
