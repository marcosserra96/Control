import type { SupabaseClient } from '@supabase/supabase-js'
import { today } from '@/domain/dates'
import { fromCents, toCents } from '@/domain/money'
import type {
  Account, Budget, Category, Goal, GoalContribution, NewTransaction, Recurrence, Transaction,
} from '@/domain/types'
import type { Repo } from './repo'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

/** Erro com mensagem já pronta para mostrar na tela. */
export class RepoError extends Error {}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) {
    const msg = res.error.message
    if (res.error.code === '23505') throw new RepoError('Já existe um registro igual.')
    if (/JWT|session/i.test(msg)) throw new RepoError('Sua sessão expirou. Entre novamente.')
    if (/Failed to fetch|NetworkError/i.test(msg)) throw new RepoError('Sem conexão. Tente de novo quando estiver online.')
    throw new RepoError(msg)
  }
  return res.data as NonNullable<T>
}

// --- conversão linha <-> domínio ------------------------------------------

const account = (r: Row): Account => ({
  id: r.id, name: r.name, type: r.type, color: r.color,
  initialBalance: toCents(r.initial_balance),
  creditLimit: r.credit_limit === null ? null : toCents(r.credit_limit),
  closingDay: r.closing_day, dueDay: r.due_day,
  includeInTotal: r.include_in_total, archived: r.archived, sortOrder: r.sort_order,
  importKey: r.import_key ?? null,
})
const accountRow = (a: Partial<Account>): Row => strip({
  id: a.id, name: a.name, type: a.type, color: a.color,
  initial_balance: a.initialBalance === undefined ? undefined : fromCents(a.initialBalance),
  credit_limit: a.creditLimit === undefined ? undefined : a.creditLimit === null ? null : fromCents(a.creditLimit),
  closing_day: a.closingDay, due_day: a.dueDay, include_in_total: a.includeInTotal,
  archived: a.archived, sort_order: a.sortOrder, import_key: a.importKey,
})

const category = (r: Row): Category => ({
  id: r.id, name: r.name, kind: r.kind, color: r.color, icon: r.icon, archived: r.archived,
})

const transaction = (r: Row): Transaction => ({
  id: r.id, type: r.type, amount: toCents(r.amount), date: r.date, description: r.description,
  notes: r.notes, accountId: r.account_id, toAccountId: r.to_account_id, categoryId: r.category_id,
  paid: r.paid, invoiceMonth: r.invoice_month, installmentGroup: r.installment_group,
  installmentNumber: r.installment_number, installmentTotal: r.installment_total,
  recurrenceId: r.recurrence_id, externalId: r.external_id ?? null, importId: r.import_id ?? null,
})
const transactionRow = (t: Partial<NewTransaction>): Row => strip({
  type: t.type, amount: t.amount === undefined ? undefined : fromCents(t.amount), date: t.date,
  description: t.description, notes: t.notes, account_id: t.accountId, to_account_id: t.toAccountId,
  category_id: t.categoryId, paid: t.paid, invoice_month: t.invoiceMonth,
  installment_group: t.installmentGroup, installment_number: t.installmentNumber,
  installment_total: t.installmentTotal, recurrence_id: t.recurrenceId,
  external_id: t.externalId, import_id: t.importId,
})

const recurrence = (r: Row): Recurrence => ({
  id: r.id, description: r.description, type: r.type, amount: toCents(r.amount), accountId: r.account_id,
  categoryId: r.category_id, frequency: r.frequency, startDate: r.start_date, endDate: r.end_date,
  active: r.active,
})

const goal = (r: Row): Goal => ({
  id: r.id, name: r.name, targetAmount: toCents(r.target_amount), targetDate: r.target_date,
  color: r.color, archived: r.archived,
})

