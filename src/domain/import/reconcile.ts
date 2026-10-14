import { addDays, addMonths, parseISODate } from '../dates'
import { invoiceMonthFor, paymentInvoiceMonth } from '../invoice'
import type { Account, Category, Cents, ISODate, NewTransaction, Transaction, TxType } from '../types'
import { normalizeText, suggestCategory, type HistoryEntry } from './categorize'
import type { Statement, StatementRow } from './parse'
import { bankText, defaultPattern, findRule, type DescriptionRule } from './rules'

/**
 * O que fazer com cada linha do extrato:
 * - new: não existe no app, importar
 * - matched: você já lançou à mão (ou veio de recorrência); só vincula, não duplica
 * - duplicate: já foi importado antes
 * - ignored: não deve virar lançamento (ex.: pagamento recebido na fatura do cartão)
 */
export type ItemStatus = 'new' | 'matched' | 'duplicate' | 'ignored'

export interface ImportItem {
  key: string
  row: StatementRow
  status: ItemStatus
  reason: string | null
  include: boolean
  matchedTx: Transaction | null
  type: TxType
  description: string
  amount: Cents
  date: ISODate
  categoryId: string | null
  toAccountId: string | null
  invoiceMonth: ISODate | null
  /** Regra de/para que deu o nome, se houver */
  rule: DescriptionRule | null
  /** Nome proposto pelo app; se a pessoa mudar, vira regra (quando `remember`) */
  suggestedDescription: string
  remember: boolean
  /** Nome encontrado automaticamente (consulta pública por CNPJ) */
  foundBy?: 'cnpj'
}

export interface ReconcileInput {
  statement: Statement
  account: Account
  accounts: Account[]
  /** Lançamentos da conta no período do arquivo (com folga de alguns dias) */
  existing: Transaction[]
  history: HistoryEntry[]
  categories: Category[]
  rules?: DescriptionRule[]
}

const MATCH_WINDOW_DAYS = 4
const CARD_PAYMENT_CREDIT = /pagamento|pgto|pagto|credito de pagamento|pag fat|pagamento recebido/
const PAYS_CARD = /fatura|pagamento (de )?cart|pgto cart|pagto cart|cartao de credito|pag fat|pgto fat/

