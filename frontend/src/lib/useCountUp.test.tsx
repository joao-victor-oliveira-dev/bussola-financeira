import { render, screen, waitFor } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { useCountUp } from '@/lib/useCountUp'

function Probe({ value }: { value: number }) {
  return <span data-testid="v">{useCountUp(value).toFixed(2)}</span>
}

it('com movimento reduzido mostra o valor final na hora', () => {
  render(
    <MotionConfig reducedMotion="always">
      <Probe value={1234.5} />
    </MotionConfig>,
  )
  expect(screen.getByTestId('v')).toHaveTextContent('1234.50')
})

it('anima até chegar ao valor final', async () => {
  render(<Probe value={80} />)
  await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('80.00'), {
    timeout: 3000,
  })
})

it('acompanha mudanças de valor', async () => {
  const { rerender } = render(
    <MotionConfig reducedMotion="always">
      <Probe value={10} />
    </MotionConfig>,
  )
  rerender(
    <MotionConfig reducedMotion="always">
      <Probe value={25} />
    </MotionConfig>,
  )
  await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('25.00'))
})
