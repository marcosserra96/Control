import { Link, useNavigate } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, ListOrdered, PiggyBank, Target, WalletCards } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { MonthSwitcher, useMonth } from '@/app/month'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Amount, EmptyState, ErrorNotice, Panel, ProgressBar, Skeleton } from '@/components/ui/display'
import { budgetProgress, byCategory, goalProgress, totals } from '@/domain/analytics'
import { dayLabel, monthLabel, today } from '@/domain/dates'
import { formatBRL, formatPlain } from '@/domain/money'
import type { Account, Cents } from '@/domain/types'
import {
  useAccounts, useBalances, useBudgets, useCategories, useContributions, useGoals, useMonthTransactions,
} from '@/data/queries'
import { TransactionRow, useLookup } from '@/features/transactions/TransactionRow'
import { useTxSheet } from '@/features/transactions/TransactionSheet'
import { cn } from '@/lib/cn'

export function DashboardPage() {
  const { month } = useMonth()
  const accounts = useAccounts()
  const balances = useBalances()
  const categories = useCategories()
  const txs = useMonthTransactions(month)
  const { openNew, openEdit } = useTxSheet()
  const lookup = useLookup(accounts.data, categories.data)

  const error = accounts.error ?? balances.error ?? txs.error
  const loading = accounts.isPending || balances.isPending

  const active = (accounts.data ?? []).filter((a) => !a.archived)
  const bal = (a: Account) => balances.data?.[a.id] ?? a.initialBalance
  const cash = active.filter((a) => a.type !== 'credit_card' && a.includeInTotal).reduce((s, a) => s + bal(a), 0)
  const cardDebt = active.filter((a) => a.type === 'credit_card').reduce((s, a) => s + Math.min(bal(a), 0), 0)

  const monthTxs = txs.data ?? []
  const done = totals(monthTxs.filter((t) => t.paid))
  const all = totals(monthTxs)
  const recent = [...monthTxs].filter((t) => t.date <= today() || t.paid).slice(0, 6)

  if (!loading && active.length === 0 && !error) return <FirstRun />

  return (
    <>
      <PageHeader title="Início" actions={<MonthSwitcher className="hidden md:flex" />} />
      {error && <div className="mb-4"><ErrorNotice error={error} onRetry={() => { accounts.refetch(); balances.refetch(); txs.refetch() }} /></div>}

      {/* Herói: quanto há disponível agora */}
      <section aria-labelledby="saldo" className="mb-8 md:mb-10">
        <p id="saldo" className="mb-1 text-sm font-semibold text-muted">Saldo em contas</p>
        {loading ? <Skeleton className="h-16 w-64" /> : (
          <p className="display num flex items-baseline gap-2 text-[52px] font-semibold leading-none md:text-[72px]">
            <span className="text-[0.42em] font-semibold text-faint">R$</span>
            <span className={cn(cash < 0 && 'text-loss')}>{cash < 0 && '−'}{formatPlain(cash)}</span>
          </p>
        )}
        {cardDebt < 0 && (
          <p className="mt-3 text-sm text-muted">
            <Amount value={-cardDebt} className="font-semibold text-ink" /> comprometidos nos cartões
          </p>
        )}
      </section>

      <MonthSwitcher className="-ml-2 mb-3 md:hidden" />

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <MonthLedger income={done.income} expense={done.expense} plannedIncome={all.income} plannedExpense={all.expense} loading={txs.isPending} />
          <div className="flex flex-col gap-4 lg:hidden">
            <PendingPanel />
            <BudgetsPreview />
          </div>
          <CategoryBreakdown />
          <Panel
            title="Últimos lançamentos"
            action={<Link to="/extrato" className="text-sm font-semibold text-brass hover:underline">Ver extrato</Link>}
            padded={false}
          >
            <div className="px-3 pb-3 pt-1">
              {txs.isPending ? <RowsSkeleton /> : recent.length ? recent.map((t) => (
                <TransactionRow key={t.id} tx={t} lookup={lookup} onClick={() => openEdit(t)} showDate />
              )) : (
                <EmptyState compact icon={<ListOrdered className="size-5" />} title={`Nada lançado em ${monthLabel(month)}`}
                  action={<Button size="sm" onClick={() => openNew()}>Lançar agora</Button>} />
              )}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <AccountsPanel accounts={active} balanceOf={bal} loading={loading} />
          {/* No computador, a coluna lateral; no celular, essas vêm logo após o resultado */}
          <div className="hidden flex-col gap-6 lg:flex">
            <PendingPanel />
            <BudgetsPreview />
          </div>
          <GoalsPreview />
        </div>
      </div>
    </>
  )
}

