import { monthOf, monthRange } from './dates'
import type { Account, Budget, Category, Cents, Goal, GoalContribution, ISODate, Transaction } from './types'

/** Soma de receitas e despesas (transferências não são resultado). */
export interface Totals {
  income: Cents
  expense: Cents
  net: Cents
}

export function totals(txs: Transaction[]): Totals {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
  }
  return { income, expense, net: income - expense }
}

/** Lançamentos de um mês pela data de competência. */
export function inMonth(txs: Transaction[], month: ISODate): Transaction[] {
  return txs.filter((t) => monthOf(t.date) === month)
}

export interface MonthPoint extends Totals {
  month: ISODate
}

export function monthlySeries(txs: Transaction[], from: ISODate, to: ISODate): MonthPoint[] {
  const map = new Map<ISODate, Transaction[]>()
  for (const t of txs) {
    const m = monthOf(t.date)
    const list = map.get(m)
    if (list) list.push(t)
    else map.set(m, [t])
  }
  return monthRange(from, to).map((month) => ({ month, ...totals(map.get(month) ?? []) }))
}

export interface CategorySlice {
  categoryId: string | null
  amount: Cents
  share: number
  count: number
}

export function byCategory(txs: Transaction[], kind: 'expense' | 'income' = 'expense'): CategorySlice[] {
  const map = new Map<string | null, { amount: Cents; count: number }>()
  let total = 0
  for (const t of txs) {
    if (t.type !== kind) continue
    const cur = map.get(t.categoryId) ?? { amount: 0, count: 0 }
    cur.amount += t.amount
    cur.count += 1
    map.set(t.categoryId, cur)
    total += t.amount
  }
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v, share: total ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export type BudgetState = 'ok' | 'warning' | 'over'

export interface BudgetProgress {
  budget: Budget
  category: Category | undefined
  spent: Cents
  remaining: Cents
  ratio: number
  state: BudgetState
}

export function budgetProgress(budgets: Budget[], categories: Category[], monthTxs: Transaction[]): BudgetProgress[] {
  const spentBy = new Map<string, Cents>()
  for (const t of monthTxs) {
    if (t.type === 'expense' && t.categoryId) {
      spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amount)
    }
  }
  const catById = new Map(categories.map((c) => [c.id, c]))
  return budgets
    .map((budget) => {
      const spent = spentBy.get(budget.categoryId) ?? 0
      const ratio = budget.amount ? spent / budget.amount : 0
      const state: BudgetState = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok'
      return {
        budget,
        category: catById.get(budget.categoryId),
        spent,
        remaining: budget.amount - spent,
        ratio,
        state,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

/** Patrimônio: soma dos saldos das contas marcadas para entrar no total. */
export function netWorth(accounts: Account[], balances: Record<string, Cents>): Cents {
  return accounts
    .filter((a) => !a.archived && a.includeInTotal)
    .reduce((s, a) => s + (balances[a.id] ?? a.initialBalance), 0)
}

export interface GoalProgress {
  goal: Goal
  saved: Cents
  ratio: number
  /** Quanto guardar por mês para chegar no prazo (null sem prazo ou já atingida) */
  monthlyNeeded: Cents | null
}

export function goalProgress(goal: Goal, contributions: GoalContribution[], ref: ISODate): GoalProgress {
  const saved = contributions.filter((c) => c.goalId === goal.id).reduce((s, c) => s + c.amount, 0)
  const ratio = goal.targetAmount ? saved / goal.targetAmount : 0
  let monthlyNeeded: Cents | null = null
  const missing = goal.targetAmount - saved
  if (goal.targetDate && missing > 0) {
    const months = Math.max(monthRange(ref, goal.targetDate).length, 1)
    monthlyNeeded = Math.ceil(missing / months)
  }
  return { goal, saved, ratio, monthlyNeeded }
}
