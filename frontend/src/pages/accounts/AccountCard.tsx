import { motion, useReducedMotion } from 'motion/react'
import type { AccountOut } from '@/api/generated/model'
import { Money } from '@/components/Money'
import { ACCOUNT_TYPES } from '@/finance/labels'

export function AccountCard({
  account,
  index,
  onOpen,
}: {
  account: AccountOut
  index: number
  onOpen: () => void
}) {
  const reduce = useReducedMotion()
  const { label, icon: Icon } = ACCOUNT_TYPES[account.type]
  return (
    <motion.button
      type="button"
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.04, ease: 'easeOut' }}
      onClick={onOpen}
      className="group relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: account.color }}
      />
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-xl"
          style={{ backgroundColor: `${account.color}26`, color: account.color }}
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{account.name}</span>
          <span className="block text-sm text-muted-foreground">{label}</span>
        </span>
      </span>
      <Money
        value={account.balance}
        tone="auto"
        className="text-2xl font-semibold tracking-tight"
      />
    </motion.button>
  )
}
