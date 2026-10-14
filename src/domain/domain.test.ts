import { describe, expect, it } from 'vitest'
import { budgetProgress, goalProgress, monthlySeries, totals } from './analytics'
import { composeTransactions, type TransactionDraft } from './compose'
import { addMonths, dayLabel, monthLabel, monthRange } from './dates'
import { buildInvoices, invoiceDueDate, invoiceMonthFor } from './invoice'
import { formatBRL, parseMoneyInput, splitInstallments } from './money'
import type { Account, Transaction } from './types'

const card: Account = {
  id: 'card', name: 'Cartão', type: 'credit_card', color: '#fff', initialBalance: 0,
  creditLimit: 500000, closingDay: 25, dueDay: 5, includeInTotal: true, archived: false, sortOrder: 0,
  importKey: null,
}
const checking: Account = { ...card, id: 'cc', type: 'checking', closingDay: null, dueDay: null, creditLimit: null }

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36), type: 'expense', amount: 1000, date: '2026-10-10', description: 'x',
    notes: null, accountId: 'cc', toAccountId: null, categoryId: null, paid: true, invoiceMonth: null,
    installmentGroup: null, installmentNumber: null, installmentTotal: null, recurrenceId: null,
    externalId: null, importId: null, bankText: null, ...p,
  }
}

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
    expect(formatBRL(-500)).toContain('5,00')
  })
  it.each([
    ['12', 1200], ['12,5', 1250], ['1.234,56', 123456], ['1234.56', 123456],
    ['1.234', 123400], ['R$ 9,90', 990], ['0,01', 1], ['', null], ['abc', null], ['1,234', null],
  ])('lê "%s"', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected)
  })
  it('divide parcelas sem perder centavos', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b)).toBe(10000)
  })
})

