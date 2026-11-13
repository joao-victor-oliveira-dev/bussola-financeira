import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CashflowPoint } from '@/api/generated/model'
import { ChartCard } from '@/components/charts/ChartCard'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { formatBRL } from '@/lib/money'
import { monthLong, monthTick, moneyTick } from '@/pages/dashboard/chartFormat'

const SERIES = [
  { key: 'income', name: 'Receitas', color: 'var(--chart-income)' },
  { key: 'expense', name: 'Despesas', color: 'var(--chart-expense)' },
] as const

export function CashflowChart({ data, loading }: { data?: CashflowPoint[]; loading: boolean }) {
  const rows = (data ?? []).map((p) => ({
    month: p.month,
    income: Number(p.income),
    expense: Number(p.expense),
    net: Number(p.net),
  }))
  const empty = rows.every((r) => r.income === 0 && r.expense === 0)

  return (
    <ChartCard
      title="Fluxo de caixa"
      description="Receitas e despesas dos últimos 12 meses"
      loading={loading}
      empty={!loading && empty}
      emptyText="Os meses aparecem aqui conforme você registra lançamentos."
      className="lg:col-span-2"
      actions={
        <ul className="flex gap-4 text-sm text-muted-foreground" aria-label="Legenda">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      }
    >
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ left: 4, right: 4 }}>
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
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={(props) => (
                <ChartTooltip
                  {...props}
                  labelFormatter={monthLong}
                  footer={(payload) => {
                    const net = (payload[0] as { payload?: { net: number } })?.payload?.net ?? 0
                    return (
                      <p className="mt-1.5 flex justify-between border-t border-border pt-1.5">
                        <span className="text-muted-foreground">Resultado</span>
                        <span className="font-medium tabular-nums">{formatBRL(net)}</span>
                      </p>
                    )
                  }}
                />
              )}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Fluxo de caixa mensal</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Receitas</th>
            <th scope="col">Despesas</th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => (
            <tr key={p.month}>
              <th scope="row">{monthLong(p.month)}</th>
              <td>{formatBRL(p.income)}</td>
              <td>{formatBRL(p.expense)}</td>
              <td>{formatBRL(p.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  )
}
