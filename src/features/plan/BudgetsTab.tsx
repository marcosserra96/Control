import { useId, useState } from 'react'
import { PiggyBank, Plus } from 'lucide-react'
import { MonthSwitcher, useMonth } from '@/app/month'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Amount, EmptyState, ErrorNotice, Panel, ProgressBar } from '@/components/ui/display'
import { Field, MoneyInput, Select } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { budgetProgress, byCategory } from '@/domain/analytics'
import { daysInMonth, monthLabel, parseISODate, today } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import type { Budget, Category } from '@/domain/types'
import { useBudgets, useCategories, useMonthTransactions, useRepoMutation } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { cn } from '@/lib/cn'

export function BudgetsTab() {
  const { month, isCurrent } = useMonth()
  const budgets = useBudgets()
  const categories = useCategories()
  const txs = useMonthTransactions(month)
  const [editing, setEditing] = useState<{ budget: Budget | null; categoryId?: string } | null>(null)

  const progress = budgetProgress(budgets.data ?? [], categories.data ?? [], txs.data ?? [])
  const budgeted = new Set((budgets.data ?? []).map((b) => b.categoryId))
  const catMap = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const unbudgeted = byCategory(txs.data ?? []).filter((s) => s.categoryId && !budgeted.has(s.categoryId))

  const totalLimit = progress.reduce((s, p) => s + p.budget.amount, 0)
  const totalSpent = progress.reduce((s, p) => s + p.spent, 0)

  // Ritmo: no mês atual, compara o gasto com a fração do mês que já passou
  const { y, m, d } = parseISODate(today())
  const elapsed = isCurrent ? d / daysInMonth(y, m) : 1
  const pace = totalLimit ? totalSpent / totalLimit : 0

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <MonthSwitcher className="-ml-2" />
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ budget: null })}>Novo limite</Button>
      </div>

      {(budgets.error || txs.error) && <ErrorNotice error={budgets.error ?? txs.error} onRetry={() => { budgets.refetch(); txs.refetch() }} />}

      {budgets.isPending ? <RowsSkeleton /> : progress.length === 0 ? (
        <EmptyState icon={<PiggyBank className="size-5" />} title="Defina quanto quer gastar por categoria"
          action={<Button onClick={() => setEditing({ budget: null })}>Definir primeiro limite</Button>}>
          O limite vale para todos os meses. Você acompanha aqui e no Início quanto ainda pode gastar.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Panel className="self-start">
            <p className="text-sm font-semibold text-muted first-letter:uppercase">Gasto em {monthLabel(month)}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <Amount value={totalSpent} className="display text-[34px] font-semibold leading-tight" />
              <span className="num text-sm text-muted">de {formatBRL(totalLimit)}</span>
            </p>
            <div className="relative mt-4">
              <ProgressBar value={pace} tone={pace > 1 ? 'loss' : pace > elapsed + 0.05 ? 'warn' : 'gain'} label="Total do orçamento" className="h-2" />
              {isCurrent && (
                <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `${elapsed * 100}%` }} title="Hoje" aria-hidden />
              )}
            </div>
            <p className="mt-3 text-[13px] text-muted">
              {totalSpent > totalLimit
                ? `Você passou ${formatBRL(totalSpent - totalLimit)} do total planejado.`
                : isCurrent
                  ? pace > elapsed + 0.05
                    ? `Gastando mais rápido que o mês: ${Math.round(pace * 100)}% do orçamento em ${Math.round(elapsed * 100)}% dos dias.`
                    : `No ritmo: ${Math.round(pace * 100)}% do orçamento em ${Math.round(elapsed * 100)}% dos dias.`
                  : `Sobraram ${formatBRL(totalLimit - totalSpent)} do planejado.`}
            </p>
          </Panel>

          <div className="flex flex-col gap-6">
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {progress.map((p) => (
                <li key={p.budget.id} className="border-b border-line last:border-0">
                  <button onClick={() => setEditing({ budget: p.budget })} className="flex w-full items-center gap-3.5 px-4 py-4 text-left hover:bg-raised/60">
                    <CategoryIcon icon={p.category?.icon} color={p.category?.color} />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">{p.category?.name ?? 'Categoria removida'}</span>
                        <span className="num shrink-0 text-sm"><span className="font-semibold">{formatBRL(p.spent)}</span><span className="text-faint"> / {formatBRL(p.budget.amount)}</span></span>
                      </span>
                      <ProgressBar value={p.ratio} tone={p.state === 'over' ? 'loss' : p.state === 'warning' ? 'warn' : 'gain'} label={p.category?.name} />
                      <span className={cn('mt-1.5 block text-[12px]', p.state === 'over' ? 'font-semibold text-loss' : 'text-faint')}>
                        {p.state === 'over' ? `${formatBRL(-p.remaining)} acima do limite` : `Pode gastar mais ${formatBRL(p.remaining)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {unbudgeted.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-[15px] font-bold">Gastos sem limite</h2>
                <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                  {unbudgeted.map((s) => {
                    const c = catMap.get(s.categoryId!)
                    return (
                      <li key={s.categoryId} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-0">
                        <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c?.name}</span>
                        <Amount value={s.amount} className="text-sm font-semibold" />
                        <Button variant="ghost" size="sm" onClick={() => setEditing({ budget: null, categoryId: s.categoryId! })}>Limitar</Button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {editing && (
        <BudgetForm
          key={editing.budget?.id ?? editing.categoryId ?? 'new'}
          budget={editing.budget}
          initialCategoryId={editing.categoryId}
          categories={(categories.data ?? []).filter((c) => c.kind === 'expense' && !c.archived && (c.id === editing.budget?.categoryId || !budgeted.has(c.id)))}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function BudgetForm({
  budget, initialCategoryId, categories, onClose,
}: {
  budget: Budget | null
  initialCategoryId?: string
  categories: Category[]
  onClose: () => void
}) {
  const toast = useToast()
  const id = useId()
  const [open, setOpen] = useState(true)
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? '')
  const [amount, setAmount] = useState<number | null>(budget?.amount ?? null)
  const [submitted, setSubmitted] = useState(false)
  const error = !amount || amount <= 0 ? 'Informe um limite maior que zero.' : null

  const save = useRepoMutation((repo) => repo.saveBudget({ id: budget?.id, categoryId, amount: amount! }), ['budgets'])
  const remove = useRepoMutation((repo) => repo.deleteBudget(budget!.id), ['budgets'])

  const close = (v: boolean) => { setOpen(v); if (!v) setTimeout(onClose, 200) }

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={budget ? 'Editar limite' : 'Novo limite mensal'}
      footer={
        <>
          {budget && (
            <Button variant="danger" loading={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => { close(false); toast.success('Limite removido') }, onError: toast.error })}>
              Remover
            </Button>
          )}
          <Button type="submit" form={id} block size="lg" loading={save.isPending}>Salvar</Button>
        </>
      }
    >
      <form id={id} className="flex flex-col gap-5" noValidate onSubmit={(e) => {
        e.preventDefault(); setSubmitted(true)
        if (error || !categoryId) return
        save.mutate(undefined, { onSuccess: () => { close(false); toast.success('Limite salvo') }, onError: toast.error })
      }}>
        <Field label="Categoria" htmlFor={`${id}-cat`}>
          <Select id={`${id}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={Boolean(budget)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Limite por mês" htmlFor={`${id}-amount`} error={submitted ? error : null}>
          <MoneyInput id={`${id}-amount`} value={amount} onChange={setAmount} autoFocus invalid={submitted && !!error} />
        </Field>
      </form>
    </Sheet>
  )
}