function strip(o: Row): Row {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

const TX_COLUMNS =
  'id,type,amount,date,description,notes,account_id,to_account_id,category_id,paid,invoice_month,' +
  'installment_group,installment_number,installment_total,recurrence_id,external_id,import_id'

// --- repositório -------------------------------------------------------------

export function createSupabaseRepo(db: SupabaseClient): Repo {
  return {
    async listAccounts() {
      const rows = check(await db.from('accounts').select('*').order('sort_order').order('created_at'))
      return rows.map(account)
    },
    async listBalances() {
      const rows = check(await db.from('account_balances').select('account_id,balance'))
      return new Map(rows.map((r: Row) => [r.account_id as string, toCents(r.balance)]))
    },
    async saveAccount(a) {
      const row = check(await db.from('accounts').upsert(accountRow(a)).select('*').single())
      return account(row)
    },
    async deleteAccount(id) {
      check(await db.from('accounts').delete().eq('id', id))
    },

    async listCategories() {
      const rows = check(await db.from('categories').select('*').order('name'))
      return rows.map(category)
    },
    async saveCategory(c) {
      const row = check(await db.from('categories').upsert(strip({
        id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon, archived: c.archived,
      })).select('*').single())
      return category(row)
    },

    async listTransactions({ from, to, accountId }) {
      // O PostgREST limita a 1000 linhas por página; paginamos para não perder dados.
      const out: Transaction[] = []
      for (let page = 0; ; page++) {
        let q = db.from('transactions').select(TX_COLUMNS)
          .order('date', { ascending: false }).order('created_at', { ascending: false })
          .range(page * 1000, page * 1000 + 999)
        if (from) q = q.gte('date', from)
        if (to) q = q.lte('date', to)
        if (accountId) q = q.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
        const rows = check(await q) as unknown as Row[]
        out.push(...rows.map(transaction))
        if (rows.length < 1000) break
      }
      return out
    },
    async listCardTransactions(cardId, fromInvoice, toInvoice) {
      const rows = check(await db.from('transactions').select(TX_COLUMNS)
        .or(`account_id.eq.${cardId},to_account_id.eq.${cardId}`)
        .gte('invoice_month', fromInvoice).lte('invoice_month', toInvoice)
        .order('date', { ascending: false })) as unknown as Row[]
      return rows.map(transaction)
    },
    async listRecentDescriptions() {
      const rows = check(await db.from('transactions').select('description,category_id,type')
        .neq('type', 'transfer').order('date', { ascending: false }).limit(400)) as Row[]
      const seen = new Set<string>()
      const out: { description: string; categoryId: string | null; type: Transaction['type'] }[] = []
      for (const r of rows) {
        const k = r.description.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ description: r.description, categoryId: r.category_id, type: r.type })
      }
      return out
    },
    async createTransactions(rows) {
      check(await db.from('transactions').insert(rows.map(transactionRow)))
    },
    async updateTransaction(id, patch) {
      check(await db.from('transactions').update(transactionRow(patch)).eq('id', id))
    },
    async deleteTransaction(id) {
      check(await db.from('transactions').delete().eq('id', id))
    },
    async deleteImport(importId) {
      const rows = check(await db.from('transactions').delete().eq('import_id', importId).select('id'))
      return rows.length
    },
    async deleteInstallments(group, fromNumber) {
      check(await db.from('transactions').delete()
        .eq('installment_group', group).gte('installment_number', fromNumber))
    },

    async listRecurrences() {
      const rows = check(await db.from('recurrences').select('*').order('description'))
      return rows.map(recurrence)
    },
    async saveRecurrence(r) {
      const row = check(await db.from('recurrences').upsert(strip({
        id: r.id, description: r.description, type: r.type, amount: fromCents(r.amount),
        account_id: r.accountId, category_id: r.categoryId, frequency: r.frequency,
        start_date: r.startDate, end_date: r.endDate, active: r.active,
      })).select('*').single())
      return recurrence(row)
    },
    async deleteRecurrence(id, removeFuture) {
      if (removeFuture) {
        check(await db.from('transactions').delete().eq('recurrence_id', id).eq('paid', false).gt('date', today()))
      }
      check(await db.from('recurrences').delete().eq('id', id))
    },
    async generateRecurring(until) {
      return check(await db.rpc('generate_recurring', { until })) as number
    },

    async listBudgets() {
      const rows = check(await db.from('budgets').select('id,category_id,amount'))
      return rows.map((r: Row): Budget => ({ id: r.id, categoryId: r.category_id, amount: toCents(r.amount) }))
    },
    async saveBudget(b) {
      check(await db.from('budgets').upsert(
        strip({ id: b.id, category_id: b.categoryId, amount: fromCents(b.amount) }),
        { onConflict: 'user_id,category_id' },
      ))
    },
    async deleteBudget(id) {
      check(await db.from('budgets').delete().eq('id', id))
    },

    async listGoals() {
      const rows = check(await db.from('goals').select('*').order('created_at'))
      return rows.map(goal)
    },
    async saveGoal(g) {
      const row = check(await db.from('goals').upsert(strip({
        id: g.id, name: g.name, target_amount: fromCents(g.targetAmount), target_date: g.targetDate,
        color: g.color, archived: g.archived,
      })).select('*').single())
      return goal(row)
    },
    async deleteGoal(id) {
      check(await db.from('goals').delete().eq('id', id))
    },
    async listContributions() {
      const rows = check(await db.from('goal_contributions').select('*').order('date', { ascending: false }))
      return rows.map((r: Row): GoalContribution => ({
        id: r.id, goalId: r.goal_id, amount: toCents(r.amount), date: r.date, note: r.note,
      }))
    },
    async addContribution(c) {
      check(await db.from('goal_contributions').insert({
        goal_id: c.goalId, amount: fromCents(c.amount), date: c.date, note: c.note,
      }))
    },
    async deleteContribution(id) {
      check(await db.from('goal_contributions').delete().eq('id', id))
    },
  }
}
