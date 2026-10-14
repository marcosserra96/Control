import { Clock, Layers, Repeat } from 'lucide-react'
import { Amount } from '@/components/ui/display'
import { CategoryIcon, TransferIcon } from '@/components/ui/CategoryIcon'
import { dayLabel } from '@/domain/dates'
import type { Account, Category, Transaction } from '@/domain/types'
import { cn } from '@/lib/cn'

export interface Lookup {
  accounts: Map<string, Account>
  categories: Map<string, Category>
}

/**
 * Linha de lançamento. Em `perspective` (extrato de uma conta), transferências
 * aparecem como entrada ou saída daquela conta.
 */
export function TransactionRow({
  tx, lookup, onClick, perspective, showDate,
}: {
  tx: Transaction
  lookup: Lookup
  onClick?: () => void
  perspective?: string
  showDate?: boolean
}) {
  const hideAccount = perspective === tx.accountId && tx.type !== 'transfer'
  const cat = tx.categoryId ? lookup.categories.get(tx.categoryId) : undefined
  const from = lookup.accounts.get(tx.accountId)
  const to = tx.toAccountId ? lookup.accounts.get(tx.toAccountId) : undefined

  const isTransfer = tx.type === 'transfer'
  const amountType =
    isTransfer && perspective ? (tx.toAccountId === perspective ? 'income' : 'expense') : isTransfer ? 'neutral' : tx.type

  // A data vem antes da conta: em telas estreitas, o fim da linha é cortado
  const meta = [
    isTransfer ? `${from?.name ?? '—'} → ${to?.name ?? '—'}` : cat?.name ?? 'Sem categoria',
    showDate && dayLabel(tx.date),
    !isTransfer && !hideAccount && from?.name,
  ].filter(Boolean)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-raised/70 focus-visible:bg-raised/70"
    >
      {isTransfer ? <TransferIcon /> : <CategoryIcon icon={cat?.icon} color={cat?.color} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-[15px] font-semibold', !tx.paid && 'text-muted')}>{tx.description}</span>
          {tx.installmentTotal && (
            <span className="num inline-flex shrink-0 items-center gap-0.5 rounded-md bg-raised px-1.5 text-[11px] font-bold text-muted">
              <Layers className="size-3" aria-hidden />
              {tx.installmentNumber}/{tx.installmentTotal}
            </span>
          )}
          {tx.recurrenceId && <Repeat className="size-3.5 shrink-0 text-faint" aria-label="Recorrente" />}
        </span>
        <span className="truncate text-[13px] text-faint">{meta.join(' · ')}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <Amount value={tx.amount} type={amountType} sign={amountType !== 'neutral'}
          className={cn('text-[15px] font-semibold', !tx.paid && 'opacity-60')} />
        {!tx.paid && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-warn">
            <Clock className="size-3" aria-hidden /> Pendente
          </span>
        )}
      </span>
    </button>
  )
}

export function useLookup(accounts: Account[] = [], categories: Category[] = []): Lookup {
  return {
    accounts: new Map(accounts.map((a) => [a.id, a])),
    categories: new Map(categories.map((c) => [c.id, c])),
  }
}
