import { addDays, addMonths, monthOf, today } from '@/domain/dates'
import { invoiceMonthFor } from '@/domain/invoice'
import type {
  Account, Budget, Category, Cents, Goal, GoalContribution, ISODate, NewTransaction, Recurrence, Transaction,
} from '@/domain/types'
import type { Repo } from './repo'

/**
 * Repositório em memória para o modo demonstração (`npm run demo`).
 * Espelha as regras do banco: saldos só com lançamentos efetivados,
 * recorrências idempotentes e exclusão em cascata.
 */
export function createMemoryRepo(seed = demoSeed()): Repo {
  const db = seed
  const id = () => crypto.randomUUID()
  const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 80))

  function generate(until: ISODate) {
    let n = 0
    for (const r of db.recurrences) {
      if (!r.active) continue
      const acc = db.accounts.find((a) => a.id === r.accountId)
      const limit = r.endDate && r.endDate < until ? r.endDate : until
      for (let i = 0; i < 1000; i++) {
        const date = r.frequency === 'monthly' ? addMonths(r.startDate, i)
          : r.frequency === 'yearly' ? addMonths(r.startDate, i * 12)
          : addDays(r.startDate, i * 7)
        if (date > limit) break
        if (db.transactions.some((t) => t.recurrenceId === r.id && t.date === date)) continue
        const isCard = acc?.type === 'credit_card'
        db.transactions.push({
          id: id(), type: r.type, amount: r.amount, date, description: r.description, notes: null,
          accountId: r.accountId, toAccountId: null, categoryId: r.categoryId,
          paid: isCard || date <= today(),
          invoiceMonth: isCard ? invoiceMonthFor(date, acc.closingDay!, acc.dueDay!) : null,
          installmentGroup: null, installmentNumber: null, installmentTotal: null, recurrenceId: r.id,
          externalId: null, importId: null,
        })
        n++
      }
    }
    return n
  }

  return {
    listAccounts: () => delay([...db.accounts].sort((a, b) => a.sortOrder - b.sortOrder)),
    async listBalances() {
      const m = new Map<string, Cents>(db.accounts.map((a) => [a.id, a.initialBalance]))
      for (const t of db.transactions) {
        if (!t.paid) continue
        const add = (k: string, v: Cents) => m.set(k, (m.get(k) ?? 0) + v)
        if (t.type === 'income') add(t.accountId, t.amount)
        else add(t.accountId, -t.amount)
        if (t.type === 'transfer' && t.toAccountId) add(t.toAccountId, t.amount)
      }
      return delay(m)
    },
    async saveAccount(a) {
      const saved = { ...a, id: a.id ?? id() } as Account
      db.accounts = [...db.accounts.filter((x) => x.id !== saved.id), saved]
      return delay(saved)
    },
    async deleteAccount(accId) {
      db.accounts = db.accounts.filter((a) => a.id !== accId)
      db.transactions = db.transactions.filter((t) => t.accountId !== accId && t.toAccountId !== accId)
      db.recurrences = db.recurrences.filter((r) => r.accountId !== accId)
      return delay(undefined)
    },

    listCategories: () => delay([...db.categories].sort((a, b) => a.name.localeCompare(b.name))),
    async saveCategory(c) {
      const saved = { ...c, id: c.id ?? id() } as Category
      db.categories = [...db.categories.filter((x) => x.id !== saved.id), saved]
      return delay(saved)
    },

    async listTransactions({ from, to, accountId }) {
      const rows = db.transactions.filter((t) =>
        (!from || t.date >= from) && (!to || t.date <= to) &&
        (!accountId || t.accountId === accountId || t.toAccountId === accountId))
      return delay(rows.sort((a, b) => b.date.localeCompare(a.date)))
    },
    async listCardTransactions(cardId, fromInv, toInv) {
      return delay(db.transactions.filter((t) =>
        (t.accountId === cardId || t.toAccountId === cardId) && t.invoiceMonth &&
        t.invoiceMonth >= fromInv && t.invoiceMonth <= toInv))
    },
    async listRecentDescriptions() {
      const seen = new Set<string>()
      return delay([...db.transactions].sort((a, b) => b.date.localeCompare(a.date))
        .filter((t) => t.type !== 'transfer' && !seen.has(t.description.toLowerCase()) && seen.add(t.description.toLowerCase()))
        .map((t) => ({ description: t.description, categoryId: t.categoryId, type: t.type })))
    },
    async createTransactions(rows) {
      db.transactions.push(...rows.map((r) => ({ ...r, id: id() })))
      return delay(undefined)
    },
    async updateTransaction(txId, patch) {
      db.transactions = db.transactions.map((t) => (t.id === txId ? { ...t, ...patch } : t))
      return delay(undefined)
    },
    async deleteTransaction(txId) {
      db.transactions = db.transactions.filter((t) => t.id !== txId)
      return delay(undefined)
    },
    async deleteImport(importId) {
      const before = db.transactions.length
      db.transactions = db.transactions.filter((t) => t.importId !== importId)
      return delay(before - db.transactions.length)
    },
    async deleteInstallments(group, fromNumber) {
      db.transactions = db.transactions.filter((t) =>
        !(t.installmentGroup === group && (t.installmentNumber ?? 0) >= fromNumber))
      return delay(undefined)
    },

    listRecurrences: () => delay(db.recurrences),
    async saveRecurrence(r) {
      const saved = { ...r, id: r.id ?? id() } as Recurrence
      db.recurrences = [...db.recurrences.filter((x) => x.id !== saved.id), saved]
      return delay(saved)
    },
    async deleteRecurrence(recId, removeFuture) {
      if (removeFuture) {
        db.transactions = db.transactions.filter((t) =>
          !(t.recurrenceId === recId && !t.paid && t.date > today()))
      }
      db.transactions = db.transactions.map((t) => (t.recurrenceId === recId ? { ...t, recurrenceId: null } : t))
      db.recurrences = db.recurrences.filter((r) => r.id !== recId)
      return delay(undefined)
    },
    generateRecurring: async (until) => delay(generate(until)),

    listBudgets: () => delay(db.budgets),
    async saveBudget(b) {
      const existing = db.budgets.find((x) => x.categoryId === b.categoryId)
      const saved = { ...b, id: b.id ?? existing?.id ?? id() } as Budget
      db.budgets = [...db.budgets.filter((x) => x.id !== saved.id && x.categoryId !== saved.categoryId), saved]
      return delay(undefined)
    },
    async deleteBudget(bId) {
      db.budgets = db.budgets.filter((b) => b.id !== bId)
      return delay(undefined)
    },

    listGoals: () => delay(db.goals),
    async saveGoal(g) {
      const saved = { ...g, id: g.id ?? id() } as Goal
      db.goals = [...db.goals.filter((x) => x.id !== saved.id), saved]
      return delay(saved)
    },
    async deleteGoal(gId) {
      db.goals = db.goals.filter((g) => g.id !== gId)
      db.contributions = db.contributions.filter((c) => c.goalId !== gId)
      return delay(undefined)
    },
    listContributions: () => delay([...db.contributions].sort((a, b) => b.date.localeCompare(a.date))),
    async addContribution(c) {
      db.contributions.push({ ...c, id: id() })
      return delay(undefined)
    },
    async deleteContribution(cId) {
      db.contributions = db.contributions.filter((c) => c.id !== cId)
      return delay(undefined)
    },
  }
}

