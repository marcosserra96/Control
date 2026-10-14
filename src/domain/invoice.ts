import { addMonths, daysInMonth, monthOf, parseISODate } from './dates'
import type { Account, Cents, ISODate, Transaction } from './types'

/**
 * Mês da fatura (1º dia do mês de vencimento) de uma compra no cartão.
 * Compras a partir do dia de fechamento entram na fatura seguinte.
 * Espelha invoice_month_for() em supabase/migrations — mantenha os dois iguais.
 */
export function invoiceMonthFor(date: ISODate, closingDay: number, dueDay: number): ISODate {
  const { d } = parseISODate(date)
  let month = monthOf(date)
  if (d >= closingDay) month = addMonths(month, 1)
  if (dueDay <= closingDay) month = addMonths(month, 1)
  return month
}

/**
 * Fatura a que um pagamento avulso se refere: a primeira que vence na data do pagamento ou depois.
 */
export function paymentInvoiceMonth(date: ISODate, dueDay: number): ISODate {
  const month = monthOf(date)
  return parseISODate(date).d <= Math.min(dueDay, daysInMonth(parseISODate(date).y, parseISODate(date).m))
    ? month
    : addMonths(month, 1)
}

export function invoiceDueDate(invoiceMonth: ISODate, dueDay: number): ISODate {
  const { y, m } = parseISODate(invoiceMonth)
  const last = new Date(y, m, 0).getDate()
  return invoiceMonth.slice(0, 8) + String(Math.min(dueDay, last)).padStart(2, '0')
}

export function invoiceClosingDate(invoiceMonth: ISODate, closingDay: number, dueDay: number): ISODate {
  const closingMonth = dueDay <= closingDay ? addMonths(invoiceMonth, -1) : invoiceMonth
  const { y, m } = parseISODate(closingMonth)
  const last = new Date(y, m, 0).getDate()
  return closingMonth.slice(0, 8) + String(Math.min(closingDay, last)).padStart(2, '0')
}

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue' | 'future'

export interface Invoice {
  month: ISODate
  closingDate: ISODate
  dueDate: ISODate
  total: Cents
  paid: Cents
  remaining: Cents
  status: InvoiceStatus
  items: Transaction[]
  payments: Transaction[]
}

/** Monta as faturas de um cartão a partir dos lançamentos vinculados a ele. */
export function buildInvoices(card: Account, txs: Transaction[], ref: ISODate): Invoice[] {
  if (card.type !== 'credit_card' || !card.closingDay || !card.dueDay) return []
  const byMonth = new Map<ISODate, { items: Transaction[]; payments: Transaction[] }>()
  const bucket = (m: ISODate) => {
    let b = byMonth.get(m)
    if (!b) byMonth.set(m, (b = { items: [], payments: [] }))
    return b
  }
  for (const t of txs) {
    const month = t.invoiceMonth ?? invoiceMonthFor(t.date, card.closingDay, card.dueDay)
    if (t.accountId === card.id) {
      bucket(month).items.push(t)
    } else if (t.toAccountId === card.id && t.type === 'transfer') {
      bucket(month).payments.push(t)
    }
  }
  const current = invoiceMonthFor(ref, card.closingDay, card.dueDay)
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { items, payments }]) => {
      // Estornos (receitas no cartão) abatem a fatura
      const total = items.reduce((s, t) => s + (t.type === 'income' ? -t.amount : t.amount), 0)
      const paid = payments.reduce((s, t) => s + t.amount, 0)
      const remaining = Math.max(total - paid, 0)
      const dueDate = invoiceDueDate(month, card.dueDay!)
      const closingDate = invoiceClosingDate(month, card.closingDay!, card.dueDay!)
      let status: InvoiceStatus
      if (total > 0 && remaining === 0) status = 'paid'
      else if (month > current) status = 'future'
      else if (month === current) status = 'open'
      else if (ref > dueDate && remaining > 0) status = 'overdue'
      else status = 'closed'
      items.sort((a, b) => b.date.localeCompare(a.date))
      return { month, closingDate, dueDate, total, paid, remaining, status, items, payments }
    })
}

