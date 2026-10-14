import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight, FileUp, Pencil, Plus } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { MonthSwitcher, useMonth } from '@/app/month'
import { Button, IconButton } from '@/components/ui/Button'
import { Amount, Badge, EmptyState, ErrorNotice, Panel } from '@/components/ui/display'
import { totals } from '@/domain/analytics'
import { addMonths, endOfMonth, monthLabel, shortDate, today } from '@/domain/dates'
import { buildInvoices, invoiceMonthFor, type Invoice, type InvoiceStatus } from '@/domain/invoice'
import { formatBRL } from '@/domain/money'
import { ACCOUNT_TYPE_LABEL, type Account } from '@/domain/types'
import { useAccounts, useBalances, useCardTransactions, useCategories, useTransactions } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { TransactionRow, useLookup } from '@/features/transactions/TransactionRow'
import { useTxSheet } from '@/features/transactions/TransactionSheet'
import { AccountForm } from './AccountForm'

export function AccountDetailPage() {
  const { id } = useParams()
  const accounts = useAccounts()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const account = accounts.data?.find((a) => a.id === id)

  if (accounts.isPending) return <><div className="h-24" /><RowsSkeleton /></>
  if (!account) {
    return (
      <EmptyState title="Conta não encontrada" action={<Link to="/contas" className="font-semibold text-brass">Ver contas</Link>}>
        Ela pode ter sido excluída em outro aparelho.
      </EmptyState>
    )
  }

  return (
    <>
      <PageHeader
        title={account.name}
        actions={<IconButton label="Editar conta" onClick={() => setEditOpen(true)}><Pencil className="size-[18px]" /></IconButton>}
      >
        <Link to="/contas" className="-ml-1 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> {ACCOUNT_TYPE_LABEL[account.type]}
        </Link>
      </PageHeader>
      {account.type === 'credit_card' ? <CardView card={account} /> : <AccountView account={account} />}
      <AccountForm key={String(editOpen)} account={account} open={editOpen} onOpenChange={setEditOpen}
        onDeleted={() => navigate('/contas', { replace: true })} />
    </>
  )
}

function AccountView({ account }: { account: Account }) {
  const navigate = useNavigate()
  const { month } = useMonth()
  const balances = useBalances()
  const txs = useTransactions({ from: month, to: endOfMonth(month), accountId: account.id })
  const accounts = useAccounts()
  const categories = useCategories()
  const lookup = useLookup(accounts.data, categories.data)
  const { openNew, openEdit } = useTxSheet()
  const balance = balances.data?.[account.id] ?? account.initialBalance

  const flow = useMemo(() => {
    let inflow = 0, outflow = 0
    for (const t of txs.data ?? []) {
      if (!t.paid) continue
      const isIn = t.type === 'income' || (t.type === 'transfer' && t.toAccountId === account.id)
      if (isIn) inflow += t.amount
      else outflow += t.amount
    }
    return { inflow, outflow }
  }, [txs.data, account.id])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel>
          <p className="text-sm font-semibold text-muted">Saldo atual</p>
          <Amount value={balance} type={balance < 0 ? 'auto' : 'neutral'} className="display mt-1 block text-[38px] font-semibold leading-tight" />
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div><dt className="text-muted first-letter:uppercase">Entradas em {monthLabel(month)}</dt><dd><Amount value={flow.inflow} className="font-semibold text-gain" /></dd></div>
            <div><dt className="text-muted first-letter:uppercase">Saídas em {monthLabel(month)}</dt><dd><Amount value={flow.outflow} className="font-semibold text-loss" /></dd></div>
          </dl>
        </Panel>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => openNew({ accountId: account.id })}>Lançar</Button>
          <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => navigate(`/importar?conta=${account.id}`)}>Importar</Button>
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Movimentação</h2>
          <MonthSwitcher />
        </div>
        {txs.error && <ErrorNotice error={txs.error} onRetry={() => txs.refetch()} />}
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-1.5">
          {txs.isPending ? <RowsSkeleton /> : (txs.data ?? []).length === 0 ? (
            <EmptyState compact title="Sem movimentação neste mês" />
          ) : (txs.data ?? []).map((t) => (
            <TransactionRow key={t.id} tx={t} lookup={lookup} perspective={account.id} showDate onClick={() => openEdit(t)} />
          ))}
        </div>
      </div>
    </div>
  )
}

const STATUS: Record<InvoiceStatus, { label: string; tone: 'neutral' | 'gain' | 'loss' | 'brass' | 'warn' }> = {
  open: { label: 'Aberta', tone: 'brass' },
  closed: { label: 'Fechada', tone: 'warn' },
  paid: { label: 'Paga', tone: 'gain' },
  overdue: { label: 'Vencida', tone: 'loss' },
  future: { label: 'Próxima', tone: 'neutral' },
}