function daysBetween(a: ISODate, b: ISODate) {
  const pa = parseISODate(a), pb = parseISODate(b)
  return Math.abs(Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86_400_000
}

/** Sinal do lançamento do ponto de vista desta conta: negativo = saiu. */
function signedFor(t: Transaction, accountId: string): Cents {
  if (t.type === 'income') return t.amount
  if (t.type === 'expense') return -t.amount
  return t.toAccountId === accountId ? t.amount : -t.amount
}

/** Mês de fatura mais comum entre as compras à vista: é a fatura que o arquivo representa. */
function dominantInvoice(rows: StatementRow[], card: Account): ISODate | null {
  const counts = new Map<ISODate, number>()
  for (const r of rows) {
    if (r.installment || r.amount >= 0) continue
    const m = invoiceMonthFor(r.date, card.closingDay!, card.dueDay!)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Escolhe o cartão que uma linha "Pagamento de fatura" paga, pelo nome. */
function guessCard(text: string, account: Account, accounts: Account[]): Account | null {
  const cards = accounts.filter((a) => a.type === 'credit_card' && !a.archived)
  if (!cards.length) return null
  const t = normalizeText(text)
  const byName = cards.find((c) => normalizeText(c.name).split(' ').some((w) => w.length >= 3 && w !== 'cartao' && t.includes(w)))
  if (byName) return byName
  // Mesmo banco da conta (ex.: conta "Nubank" paga cartão "Nubank roxinho")
  const bank = normalizeText(account.name).split(' ').find((w) => w.length >= 3 && w !== 'conta')
  return (bank && cards.find((c) => normalizeText(c.name).includes(bank))) || (cards.length === 1 ? cards[0]! : null)
}

export function reconcile({ statement, account, accounts, existing, history, categories, rules = [] }: ReconcileInput): ImportItem[] {
  const isCard = account.type === 'credit_card' && !!account.closingDay && !!account.dueDay
  const invoice = isCard ? dominantInvoice(statement.rows, account) : null
  const byExternal = new Set(existing.filter((t) => t.externalId && t.accountId === account.id).map((t) => t.externalId!))
  const used = new Set<string>()

  return statement.rows.map((row, idx) => {
    const base = {
      key: `${idx}:${row.externalId}`, row, description: row.description, amount: Math.abs(row.amount), date: row.date,
      rule: null, suggestedDescription: row.description, remember: true,
    }
    const norm = normalizeText(row.raw)

    if (byExternal.has(row.externalId)) {
      return { ...base, status: 'duplicate' as const, reason: 'Já importado antes', include: false, matchedTx: null,
        type: row.amount < 0 ? 'expense' as const : 'income' as const, categoryId: null, toAccountId: null, invoiceMonth: null }
    }

    // Data e fatura das compras no cartão. Parcela antiga (comprada meses atrás)
    // entra no mês em que é cobrada, como o app faz com parcelas lançadas à mão.
    let date = row.date
    let invoiceMonth: ISODate | null = null
    if (isCard) {
      const own = invoiceMonthFor(row.date, account.closingDay!, account.dueDay!)
      invoiceMonth = row.installment && invoice && own < invoice ? invoice : own
      if (row.installment && invoice && own < invoice) {
        const diff = monthsBetween(own, invoice)
        date = addMonths(row.date, diff)
      }
    }

    // Pagamento recebido na fatura: o dinheiro sai pela conta que pagou (transferência), não aqui
    if (isCard && row.amount > 0 && CARD_PAYMENT_CREDIT.test(norm)) {
      return { ...base, date, status: 'ignored' as const, reason: 'Pagamento da fatura — entra pela conta que pagou',
        include: false, matchedTx: null, type: 'income' as const, categoryId: null, toAccountId: null, invoiceMonth }
    }

    // Já existe lançamento igual feito à mão (mesmo valor e sentido, data próxima)?
    const match = existing.find((t) =>
      !used.has(t.id) && !t.externalId &&
      (t.accountId === account.id || t.toAccountId === account.id) &&
      signedFor(t, account.id) === row.amount &&
      (daysBetween(t.date, date) <= MATCH_WINDOW_DAYS ||
        (isCard && !!row.installment && t.installmentNumber === row.installment.number &&
          t.installmentTotal === row.installment.total && t.invoiceMonth === invoiceMonth)),
    )
    if (match) {
      used.add(match.id)
      return { ...base, date, status: 'matched' as const,
        reason: match.paid ? 'Você já lançou' : 'Você já lançou como pendente — será marcado como pago',
        include: false, matchedTx: match, type: match.type, description: match.description,
        categoryId: match.categoryId, toAccountId: match.toAccountId, invoiceMonth }
    }

    // Saída da conta que paga fatura de cartão vira transferência para o cartão
    if (!isCard && row.amount < 0 && PAYS_CARD.test(norm)) {
      const card = guessCard(row.raw, account, accounts)
      if (card) {
        return { ...base, date, status: 'new' as const, reason: null, include: true, matchedTx: null,
          type: 'transfer' as const, categoryId: null, toAccountId: card.id,
          invoiceMonth: card.dueDay ? paymentInvoiceMonth(row.date, card.dueDay) : null }
      }
    }

    const type: TxType = row.amount < 0 ? 'expense' : 'income'
    // De/para da pessoa vem antes de tudo: nome e, se tiver, categoria
    const rule = findRule(row.raw, rules)
    const validCategory = rule?.categoryId && categories.some((c) => c.id === rule.categoryId && c.kind === type)
    const description = rule ? rule.renameTo : row.description
    return { ...base, date, status: 'new' as const, reason: null, include: true, matchedTx: null, type,
      description, suggestedDescription: description, rule,
      categoryId: validCategory ? rule!.categoryId : suggestCategory(description, row.raw, type, history, categories),
      toAccountId: null, invoiceMonth }
  })
}

function monthsBetween(from: ISODate, to: ISODate) {
  const a = parseISODate(from), b = parseISODate(to)
  return (b.y - a.y) * 12 + (b.m - a.m)
}

/** Período a consultar no banco para conciliar: do primeiro ao último dia do arquivo, com folga. */
export function statementRange(statement: Statement): { from: ISODate; to: ISODate } {
  const dates = statement.rows.map((r) => r.date).sort()
  return { from: addDays(dates[0]!, -10), to: addDays(addMonths(dates[dates.length - 1]!, 1), 10) }
}

/** Converte os itens marcados em lançamentos e vínculos a gravar. */
export function toWrites(items: ImportItem[], accountId: string, importId: string, newGroupId: () => string) {
  const create: NewTransaction[] = []
  const link: { id: string; patch: Partial<NewTransaction> }[] = []
  for (const it of items) {
    if (it.status === 'matched' && !it.include && it.matchedTx) {
      link.push({ id: it.matchedTx.id, patch: { externalId: it.row.externalId, bankText: bankText(it.row.raw), paid: true } })
      continue
    }
    if (!it.include || it.status === 'duplicate' || it.status === 'ignored') continue
    const inst = it.row.installment
    create.push({
      type: it.type,
      amount: it.amount,
      date: it.date,
      description: it.description.trim() || 'Sem descrição',
      notes: null,
      accountId,
      toAccountId: it.type === 'transfer' ? it.toAccountId : null,
      categoryId: it.type === 'transfer' ? null : it.categoryId,
      paid: true,
      invoiceMonth: it.invoiceMonth,
      installmentGroup: inst ? newGroupId() : null,
      installmentNumber: inst ? inst.number : null,
      installmentTotal: inst ? inst.total : null,
      recurrenceId: null,
      externalId: it.row.externalId,
      importId,
      bankText: bankText(it.row.raw),
    })
  }
  return { create, link, rules: rulesToCreate(items) }
}

/** Nomes que a pessoa corrigiu na revisão viram regras para as próximas importações. */
export function rulesToCreate(items: ImportItem[]): Omit<DescriptionRule, 'id'>[] {
  const out = new Map<string, Omit<DescriptionRule, 'id'>>()
  for (const it of items) {
    if (!it.include || it.status !== 'new' || it.type === 'transfer' || !it.remember) continue
    const name = it.description.trim()
    if (!name || name === it.suggestedDescription.trim()) continue
    const pattern = defaultPattern(it.row.raw)
    if (pattern.length < 3) continue
    out.set(pattern, { pattern, renameTo: name, categoryId: it.categoryId })
  }
  return [...out.values()]
}