describe('datas', () => {
  it('soma meses sem estourar o fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
  it('gera intervalo de meses', () => {
    expect(monthRange('2026-11-20', '2027-01-03')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
  it('rotula dias e meses em português', () => {
    expect(dayLabel('2026-10-14', '2026-10-14')).toBe('Hoje')
    expect(dayLabel('2026-10-13', '2026-10-14')).toBe('Ontem')
    expect(dayLabel('2026-10-09', '2026-10-14')).toBe('sexta, 9 de out')
    expect(monthLabel('2025-03-01', '2026-10-14')).toBe('março de 2025')
  })
})

describe('fatura do cartão', () => {
  it('respeita o fechamento (igual à função SQL)', () => {
    expect(invoiceMonthFor('2026-10-10', 25, 5)).toBe('2026-11-01')
    expect(invoiceMonthFor('2026-10-26', 25, 5)).toBe('2026-12-01')
    expect(invoiceMonthFor('2026-10-02', 3, 10)).toBe('2026-10-01')
    expect(invoiceMonthFor('2026-10-03', 3, 10)).toBe('2026-11-01')
  })
  it('limita o vencimento ao fim do mês', () => {
    expect(invoiceDueDate('2026-02-01', 31)).toBe('2026-02-28')
  })
  it('calcula total, pagamentos e status', () => {
    const invoices = buildInvoices(card, [
      tx({ accountId: 'card', amount: 10000, invoiceMonth: '2026-10-01', date: '2026-09-20' }),
      tx({ type: 'transfer', accountId: 'cc', toAccountId: 'card', amount: 10000, invoiceMonth: '2026-10-01' }),
      tx({ accountId: 'card', amount: 5000, invoiceMonth: '2026-11-01' }),
      tx({ accountId: 'card', type: 'income', amount: 1000, invoiceMonth: '2026-11-01' }),
      tx({ accountId: 'card', amount: 2000, invoiceMonth: '2026-12-01' }),
    ], '2026-10-14')
    expect(invoices.map((i) => [i.month, i.status, i.remaining])).toEqual([
      ['2026-10-01', 'paid', 0],
      ['2026-11-01', 'open', 4000],
      ['2026-12-01', 'future', 2000],
    ])
  })
  it('marca fatura vencida', () => {
    const [inv] = buildInvoices(card, [tx({ accountId: 'card', invoiceMonth: '2026-09-01' })], '2026-10-14')
    expect(inv?.status).toBe('overdue')
  })
})

describe('composição de lançamentos', () => {
  const draft: TransactionDraft = {
    type: 'expense', amount: 30000, date: '2026-10-26', description: ' Notebook ', notes: '',
    accountId: 'card', toAccountId: null, categoryId: 'c1', paid: false, installments: 3,
  }
  it('parcela no cartão distribuindo faturas', () => {
    const rows = composeTransactions(draft, card, () => 'g1')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.invoiceMonth)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
    expect(rows.map((r) => r.installmentNumber)).toEqual([1, 2, 3])
    expect(rows.every((r) => r.paid && r.description === 'Notebook' && r.installmentGroup === 'g1')).toBe(true)
  })
  it('parcela fora do cartão deixa as futuras pendentes', () => {
    const rows = composeTransactions({ ...draft, accountId: 'cc', paid: true }, checking, () => 'g')
    expect(rows.map((r) => r.paid)).toEqual([true, false, false])
    expect(rows[0]?.invoiceMonth).toBeNull()
  })
  it('pagamento avulso ao cartão vai para a próxima fatura a vencer', () => {
    const [row] = composeTransactions(
      { ...draft, type: 'transfer', accountId: 'cc', toAccountId: 'card', date: '2026-10-28', installments: 1 },
      checking, () => 'g', card)
    expect(row?.invoiceMonth).toBe('2026-11-01')
    const [onDue] = composeTransactions(
      { ...draft, type: 'transfer', accountId: 'cc', toAccountId: 'card', date: '2026-11-05', installments: 1 },
      checking, () => 'g', card)
    expect(onDue?.invoiceMonth).toBe('2026-11-01')
  })
  it('transferência nunca tem categoria nem parcelas', () => {
    const rows = composeTransactions(
      { ...draft, type: 'transfer', accountId: 'cc', toAccountId: 'card', installments: 5 }, checking, () => 'g')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.categoryId).toBeNull()
  })
})

describe('análises', () => {
  const txs = [
    tx({ type: 'income', amount: 500000, date: '2026-10-05' }),
    tx({ amount: 30000, categoryId: 'mercado', date: '2026-10-06' }),
    tx({ amount: 60000, categoryId: 'mercado', date: '2026-10-08' }),
    tx({ type: 'transfer', amount: 99999, toAccountId: 'x', date: '2026-10-09' }),
    tx({ amount: 1000, date: '2026-08-01' }),
  ]
  it('ignora transferências no resultado', () => {
    expect(totals(txs)).toEqual({ income: 500000, expense: 91000, net: 409000 })
  })
  it('preenche meses sem movimento', () => {
    expect(monthlySeries(txs, '2026-08-01', '2026-10-01').map((p) => p.expense)).toEqual([1000, 0, 90000])
  })
  it('acompanha orçamento', () => {
    const [p] = budgetProgress([{ id: 'b', categoryId: 'mercado', amount: 100000 }], [], txs)
    expect(p?.spent).toBe(90000)
    expect(p?.state).toBe('warning')
  })
  it('calcula aporte mensal necessário da meta', () => {
    const g = goalProgress(
      { id: 'g', name: 'Viagem', targetAmount: 120000, targetDate: '2027-03-15', color: '', archived: false },
      [{ id: 'c', goalId: 'g', amount: 20000, date: '2026-09-01', note: null }],
      '2026-10-14',
    )
    expect(g.saved).toBe(20000)
    expect(g.monthlyNeeded).toBe(16667) // faltam 1.000 em 6 aportes (out a mar, inclusive)
  })
})