function PendingPanel() {
  const { month } = useMonth()
  const txs = useMonthTransactions(month)
  const { openEdit } = useTxSheet()
  const pending = (txs.data ?? []).filter((t) => !t.paid && t.type !== 'transfer').sort((a, b) => a.date.localeCompare(b.date))
  if (pending.length === 0) return null
  return (
    <Panel title="A pagar e receber" padded={false}
      action={<span className="text-[13px] font-semibold text-muted">{pending.length}</span>}>
      <ul className="px-3 pb-3 pt-1">
        {pending.slice(0, 5).map((t) => {
          const late = t.date < today()
          return (
            <li key={t.id}>
              <button onClick={() => openEdit(t)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-raised/70">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', late ? 'bg-loss-soft text-loss' : 'bg-raised text-muted')}>
                  <CalendarClock className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.description}</span>
                  <span className={cn('text-[12px] first-letter:uppercase', late ? 'font-semibold text-loss' : 'text-faint')}>
                    {late ? `Atrasado · ${dayLabel(t.date)}` : dayLabel(t.date)}
                  </span>
                </span>
                <Amount value={t.amount} type={t.type} sign className="text-sm font-semibold" />
              </button>
            </li>
          )
        })}
      </ul>
      {pending.length > 5 && (
        <p className="px-5 pb-4 text-[13px] text-muted">E mais {pending.length - 5} no Extrato, filtro Pendentes.</p>
      )}
    </Panel>
  )
}

