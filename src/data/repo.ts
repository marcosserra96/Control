import type { DescriptionRule } from '@/domain/import/rules'
import type {
  Account, Budget, Category, Cents, Goal, GoalContribution, ISODate, NewTransaction, Recurrence, Transaction,
} from '@/domain/types'

export type Upsert<T extends { id: string }> = Omit<T, 'id'> & { id?: string }

export interface TxQuery {
  from?: ISODate
  to?: ISODate
  accountId?: string
}

/**
 * Tudo o que a interface precisa do armazenamento.
 * Implementações: Supabase (produção) e memória (modo demonstração).
 */
export interface Repo {
  listAccounts(): Promise<Account[]>
  listBalances(): Promise<Map<string, Cents>>
  saveAccount(a: Upsert<Account>): Promise<Account>
  deleteAccount(id: string): Promise<void>

  listCategories(): Promise<Category[]>
  saveCategory(c: Upsert<Category>): Promise<Category>

  listTransactions(q: TxQuery): Promise<Transaction[]>
  /** Lançamentos de um cartão e pagamentos de fatura, por mês de fatura */
  listCardTransactions(cardId: string, fromInvoice: ISODate, toInvoice: ISODate): Promise<Transaction[]>
  /** Descrições recentes para sugerir categoria e completar o texto */
  listRecentDescriptions(): Promise<{ description: string; categoryId: string | null; type: Transaction['type'] }[]>
  createTransactions(rows: NewTransaction[]): Promise<void>
  updateTransaction(id: string, patch: Partial<NewTransaction>): Promise<void>
  deleteTransaction(id: string): Promise<void>
  /** Remove a parcela informada e as seguintes do mesmo parcelamento */
  deleteInstallments(group: string, fromNumber: number): Promise<void>
  /** Desfaz uma importação: apaga os lançamentos criados por ela */
  deleteImport(importId: string): Promise<number>

  listRecurrences(): Promise<Recurrence[]>
  saveRecurrence(r: Upsert<Recurrence>): Promise<Recurrence>
  deleteRecurrence(id: string, removeFuture: boolean): Promise<void>
  generateRecurring(until: ISODate): Promise<number>

  listBudgets(): Promise<Budget[]>
  saveBudget(b: Upsert<Budget>): Promise<void>
  deleteBudget(id: string): Promise<void>

  listRules(): Promise<DescriptionRule[]>
  saveRule(r: Upsert<DescriptionRule>): Promise<DescriptionRule>
  deleteRule(id: string): Promise<void>
  /** Renomeia (e categoriza) os lançamentos importados que batem com a regra; devolve quantos */
  applyRule(rule: DescriptionRule): Promise<number>

  listGoals(): Promise<Goal[]>
  saveGoal(g: Upsert<Goal>): Promise<Goal>
  deleteGoal(id: string): Promise<void>
  listContributions(): Promise<GoalContribution[]>
  addContribution(c: Omit<GoalContribution, 'id'>): Promise<void>
  deleteContribution(id: string): Promise<void>
}
