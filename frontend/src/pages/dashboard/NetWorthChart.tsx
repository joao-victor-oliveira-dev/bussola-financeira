import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CashflowPoint } from '@/api/generated/model'
import { ChartCard } from '@/components/charts/ChartCard'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { formatBRL } from '@/lib/money'
import { monthLong, monthTick, moneyTick } from '@/pages/dashboard/chartFormat'

export function NetWorthChart({ data, loading }: { data?: CashflowPoint[]; loading: boolean }) {
  const rows = useMemo(
    () => (data ?? []).map((p) => ({ month: p.month, balance: Number(p.balance) })),
    [data],
  )
  const empty = rows.every((r) => r.balance === 0)

  return (
    <ChartCard
      title="Patrimônio"
      description="Saldo somado das contas no fim de cada mês"
      loading={loading}
      empty={!loading && empty}
      className="lg:col-span-2"
    >
      <div className="min-h-56 flex-1" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ left: 4, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="networth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickFormatter={monthTick}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <YAxis
              tickFormatter={moneyTick}
              tickLine={false}
              axisLine={false}
              width={72}
              domain={['auto', 'auto']}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              content={(props) => <ChartTooltip {...props} labelFormatter={monthLong} />}
            />
            <Area
              type="monotone"
              dataKey="balance"
              name="Patrimônio"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#networth-fill)"
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* <table> ignora o width do sr-only: o wrapper é que esconde */}
      <div className="sr-only">
        <table>
          <caption>Patrimônio no fim de cada mês</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Patrimônio</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.month}>
                <th scope="row">{monthLong(p.month)}</th>
                <td>{formatBRL(p.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
