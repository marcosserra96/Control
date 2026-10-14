import { useDeferredValue, useMemo, useState } from 'react'
import { ListOrdered, Search, SlidersHorizontal, X } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { MonthSwitcher, useMonth } from '@/app/month'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Amount, EmptyState, ErrorNotice } from '@/components/ui/display'
import { totals } from '@/domain/analytics'
import { dayLabel, monthLabel } from '@/domain/dates'
import type { Transaction } from '@/domain/types'
import { useAccounts, useCategories, useMonthTransactions } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { cn } from '@/lib/cn'
import { TransactionRow, useLookup } from './TransactionRow'
import { useTxSheet } from './TransactionSheet'

type TypeFilter = 'all' | 'expense' | 'income' | 'transfer' | 'pending'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'expense', label: 'Despesas' },
  { value: 'income', label: 'Receitas' },
  { value: 'transfer', label: 'Transferências' },
  { value: 'pending', label: 'Pendentes' },
]

function normalize(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function TransactionsPage() {
  const { month } = useMonth()
  const txs = useMonthTransactions(month)
  const accounts = useAccounts()
  const categories = useCategories()
  const lookup = useLookup(accounts.data, categories.data)
  const { openNew, openEdit } = useTxSheet()

  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(() => {
    const q = normalize(deferredQuery.trim())
    return (txs.data ?? []).filter((t) => {
      if (type === 'pending' ? t.paid : type !== 'all' && t.type !== type) return false
      if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false
      if (categoryId && t.categoryId !== categoryId) return false
      if (q) {
        const cat = t.categoryId ? lookup.categories.get(t.categoryId)?.name ?? '' : ''
        if (!normalize(`${t.description} ${t.notes ?? ''} ${cat}`).includes(q)) return false
      }
      return true
    })
  }, [txs.data, deferredQuery, type, accountId, categoryId, lookup.categories])

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filtered) {
      const list = map.get(t.date)
      if (list) list.push(t)
      else map.set(t.date, [t])
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const sum = totals(filtered)
  const activeFilters = Number(Boolean(accountId)) + Number(Boolean(categoryId))
  const anyFilter = Boolean(query || type !== 'all' || activeFilters)

  function clear() {
    setQuery(''); setType('all'); setAccountId(''); setCategoryId('')
  }

  return (
    <>
      <PageHeader title="Extrato" actions={<MonthSwitcher className="hidden md:flex" />}>
        <MonthSwitcher className="-ml-2 mt-1 md:hidden" />
      </PageHeader>

      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-bg/90 px-4 pb-3 pt-safe backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-0 md:backdrop-blur-none">
        <div className="flex gap-2 pt-2 md:pt-0">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por descrição ou categoria"
              aria-label="Buscar lançamentos"
              className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[15px] placeholder:text-faint focus:border-brass focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-label="Filtrar por conta ou categoria"
            className={cn(
              'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors',
              showFilters || activeFilters ? 'border-brass bg-brass-soft text-brass' : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            <SlidersHorizontal className="size-[18px]" />
            {activeFilters > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-brass text-[10px] font-bold text-brass-ink">{activeFilters}</span>
            )}
          </button>
        </div>

        <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="radiogroup" aria-label="Tipo">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              role="radio"
              aria-checked={type === f.value}
              onClick={() => setType(f.value)}
              className="h-8 shrink-0 rounded-full border border-line px-3.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink aria-checked:border-ink aria-checked:bg-ink aria-checked:text-bg"
            >
              {f.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:max-w-lg">
            <Select aria-label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-11">
              <option value="">Todas as contas</option>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Select aria-label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-11">
              <option value="">Todas as categorias</option>
              {(categories.data ?? []).filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      {txs.error && <ErrorNotice error={txs.error} onRetry={() => txs.refetch()} />}

      {!txs.isPending && filtered.length > 0 && (
        <dl className="mb-4 grid grid-cols-3 gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-center md:max-w-xl">
          <div><dt className="text-[12px] font-semibold text-muted">Receitas</dt><dd><Amount value={sum.income} className="text-[15px] font-bold text-gain" /></dd></div>
          <div><dt className="text-[12px] font-semibold text-muted">Despesas</dt><dd><Amount value={sum.expense} className="text-[15px] font-bold text-loss" /></dd></div>
          <div><dt className="text-[12px] font-semibold text-muted">Resultado</dt><dd><Amount value={sum.net} type="auto" className="text-[15px] font-bold" /></dd></div>
        </dl>
      )}

      {txs.isPending ? <RowsSkeleton count={8} /> : groups.length === 0 ? (
        anyFilter ? (
          <EmptyState icon={<Search className="size-5" />} title="Nenhum lançamento encontrado"
            action={<Button variant="secondary" size="sm" icon={<X className="size-4" />} onClick={clear}>Limpar filtros</Button>}>
            Tente outra busca ou remova os filtros.
          </EmptyState>
        ) : (
          <EmptyState icon={<ListOrdered className="size-5" />} title={`Nada lançado em ${monthLabel(month)}`}
            action={<Button onClick={() => openNew()}>Novo lançamento</Button>}>
            Tudo o que entra e sai aparece aqui, agrupado por dia.
          </EmptyState>
        )
      ) : (
        <div className={cn('flex flex-col gap-5 transition-opacity', txs.isPlaceholderData && 'opacity-60')}>
          {groups.map(([date, list]) => {
            const dayNet = totals(list).net
            return (
              <section key={date} aria-label={dayLabel(date)}>
                <header className="mb-1 flex items-baseline justify-between px-2">
                  <h2 className="text-[13px] font-bold text-muted first-letter:uppercase">{dayLabel(date)}</h2>
                  {dayNet !== 0 && <Amount value={dayNet} type="auto" muted className="text-[13px] font-semibold text-faint" />}
                </header>
                <div className="rounded-[var(--radius-card)] border border-line bg-surface p-1.5">
                  {list.map((t) => <TransactionRow key={t.id} tx={t} lookup={lookup} onClick={() => openEdit(t)} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
