import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Amount, EmptyState, ErrorNotice, Panel, ProgressBar, Skeleton } from '@/components/ui/display'
import { Segmented } from '@/components/ui/Field'
import { byCategory, monthlySeries, totals } from '@/domain/analytics'
import { addMonths, endOfMonth, monthLabel, monthOf, monthShort, today } from '@/domain/dates'
import { formatAxis, formatBRL } from '@/domain/money'
import { useCategories, useTransactions } from '@/data/queries'
import { cn } from '@/lib/cn'

type Period = '3' | '6' | '12'

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>('6')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const current = monthOf(today())
  const from = addMonths(current, -(Number(period) - 1))
  const to = endOfMonth(current)
  const txs = useTransactions({ from, to })
  const categories = useCategories()
  const catMap = new Map((categories.data ?? []).map((c) => [c.id, c]))

  const data = txs.data ?? []
  const series = useMemo(() => monthlySeries(data, from, current), [data, from, current])
  const sum = totals(data)
  const months = Number(period)
  const savingsRate = sum.income ? sum.net / sum.income : 0
  const slices = byCategory(data, kind)
  const maxSlice = slices[0]?.amount ?? 1

  const chartData = series.map((p) => ({
    label: monthShort(p.month), month: p.month,
    Receitas: p.income / 100, Despesas: p.expense / 100,
  }))

  return (
    <>
      <PageHeader title="Relatórios">
        <Segmented label="Período" value={period} onChange={setPeriod} className="mt-1 max-w-sm"
          options={[{ value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} />
      </PageHeader>
      {txs.error && <ErrorNotice error={txs.error} onRetry={() => txs.refetch()} />}

      {!txs.isPending && data.length === 0 ? (
        <EmptyState icon={<BarChart3 className="size-5" />} title="Ainda não há dados para comparar">
          Os relatórios aparecem conforme você lança receitas e despesas.
        </EmptyState>
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity', txs.isPlaceholderData && 'opacity-60')}>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line md:grid-cols-4">
            <Kpi label="Entrou" loading={txs.isPending}><Amount value={sum.income} className="text-gain" /></Kpi>
            <Kpi label="Saiu" loading={txs.isPending}><Amount value={sum.expense} className="text-loss" /></Kpi>
            <Kpi label="Gasto médio por mês" loading={txs.isPending}><Amount value={Math.round(sum.expense / months)} /></Kpi>
            <Kpi label="Quanto sobrou" loading={txs.isPending}
              note={sum.income ? `${Math.round(savingsRate * 100)}% do que entrou` : undefined}>
              <Amount value={sum.net} type="auto" />
            </Kpi>
          </dl>

          <Panel title="Entradas e saídas por mês">
            {txs.isPending ? <Skeleton className="h-64 w-full" /> : (
              <div className="h-64 md:h-72" role="img" aria-label="Gráfico de barras com receitas e despesas por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={3} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--c-line)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--c-muted)', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--c-faint)', fontSize: 11 }}
                      tickFormatter={(v: number) => formatAxis(v * 100)} />
                    <Tooltip
                      cursor={{ fill: 'var(--c-raised)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]!.payload as (typeof chartData)[number]
                        return (
                          <div className="rounded-xl border border-line-strong bg-raised px-3.5 py-2.5 text-sm shadow-xl">
                            <p className="mb-1 font-bold first-letter:uppercase">{monthLabel(row.month)}</p>
                            <p className="num text-gain">Entrou {formatBRL(Math.round(row.Receitas * 100))}</p>
                            <p className="num text-loss">Saiu {formatBRL(Math.round(row.Despesas * 100))}</p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="Receitas" fill="var(--c-gain)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Despesas" fill="var(--c-loss)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex gap-5 text-[13px] text-muted">
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-gain" aria-hidden />Receitas</span>
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-loss" aria-hidden />Despesas</span>
            </div>
          </Panel>

          <Panel title="Por categoria">
            <Segmented label="Tipo" value={kind} onChange={setKind} className="mb-4 max-w-xs"
              options={[{ value: 'expense', label: 'Despesas', tone: 'loss' }, { value: 'income', label: 'Receitas', tone: 'gain' }]} />
            {txs.isPending ? <Skeleton className="h-40 w-full" /> : slices.length === 0 ? (
              <p className="py-4 text-sm text-faint">Nada neste período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[12px] text-faint">
                    <th className="pb-2 font-semibold">Categoria</th>
                    <th className="hidden pb-2 text-right font-semibold sm:table-cell">Média/mês</th>
                    <th className="pb-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {slices.map((s) => {
                    const c = s.categoryId ? catMap.get(s.categoryId) : undefined
                    return (
                      <tr key={s.categoryId ?? 'none'} className="border-t border-line">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="mb-1.5 flex justify-between gap-2">
                                <span className="truncate font-semibold">{c?.name ?? 'Sem categoria'}</span>
                                <span className="num text-[12px] text-faint">{Math.round(s.share * 100)}%</span>
                              </div>
                              <ProgressBar value={s.amount / maxSlice} tone={c?.color ?? 'var(--c-muted)'} label={c?.name} />
                            </div>
                          </div>
                        </td>
                        <td className="num hidden py-3 text-right text-muted sm:table-cell">{formatBRL(Math.round(s.amount / months))}</td>
                        <td className="num py-3 pl-3 text-right font-semibold">{formatBRL(s.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}

function Kpi({ label, children, note, loading }: { label: string; children: React.ReactNode; note?: string; loading?: boolean }) {
  return (
    <div className="bg-surface p-4 md:p-5">
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-[20px] font-bold md:text-[22px]">{loading ? <Skeleton className="h-7 w-28" /> : children}</dd>
      {note && !loading && <dd className="mt-0.5 text-[12px] text-faint">{note}</dd>}
    </div>
  )
}
