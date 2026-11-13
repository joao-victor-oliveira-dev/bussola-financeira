import { animate, useReducedMotionConfig } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Número que "conta" até o valor ao montar e a cada mudança (KPIs do painel).
 * Só para exibição: o valor exato continua vindo da API como string decimal.
 */
export function useCountUp(value: number, duration = 0.9): number {
  const reduce = useReducedMotionConfig()
  const [display, setDisplay] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (reduce) return
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        from.current = v
        setDisplay(v)
      },
    })
    return () => controls.stop()
  }, [value, duration, reduce])

  return reduce ? value : display
}
