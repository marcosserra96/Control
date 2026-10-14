/**
 * Tipos de domínio. Valores monetários são sempre inteiros em centavos
 * para evitar erros de ponto flutuante; a conversão acontece na borda (repositório).
 * Datas de calendário são strings ISO "AAAA-MM-DD".
 */

export type Cents = number
export type ISODate = string

export type AccountType = 'checking' | 'savings' | 'cash' | 'investment' | 'credit_card'
export type CategoryKind = 'expense' | 'income'
export type TxType = 'expense' | 'income' | 'transfer'
export type Frequency = 'weekly' | 'monthly' | 'yearly'

export interface Account {
  id: string
  name: string
  type: AccountType
  color: string
  initialBalance: Cents
  creditLimit: Cents | null
  closingDay: number | null
  dueDay: number | null
  includeInTotal: boolean
  archived: boolean
  sortOrder: number
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  color: string
  icon: string
  archived: boolean
}

export interface Transaction {
  id: string
  type: TxType
  amount: Cents
  date: ISODate
  description: string
  notes: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  paid: boolean
  invoiceMonth: ISODate | null
  installmentGroup: string | null
  installmentNumber: number | null
  installmentTotal: number | null
  recurrenceId: string | null
}

export type NewTransaction = Omit<Transaction, 'id'>

export interface Recurrence {
  id: string
  description: string
  type: Exclude<TxType, 'transfer'>
  amount: Cents
  accountId: string
  categoryId: string | null
  frequency: Frequency
  startDate: ISODate
  endDate: ISODate | null
  active: boolean
}

export interface Budget {
  id: string
  categoryId: string
  amount: Cents
}

export interface Goal {
  id: string
  name: string
  targetAmount: Cents
  targetDate: ISODate | null
  color: string
  archived: boolean
}

export interface GoalContribution {
  id: string
  goalId: string
  amount: Cents
  date: ISODate
  note: string | null
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  investment: 'Investimento',
  credit_card: 'Cartão de crédito',
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Toda semana',
  monthly: 'Todo mês',
  yearly: 'Todo ano',
}