// --- dados de demonstração ---------------------------------------------------

interface Seed {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  recurrences: Recurrence[]
  budgets: Budget[]
  goals: Goal[]
  contributions: GoalContribution[]
}

export function demoSeed(ref: ISODate = today()): Seed {
  let n = 0
  const id = (p: string) => `${p}-${++n}`
  const acc = (p: Partial<Account> & Pick<Account, 'name' | 'type'>): Account => ({
    id: id('acc'), color: '#E3AE4A', initialBalance: 0, creditLimit: null, closingDay: null, dueDay: null,
    includeInTotal: true, archived: false, sortOrder: n, importKey: null, ...p,
  })
  const nubank = acc({ name: 'Conta principal', type: 'checking', color: '#9B7BF0', initialBalance: 420000 })
  const reserva = acc({ name: 'Reserva', type: 'savings', color: '#5CCF9B', initialBalance: 1850000 })
  const carteira = acc({ name: 'Carteira', type: 'cash', color: '#8B93A5', initialBalance: 62000 })
  const cartao = acc({ name: 'Cartão roxo', type: 'credit_card', color: '#B98CF5', creditLimit: 800000, closingDay: 3, dueDay: 10 })
  const cartao2 = acc({ name: 'Cartão Inter', type: 'credit_card', color: '#FF9F5A', creditLimit: 450000, closingDay: 25, dueDay: 5 })

  const cat = (name: string, kind: Category['kind'], color: string, icon: string): Category =>
    ({ id: id('cat'), name, kind, color, icon, archived: false })
  const c = {
    moradia: cat('Moradia', 'expense', '#7C8CF8', 'home'),
    mercado: cat('Mercado', 'expense', '#5CCF9B', 'shopping-cart'),
    restaurantes: cat('Restaurantes', 'expense', '#FF9F5A', 'utensils'),
    transporte: cat('Transporte', 'expense', '#4FB8E8', 'car'),
    saude: cat('Saúde', 'expense', '#FF7B9C', 'heart-pulse'),
    educacao: cat('Educação', 'expense', '#B98CF5', 'graduation-cap'),
    lazer: cat('Lazer', 'expense', '#F2D45C', 'party-popper'),
    assinaturas: cat('Assinaturas', 'expense', '#E37BD8', 'repeat'),
    compras: cat('Compras', 'expense', '#F07E6E', 'shopping-bag'),
    casa: cat('Contas da casa', 'expense', '#6FD0C8', 'zap'),
    outrosG: cat('Outros gastos', 'expense', '#8B93A5', 'circle'),
    salario: cat('Salário', 'income', '#5CCF9B', 'briefcase'),
    freela: cat('Freelance', 'income', '#4FB8E8', 'laptop'),
    rend: cat('Rendimentos', 'income', '#E3AE4A', 'trending-up'),
    outrosR: cat('Outras receitas', 'income', '#8B93A5', 'circle'),
  }

  const transactions: Transaction[] = []
  const add = (p: Partial<NewTransaction> & Pick<NewTransaction, 'amount' | 'date' | 'description' | 'accountId'>) => {
    const a = [nubank, reserva, carteira, cartao, cartao2].find((x) => x.id === p.accountId)!
    const isCard = a.type === 'credit_card'
    transactions.push({
      id: id('tx'), type: 'expense', notes: null, toAccountId: null, categoryId: null,
      paid: isCard || p.date <= ref,
      invoiceMonth: isCard && p.type !== 'transfer' ? invoiceMonthFor(p.date, a.closingDay!, a.dueDay!) : null,
      installmentGroup: null, installmentNumber: null, installmentTotal: null, recurrenceId: null,
      externalId: null, importId: null, ...p,
    })
  }

  // Seis meses de histórico com variação plausível
  const thisMonth = monthOf(ref)
  const rnd = mulberry32(42)
  const vary = (base: number, pct = 0.25) => Math.round(base * (1 - pct + rnd() * pct * 2))
  for (let k = -5; k <= 0; k++) {
    const m = addMonths(thisMonth, k)
    const d = (day: number) => addMonths(m.slice(0, 8) + String(day).padStart(2, '0'), 0)
    const upTo = (day: number) => k < 0 || d(day) <= ref
    if (upTo(5)) add({ type: 'income', amount: 920000, date: d(5), description: 'Salário', accountId: nubank.id, categoryId: c.salario.id })
    if (k % 2 === 0 && upTo(18)) add({ type: 'income', amount: vary(240000), date: d(18), description: 'Projeto freelance', accountId: nubank.id, categoryId: c.freela.id })
    if (upTo(28)) add({ type: 'income', amount: vary(14500, 0.1), date: d(28), description: 'Rendimento da reserva', accountId: reserva.id, categoryId: c.rend.id })
    add({ amount: 210000, date: d(8), description: 'Aluguel', accountId: nubank.id, categoryId: c.moradia.id, paid: k < 0 || d(8) <= ref })
    add({ amount: vary(21000), date: d(12), description: 'Conta de luz', accountId: nubank.id, categoryId: c.casa.id, paid: k < 0 || d(12) <= ref })
    add({ amount: 11990, date: d(15), description: 'Internet', accountId: nubank.id, categoryId: c.casa.id, paid: k < 0 || d(15) <= ref })
    for (const [day, base] of [[3, 38000], [11, 21000], [19, 33000], [26, 17000]] as const) {
      if (upTo(day)) add({ amount: vary(base), date: d(day), description: day === 11 ? 'Hortifruti' : 'Supermercado', accountId: cartao.id, categoryId: c.mercado.id })
    }
    for (const [day, desc] of [[6, 'iFood'], [13, 'Restaurante japonês'], [20, 'Padaria'], [27, 'iFood']] as const) {
      if (upTo(day)) add({ amount: vary(day === 13 ? 16000 : 5800), date: d(day), description: desc, accountId: day === 20 ? carteira.id : cartao.id, categoryId: c.restaurantes.id })
    }
    for (const day of [4, 14, 22]) {
      if (upTo(day)) add({ amount: vary(3400), date: d(day), description: day === 14 ? 'Combustível' : 'Uber', accountId: cartao2.id, categoryId: c.transporte.id })
    }
    if (upTo(16)) add({ amount: vary(9500), date: d(16), description: 'Farmácia', accountId: cartao.id, categoryId: c.saude.id })
    if (k % 2 !== 0 && upTo(23)) add({ amount: vary(18000), date: d(23), description: 'Cinema e jantar', accountId: cartao2.id, categoryId: c.lazer.id })
    if (upTo(9)) add({ amount: 55000, date: d(9), description: 'Curso de inglês', accountId: nubank.id, categoryId: c.educacao.id })
    if (upTo(25)) add({ type: 'transfer', amount: 80000, date: d(25), description: 'Guardar na reserva', accountId: nubank.id, toAccountId: reserva.id })
  }

  // Pagamentos das faturas já vencidas
  for (const card of [cartao, cartao2]) {
    const months = new Set(transactions.filter((t) => t.accountId === card.id).map((t) => t.invoiceMonth!))
    for (const inv of months) {
      const due = inv.slice(0, 8) + String(card.dueDay).padStart(2, '0')
      if (due >= ref) continue
      const total = transactions.filter((t) => t.accountId === card.id && t.invoiceMonth === inv).reduce((s, t) => s + t.amount, 0)
      add({ type: 'transfer', amount: total, date: due, description: `Fatura ${card.name}`, accountId: nubank.id, toAccountId: card.id, invoiceMonth: inv })
    }
  }

  // Compra parcelada em andamento
  const group = 'grp-notebook'
  const start = addMonths(thisMonth, -2).slice(0, 8) + '07'
  for (let i = 0; i < 10; i++) {
    const date = addMonths(start, i)
    transactions.push({
      id: id('tx'), type: 'expense', amount: 42990, date, description: 'Notebook', notes: null,
      accountId: cartao.id, toAccountId: null, categoryId: c.compras.id, paid: true,
      invoiceMonth: addMonths(invoiceMonthFor(start, cartao.closingDay!, cartao.dueDay!), i),
      installmentGroup: group, installmentNumber: i + 1, installmentTotal: 10, recurrenceId: null,
      externalId: null, importId: null,
    })
  }

  const rec = (p: Omit<Recurrence, 'id' | 'active' | 'endDate'>): Recurrence => ({ id: id('rec'), active: true, endDate: null, ...p })
  const recurrences = [
    rec({ description: 'Streaming de música', type: 'expense', amount: 2190, accountId: cartao.id, categoryId: c.assinaturas.id, frequency: 'monthly', startDate: addMonths(thisMonth, -5).slice(0, 8) + '02' }),
    rec({ description: 'Streaming de filmes', type: 'expense', amount: 4490, accountId: cartao.id, categoryId: c.assinaturas.id, frequency: 'monthly', startDate: addMonths(thisMonth, -5).slice(0, 8) + '17' }),
    rec({ description: 'Academia', type: 'expense', amount: 11990, accountId: nubank.id, categoryId: c.saude.id, frequency: 'monthly', startDate: addMonths(thisMonth, -5).slice(0, 8) + '20' }),
    rec({ description: 'Seguro do carro', type: 'expense', amount: 189000, accountId: nubank.id, categoryId: c.transporte.id, frequency: 'yearly', startDate: addMonths(thisMonth, 2).slice(0, 8) + '10' }),
  ]

  const budgets: Budget[] = [
    { id: id('bud'), categoryId: c.mercado.id, amount: 120000 },
    { id: id('bud'), categoryId: c.restaurantes.id, amount: 30000 },
    { id: id('bud'), categoryId: c.transporte.id, amount: 20000 },
    { id: id('bud'), categoryId: c.lazer.id, amount: 25000 },
    { id: id('bud'), categoryId: c.compras.id, amount: 60000 },
  ]

  const viagem: Goal = { id: id('goal'), name: 'Viagem para o Chile', targetAmount: 1200000, targetDate: addMonths(thisMonth, 7), color: '#4FB8E8', archived: false }
  const emergencia: Goal = { id: id('goal'), name: 'Reserva de emergência', targetAmount: 3600000, targetDate: null, color: '#5CCF9B', archived: false }
  const contributions: GoalContribution[] = [
    ...[-4, -3, -2, -1, 0].map((k) => ({ id: id('ctb'), goalId: viagem.id, amount: 90000, date: addMonths(thisMonth, k).slice(0, 8) + '06', note: null })),
    { id: id('ctb'), goalId: emergencia.id, amount: 1850000, date: addMonths(thisMonth, -5), note: 'Saldo inicial' },
  ]

  return {
    accounts: [nubank, reserva, carteira, cartao, cartao2],
    categories: Object.values(c),
    transactions, recurrences, budgets, goals: [viagem, emergencia], contributions,
  }
}

/** Gerador pseudoaleatório determinístico para a demo ser sempre igual. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
