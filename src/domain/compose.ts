import { addMonths } from './dates'
import { invoiceMonthFor, paymentInvoiceMonth } from './invoice'
import { splitInstallments } from './money'
import type { Account, Cents, ISODate, NewTransaction, TxType } from './types'

export interface TransactionDraft {
  type: TxType
  amount: Cents
  date: ISODate
  description: string
  notes: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  paid: boolean
  /** 1 = à vista */
  installments: number
  /** Só para transferências que pagam fatura */
  invoiceMonth?: ISODate | null
}

/**
 * Transforma o que foi preenchido no formulário nos lançamentos a gravar.
 * Compras parceladas viram N lançamentos mensais; em cartão, cada parcela
 * cai na fatura do mês correspondente.
 */
export function composeTransactions(
  draft: TransactionDraft,
  account: Account,
  newGroupId: () => string,
  toAccount?: Account,
): NewTransaction[] {
  const description = draft.description.trim()
  const isCard = account.type === 'credit_card' && account.closingDay && account.dueDay
  const invoiceFor = (date: ISODate) =>
    isCard ? invoiceMonthFor(date, account.closingDay!, account.dueDay!) : null

  const base = {
    type: draft.type,
    notes: draft.notes?.trim() || null,
    accountId: draft.accountId,
    toAccountId: draft.type === 'transfer' ? draft.toAccountId : null,
    categoryId: draft.type === 'transfer' ? null : draft.categoryId,
    recurrenceId: null,
    externalId: null,
    importId: null,
    bankText: null,
  }

  const n = draft.type === 'transfer' ? 1 : Math.max(1, Math.floor(draft.installments))
  if (n === 1) {
    return [{
      ...base,
      amount: draft.amount,
      date: draft.date,
      description,
      // Gastos no cartão entram na fatura na hora; "pago" é decidido pela fatura.
      paid: isCard ? true : draft.paid,
      invoiceMonth: draft.type === 'transfer' ? transferInvoice(draft, toAccount) : invoiceFor(draft.date),
      installmentGroup: null,
      installmentNumber: null,
      installmentTotal: null,
    }]
  }

  const group = newGroupId()
  const firstInvoice = invoiceFor(draft.date)
  return splitInstallments(draft.amount, n).map((amount, i) => {
    const date = addMonths(draft.date, i)
    return {
      ...base,
      amount,
      date,
      description,
      // Fora do cartão, só a 1ª parcela segue o que foi marcado; as próximas ficam pendentes.
      paid: isCard ? true : i === 0 ? draft.paid : false,
      invoiceMonth: firstInvoice ? addMonths(firstInvoice, i) : null,
      installmentGroup: group,
      installmentNumber: i + 1,
      installmentTotal: n,
    }
  })
}

/** Transferência para cartão é pagamento de fatura: precisa saber qual. */
function transferInvoice(draft: TransactionDraft, to?: Account): ISODate | null {
  if (draft.invoiceMonth) return draft.invoiceMonth
  if (to?.type === 'credit_card' && to.dueDay) return paymentInvoiceMonth(draft.date, to.dueDay)
  return null
}