function CardView({ card }: { card: Account }) {
  const navigate = useNavigate()
  const current = invoiceMonthFor(today(), card.closingDay!, card.dueDay!)
  const [selected, setSelected] = useState(current)
  // Carrega uma janela ao redor da fatura escolhida (parcelas futuras incluídas)
  const from = addMonths(selected, -6)
  const to = addMonths(selected, 12)
  const txs = useCardTransactions(card.id, from, to)
  const accounts = useAccounts()
  const categories = useCategories()
  const lookup = useLookup(accounts.data, categories.data)
  const { openNew, openEdit } = useTxSheet()

  const invoices = useMemo(() => buildInvoices(card, txs.data ?? [], today()), [card, txs.data])
  const invoice: Invoice = invoices.find((i) => i.month === selected) ?? {
    month: selected, closingDate: '', dueDate: '', total: 0, paid: 0, remaining: 0,
    status: selected > current ? 'future' : selected === current ? 'open' : 'closed', items: [], payments: [],
  }
  const status = STATUS[invoice.status]
  const futureCommitted = invoices.filter((i) => i.month > selected).reduce((s, i) => s + i.remaining, 0)
  const byCat = totals(invoice.items)

  function pay() {
    openNew({
      type: 'transfer', toAccountId: card.id, amount: invoice.remaining,
      description: `Fatura ${card.name} — ${monthLabel(invoice.month)}`, invoiceMonth: invoice.month,
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <IconButton label="Fatura anterior" size="sm" onClick={() => setSelected(addMonths(selected, -1))}><ChevronLeft className="size-5" /></IconButton>
            <div className="text-center">
              <p className="text-[15px] font-bold first-letter:uppercase">Fatura de {monthLabel(selected)}</p>
            </div>
            <IconButton label="Próxima fatura" size="sm" onClick={() => setSelected(addMonths(selected, 1))}><ChevronRight className="size-5" /></IconButton>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Amount value={invoice.total} className="display text-[38px] font-semibold leading-none" />
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {invoice.dueDate && (
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div><dt className="text-muted">Fecha em</dt><dd className="font-semibold">{shortDate(invoice.closingDate)}</dd></div>
              <div><dt className="text-muted">Vence em</dt><dd className="font-semibold">{shortDate(invoice.dueDate)}</dd></div>
              {invoice.paid > 0 && <div><dt className="text-muted">Pago</dt><dd><Amount value={invoice.paid} className="font-semibold text-gain" /></dd></div>}
              {invoice.paid > 0 && invoice.remaining > 0 && <div><dt className="text-muted">Falta pagar</dt><dd><Amount value={invoice.remaining} className="font-semibold" /></dd></div>}
            </dl>
          )}
          {invoice.remaining > 0 && invoice.status !== 'future' && (
            <Button block className="mt-5" onClick={pay}>Pagar fatura</Button>
          )}
        </Panel>
        {futureCommitted > 0 && (
          <p className="px-1 text-sm text-muted">
            Já há <Amount value={futureCommitted} className="font-semibold text-ink" /> lançados nas próximas faturas (parcelas e recorrentes).
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => openNew({ accountId: card.id })}>Nova compra</Button>
          <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => navigate(`/importar?conta=${card.id}`)}>Importar fatura</Button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-bold">
          Compras <span className="font-medium text-faint">({invoice.items.length})</span>
        </h2>
        {txs.error && <ErrorNotice error={txs.error} onRetry={() => txs.refetch()} />}
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-1.5">
          {txs.isPending ? <RowsSkeleton /> : invoice.items.length === 0 ? (
            <EmptyState compact title="Nenhuma compra nesta fatura" />
          ) : invoice.items.map((t) => (
            <TransactionRow key={t.id} tx={t} lookup={lookup} perspective={card.id} showDate onClick={() => openEdit(t)} />
          ))}
        </div>
        {invoice.payments.length > 0 && (
          <>
            <h2 className="mb-3 mt-6 text-[15px] font-bold">Pagamentos</h2>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-1.5">
              {invoice.payments.map((t) => (
                <TransactionRow key={t.id} tx={t} lookup={lookup} perspective={card.id} showDate onClick={() => openEdit(t)} />
              ))}
            </div>
          </>
        )}
        {byCat.income > 0 && <p className="mt-3 px-1 text-[13px] text-faint">Inclui {formatBRL(byCat.income)} em estornos.</p>}
      </div>
    </div>
  )
}
