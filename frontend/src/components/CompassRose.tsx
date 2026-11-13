import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5)
const CARDINALS = [
  { label: 'N', angle: 0 },
  { label: 'L', angle: 90 },
  { label: 'S', angle: 180 },
  { label: 'O', angle: 270 },
]

/**
 * Rosa dos ventos da tela de entrada. A agulha oscila e assenta: o único movimento da página.
 * A agulha é simétrica em torno de (200,200), então o transform-origin padrão (centro do bbox) é o pivô.
 */
export function CompassRose({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={cn('w-full max-w-[420px]', className)}>
      <circle cx="200" cy="200" r="188" fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx="200" cy="200" r="150" fill="none" stroke="var(--primary)" strokeOpacity=".35" />
      {TICKS.map((a) => (
        <line
          key={a}
          x1="200"
          y1={a % 45 === 0 ? 20 : 28}
          x2="200"
          y2="40"
          stroke={a % 90 === 0 ? 'var(--brass)' : 'var(--muted-foreground)'}
          strokeOpacity={a % 45 === 0 ? 0.9 : 0.35}
          strokeWidth={a % 45 === 0 ? 2 : 1}
          transform={`rotate(${a} 200 200)`}
        />
      ))}
      {CARDINALS.map(({ label, angle }) => {
        const rad = (angle * Math.PI) / 180
        return (
          <text
            key={label}
            x={200 + 132 * Math.sin(rad)}
            y={200 - 132 * Math.cos(rad)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="18"
            fontWeight="600"
            fill={label === 'N' ? 'var(--brass)' : 'var(--muted-foreground)'}
          >
            {label}
          </text>
        )
      })}
      <motion.g
        initial={reduce ? { rotate: 35 } : { rotate: -140 }}
        animate={{ rotate: 35 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: 'spring', stiffness: 38, damping: 7, mass: 1.2, delay: 0.25 }
        }
      >
        <path d="M200 78 L218 200 L182 200 Z" fill="var(--brass)" />
        <path d="M200 322 L182 200 L218 200 Z" fill="var(--foreground)" fillOpacity=".7" />
      </motion.g>
      <circle
        cx="200"
        cy="200"
        r="9"
        fill="var(--background)"
        stroke="var(--brass)"
        strokeWidth="2"
      />
    </svg>
  )
}