function MonthLedger({
  income, expense, plannedIncome, plannedExpense, loading,
}: {
  income: Cents; expense: Cents; plannedIncome: Cents; plannedExpense: Cents; loading: boolean
}) {
  const { month } = useMonth()
  const net = income - expense
  const scale = Math.max(income, expense, 1)
  const pendingIn = plannedIncome - income
  const pendingOut = plannedExpense - expense
  const projected = plannedIncome - plannedExpense

  return (
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-sm font-semibold text-muted first-letter:uppercase">Resultado de {monthLabel(month)}</p>
          {loading ? <Skeleton className="mt-2 h-9 w-40" /> : (
            <Amount value={net} type="auto" sign className="display mt-1 block text-[34px] font-semibold leading-none" />
          )}
        </div>
        {!loading && (pendingIn > 0 || pendingOut > 0) && (
          <p className="text-[13px] text-muted">
            Com os pendentes, o mês fecha em{' '}
            <Amount value={projected} type="auto" sign className="font-semibold" />
          </p>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4">
        <LedgerLine label="Entrou" value={income} pending={pendingIn} ratio={income / scale} tone="gain"
          icon={<ArrowDownLeft className="size-4" aria-hidden />} />
        <LedgerLine label="Saiu" value={expense} pending={pendingOut} ratio={expense / scale} tone="loss"
          icon={<ArrowUpRight className="size-4" aria-hidden />} />
      </dl>
    </Panel>
  )
}

function LedgerLine({
  label, value, pending, ratio, tone, icon,
}: {
  label: string; value: Cents; pending: Cents; ratio: number; tone: 'gain' | 'loss'; icon: React.ReactNode
}) {
  return (
    <div>
      <dt className={cn('mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold', tone === 'gain' ? 'text-gain' : 'text-loss')}>
        {icon}{label}
      </dt>
      <dd>
        <span className="num block text-[19px] font-bold">{formatBRL(value)}</span>
        <ProgressBar value={ratio} tone={tone} className="mt-2.5" label={label} />
        {pending > 0 && <span className="num mt-2 block text-[12px] text-faint">+ {formatBRL(pending)} pendente</span>}
      </dd>
    </div>
  )
}

function AccountsPanel({ accounts, balanceOf, loading }: { accounts: Account[]; balanceOf: (a: Account) => Cents; loading: boolean }) {
  return (
    <Panel title="Contas e cartões" padded={false}
      action={<Link to="/contas" className="text-sm font-semibold text-brass hover:underline">Gerenciar</Link>}>
      <ul className="px-3 pb-3 pt-1">
        {loading && <RowsSkeleton count={3} />}
        {accounts.map((a) => {
          const b = balanceOf(a)
          const isCard = a.type === 'credit_card'
          return (
            <li key={a.id}>
              <Link to={`/contas/${a.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-raised/70">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</span>
                {isCard ? (
                  <span className="text-right">
                    <span className="num block text-sm font-semibold">{formatBRL(Math.max(-b, 0))}</span>
                    {a.creditLimit ? <span className="num block text-[11px] text-faint">de {formatBRL(a.creditLimit)}</span> : null}
                  </span>
                ) : (
                  <Amount value={b} type={b < 0 ? 'auto' : 'neutral'} className="text-sm font-semibold" />
                )}
                <ChevronRight className="size-4 text-faint" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function CategoryBreakdown() {
  const { month } = useMonth()
  const txs = useMonthTransactions(month)
  const categories = useCategories()
  const slices = byCategory(txs.data ?? []).slice(0, 6)
  const catMap = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const max = slices[0]?.amount ?? 1

  return (
    <Panel title="Para onde foi o dinheiro"
      action={<Link to="/relatorios" className="text-sm font-semibold text-brass hover:underline">Relatórios</Link>}>
      {txs.isPending ? <RowsSkeleton count={4} /> : slices.length === 0 ? (
        <p className="py-4 text-sm text-faint">Sem despesas neste mês.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {slices.map((s) => {
            const c = s.categoryId ? catMap.get(s.categoryId) : undefined
            return (
              <li key={s.categoryId ?? 'none'} className="flex items-center gap-3">
                <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{c?.name ?? 'Sem categoria'}</span>
                    <span className="num shrink-0 text-sm font-semibold">
                      {formatBRL(s.amount)}
                      <span className="ml-2 inline-block w-9 text-right text-[12px] font-medium text-faint">{Math.round(s.share * 100)}%</span>
                    </span>
                  </div>
                  <ProgressBar value={s.amount / max} tone={c?.color ?? 'var(--c-muted)'} label={c?.name} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function BudgetsPreview() {
  const { month } = useMonth()
  const budgets = useBudgets()
  const categories = useCategories()
  const txs = useMonthTransactions(month)
  const progress = budgetProgress(budgets.data ?? [], categories.data ?? [], txs.data ?? []).slice(0, 4)

  return (
    <Panel title="Orçamento do mês"
      action={<Link to="/planejar" className="text-sm font-semibold text-brass hover:underline">Ajustar</Link>}>
      {budgets.isPending ? <RowsSkeleton count={3} /> : progress.length === 0 ? (
        <EmptyState compact icon={<PiggyBank className="size-5" />} title="Nenhum limite definido"
          action={<Link to="/planejar" className="text-sm font-semibold text-brass">Definir limites</Link>} />
      ) : (
        <ul className="flex flex-col gap-4">
          {progress.map((p) => (
            <li key={p.budget.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{p.category?.name ?? 'Categoria removida'}</span>
                <span className={cn('num shrink-0 text-[13px]', p.state === 'over' ? 'font-semibold text-loss' : 'text-muted')}>
                  {p.state === 'over' ? `${formatBRL(-p.remaining)} acima` : `restam ${formatBRL(p.remaining)}`}
                </span>
              </div>
              <ProgressBar value={p.ratio} tone={p.state === 'over' ? 'loss' : p.state === 'warning' ? 'warn' : 'gain'} label={p.category?.name} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function GoalsPreview() {
  const goals = useGoals()
  const contributions = useContributions()
  const list = (goals.data ?? []).filter((g) => !g.archived).slice(0, 3)
  if (!goals.isPending && list.length === 0) return null
  return (
    <Panel title="Metas" action={<Link to="/planejar/metas" className="text-sm font-semibold text-brass hover:underline">Ver todas</Link>}>
      {goals.isPending ? <RowsSkeleton count={2} /> : (
        <ul className="flex flex-col gap-4">
          {list.map((g) => {
            const p = goalProgress(g, contributions.data ?? [], today())
            return (
              <li key={g.id} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${g.color} 16%, transparent)`, color: g.color }}>
                  <Target className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">{g.name}</span>
                    <span className="num shrink-0 text-[13px] text-muted">{Math.min(Math.round(p.ratio * 100), 100)}%</span>
                  </div>
                  <ProgressBar value={p.ratio} tone={g.color} label={g.name} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function FirstRun() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Boas-vindas" />
      <div className="max-w-xl">
        <p className="mb-8 text-[17px] text-muted">
          Para começar, cadastre onde seu dinheiro fica: conta do banco, poupança, carteira e cartões de crédito.
          O saldo inicial é o valor que está lá hoje.
        </p>
        <ol className="mb-8 flex flex-col gap-3">
          {[
            ['Cadastre suas contas e cartões', 'Com o saldo de hoje e, nos cartões, os dias de fechamento e vencimento.'],
            ['Lance o que entra e o que sai', 'Pelo botão de lançar. Parcelas e contas fixas se repetem sozinhas.'],
            ['Defina limites por categoria', 'Em Planejar, para ver cedo quando um gasto está saindo do controle.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="display flex size-8 shrink-0 items-center justify-center rounded-full bg-brass-soft text-[15px] font-bold text-brass">{i + 1}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <Button size="lg" icon={<WalletCards className="size-5" />} onClick={() => navigate('/contas?nova=1')}>
          Cadastrar primeira conta
        </Button>
      </div>
    </>
  )
}

export function RowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3 py-1" aria-label="Carregando">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1"><Skeleton className="mb-1.5 h-3.5 w-2/5" /><Skeleton className="h-3 w-1/4" /></div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
