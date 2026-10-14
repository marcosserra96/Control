import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Archive, ChevronRight, CreditCard, Plus, WalletCards } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { Amount, EmptyState, ErrorNotice, ProgressBar } from '@/components/ui/display'
import { formatBRL } from '@/domain/money'
import { ACCOUNT_TYPE_LABEL, type Account, type Cents } from '@/domain/types'
import { useAccounts, useBalances } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { AccountForm } from './AccountForm'

export function AccountsPage() {
  const accounts = useAccounts()
  const balances = useBalances()
  const [params, setParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(params.get('nova') === '1')
  const [formKey, setFormKey] = useState(0)
  const [showArchived, setShowArchived] = useState(false)

  const all = accounts.data ?? []
  const bal = (a: Account) => balances.data?.get(a.id) ?? a.initialBalance
  const visible = all.filter((a) => showArchived || !a.archived)
  const regular = visible.filter((a) => a.type !== 'credit_card')
  const cards = visible.filter((a) => a.type === 'credit_card')
  const archivedCount = all.filter((a) => a.archived).length
  const total = regular.filter((a) => a.includeInTotal && !a.archived).reduce((s, a) => s + bal(a), 0)

  function openForm(v: boolean) {
    setFormOpen(v)
    if (!v && params.has('nova')) setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Contas e cartões"
        actions={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => { setFormKey((k) => k + 1); openForm(true) }}>Nova</Button>}
      />
      {(accounts.error || balances.error) && <ErrorNotice error={accounts.error ?? balances.error} onRetry={() => { accounts.refetch(); balances.refetch() }} />}

      {accounts.isPending ? <RowsSkeleton /> : all.length === 0 ? (
        <EmptyState icon={<WalletCards className="size-5" />} title="Nenhuma conta ainda"
          action={<Button onClick={() => openForm(true)}>Cadastrar conta</Button>}>
          Cadastre contas bancárias, carteira e cartões de crédito para acompanhar saldos e faturas.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section aria-labelledby="contas">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 id="contas" className="text-[15px] font-bold">Contas</h2>
              <span className="text-sm text-muted">Total <Amount value={total} type={total < 0 ? 'auto' : 'neutral'} className="font-semibold text-ink" /></span>
            </div>
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {regular.map((a) => <AccountItem key={a.id} account={a} balance={bal(a)} />)}
              {regular.length === 0 && <li className="p-5 text-sm text-faint">Nenhuma conta cadastrada.</li>}
            </ul>
          </section>

          <section aria-labelledby="cartoes">
            <h2 id="cartoes" className="mb-3 px-1 text-[15px] font-bold">Cartões de crédito</h2>
            <ul className="flex flex-col gap-3">
              {cards.map((a) => <CardItem key={a.id} card={a} balance={bal(a)} />)}
              {cards.length === 0 && (
                <li className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-5 text-sm text-muted">
                  Cadastre um cartão para acompanhar faturas e parcelas.
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
          <Archive className="size-4" aria-hidden />
          {showArchived ? 'Esconder arquivadas' : `Mostrar arquivadas (${archivedCount})`}
        </button>
      )}

      <AccountForm key={formKey} account={null} open={formOpen} onOpenChange={openForm} />
    </>
  )
}

function AccountItem({ account, balance }: { account: Account; balance: Cents }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link to={`/contas/${account.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-raised/60">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${account.color} 18%, transparent)` }}>
          <span className="size-3 rounded-full" style={{ background: account.color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{account.name}{account.archived && <span className="ml-2 text-[12px] font-medium text-faint">arquivada</span>}</span>
          <span className="text-[13px] text-faint">{ACCOUNT_TYPE_LABEL[account.type]}{!account.includeInTotal && ' · fora do total'}</span>
        </span>
        <Amount value={balance} type={balance < 0 ? 'auto' : 'neutral'} className="font-semibold" />
        <ChevronRight className="size-4 text-faint" aria-hidden />
      </Link>
    </li>
  )
}

function CardItem({ card, balance }: { card: Account; balance: Cents }) {
  const used = Math.max(-balance, 0)
  const ratio = card.creditLimit ? used / card.creditLimit : 0
  return (
    <li>
      <Link to={`/contas/${card.id}`}
        className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-line-strong">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-14 shrink-0 items-end rounded-lg p-1.5" style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 55%, #000))` }}>
            <CreditCard className="size-4 text-white/80" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{card.name}{card.archived && <span className="ml-2 text-[12px] font-medium text-faint">arquivado</span>}</span>
            <span className="text-[13px] text-faint">Fecha dia {card.closingDay} · vence dia {card.dueDay}</span>
          </span>
          <ChevronRight className="mt-2 size-4 text-faint" aria-hidden />
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-muted">Usado</span>
            <span className="num font-semibold">{formatBRL(used)}{card.creditLimit ? <span className="font-normal text-faint"> de {formatBRL(card.creditLimit)}</span> : null}</span>
          </div>
          {card.creditLimit ? <ProgressBar value={ratio} tone={ratio > 0.9 ? 'loss' : ratio > 0.7 ? 'warn' : card.color} label="Limite usado" /> : null}
        </div>
      </Link>
    </li>
  )
}
