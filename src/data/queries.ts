import { createContext, use } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { Repo, TxQuery } from './repo'

export const RepoContext = createContext<Repo | null>(null)

export function useRepo(): Repo {
  const repo = use(RepoContext)
  if (!repo) throw new Error('RepoContext ausente')
  return repo
}

export const keys = {
  accounts: ['accounts'] as const,
  balances: ['balances'] as const,
  categories: ['categories'] as const,
  transactions: (q: TxQuery) => ['transactions', q] as const,
  card: (id: string, from: ISODate, to: ISODate) => ['transactions', 'card', id, from, to] as const,
  descriptions: ['descriptions'] as const,
  recurrences: ['recurrences'] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  contributions: ['contributions'] as const,
}

export function useAccounts() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.accounts, queryFn: () => repo.listAccounts() })
}

export function useBalances() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.balances, queryFn: () => repo.listBalances() })
}

export function useCategories() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.categories, queryFn: () => repo.listCategories() })
}

export function useTransactions(q: TxQuery, enabled = true) {
  const repo = useRepo()
  return useQuery({
    queryKey: keys.transactions(q),
    queryFn: () => repo.listTransactions(q),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useMonthTransactions(month: ISODate) {
  return useTransactions({ from: month, to: endOfMonth(month) })
}

export function useCardTransactions(cardId: string, from: ISODate, to: ISODate) {
  const repo = useRepo()
  return useQuery({
    queryKey: keys.card(cardId, from, to),
    queryFn: () => repo.listCardTransactions(cardId, from, to),
    placeholderData: keepPreviousData,
  })
}

export function useDescriptions() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.descriptions, queryFn: () => repo.listRecentDescriptions(), staleTime: 5 * 60_000 })
}

export function useRecurrences() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.recurrences, queryFn: () => repo.listRecurrences() })
}

export function useBudgets() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.budgets, queryFn: () => repo.listBudgets() })
}

export function useGoals() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.goals, queryFn: () => repo.listGoals() })
}

export function useContributions() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.contributions, queryFn: () => repo.listContributions() })
}

/**
 * Mutação que recebe o repositório e invalida as consultas afetadas.
 * `touches` lista o que muda; lançamentos sempre mexem em saldos.
 */
type Area = 'accounts' | 'categories' | 'transactions' | 'recurrences' | 'budgets' | 'goals'

export function useRepoMutation<TArgs, TResult = unknown>(
  fn: (repo: Repo, args: TArgs) => Promise<TResult>,
  touches: Area[],
) {
  const repo = useRepo()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: TArgs) => fn(repo, args),
    onSettled: async () => {
      const prefixes = new Set<string>()
      for (const t of touches) {
        if (t === 'transactions') ['transactions', 'balances', 'descriptions'].forEach((p) => prefixes.add(p))
        else if (t === 'accounts') ['accounts', 'balances', 'transactions'].forEach((p) => prefixes.add(p))
        else if (t === 'recurrences') ['recurrences', 'transactions', 'balances'].forEach((p) => prefixes.add(p))
        else if (t === 'goals') ['goals', 'contributions'].forEach((p) => prefixes.add(p))
        else prefixes.add(t)
      }
      await Promise.all([...prefixes].map((p) => qc.invalidateQueries({ queryKey: [p] })))
    },
  })
}
