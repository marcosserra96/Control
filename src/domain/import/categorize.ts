import type { Category, CategoryKind } from '../types'

export interface HistoryEntry {
  description: string
  categoryId: string | null
  type: 'expense' | 'income' | 'transfer'
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Palavra que identifica o estabelecimento: a primeira com 3+ letras que não seja genérica. */
const GENERIC = new Set(['pix', 'para', 'compra', 'pagamento', 'pagto', 'pgto', 'transferencia', 'debito', 'credito', 'loja', 'com', 'ltda', 'the'])
export function keyWord(s: string): string | null {
  return normalizeText(s).split(' ').find((w) => w.length >= 3 && !/^\d+$/.test(w) && !GENERIC.has(w)) ?? null
}

/**
 * Regras padrão por palavra-chave → nomes de categoria (os padrões do app).
 * Valem só quando o histórico do usuário não decide.
 */
const RULES: { kind: CategoryKind; words: RegExp; category: string[] }[] = [
  { kind: 'expense', words: /\b(ifood|rappi|restaurante|lanchonete|padaria|pizzaria|burger|mcdonald|bk |outback|cafe|cafeteria|starbucks|bar |churrascaria|sushi|aiqfome)/, category: ['restaurantes', 'alimentacao'] },
  { kind: 'expense', words: /\b(mercado|supermercado|carrefour|pao de acucar|atacadao|assai|extra|hortifruti|sacolao|dia |zaffari|condor|savegnago|sams club|oba)/, category: ['mercado', 'supermercado'] },
  { kind: 'expense', words: /\b(uber|99 ?app|99pop|cabify|posto|shell|ipiranga|petrobras|br mania|combustivel|estacionamento|estapar|sem parar|conectcar|veloe|metro|onibus|bilhete unico|pedagio)/, category: ['transporte'] },
  { kind: 'expense', words: /\b(farmacia|drogasil|droga raia|drogaria|pague menos|panvel|hospital|clinica|laboratorio|unimed|amil|hapvida|sulamerica|odonto|dentista|psicolog)/, category: ['saude'] },
  { kind: 'expense', words: /\b(netflix|spotify|disney|hbo|max |prime video|amazon prime|youtube premium|apple com bill|apple\.com|icloud|google one|deezer|globoplay|paramount|chatgpt|openai|claude)/, category: ['assinaturas'] },
  { kind: 'expense', words: /\b(aluguel|condominio|iptu|imobiliaria)/, category: ['moradia'] },
  { kind: 'expense', words: /\b(enel|light|cemig|copel|celesc|cpfl|energia|sabesp|sanepar|cedae|agua|comgas|naturgy|gas |vivo|claro|tim |oi |net |internet)/, category: ['contas da casa'] },
  { kind: 'expense', words: /\b(escola|faculdade|universidade|curso|udemy|alura|livraria|colegio)/, category: ['educacao'] },
  { kind: 'expense', words: /\b(cinema|cinemark|ingresso|sympla|teatro|show|steam|playstation|xbox|nintendo|parque)/, category: ['lazer'] },
  { kind: 'expense', words: /\b(amazon|mercado livre|mercadolivre|shopee|aliexpress|magalu|magazine luiza|americanas|renner|riachuelo|c a |zara|shein|centauro|netshoes|leroy)/, category: ['compras'] },
  { kind: 'income', words: /\b(salario|folha|pagamento de salario|vencimentos|proventos)/, category: ['salario'] },
  { kind: 'income', words: /\b(rendimento|rend pago|juros|dividendo|remuneracao)/, category: ['rendimentos'] },
]

/**
 * Sugere a categoria: primeiro pelo que a pessoa já usou para a mesma descrição
 * (ou mesmo estabelecimento), depois pelas regras padrão.
 */
export function suggestCategory(
  description: string,
  raw: string,
  kind: CategoryKind,
  history: HistoryEntry[],
  categories: Category[],
): string | null {
  const active = categories.filter((c) => !c.archived && c.kind === kind)
  const valid = new Set(active.map((c) => c.id))
  const target = normalizeText(description)
  const sameKind = history.filter((h) => h.type === kind && h.categoryId && valid.has(h.categoryId))

  const exact = sameKind.find((h) => normalizeText(h.description) === target)
  if (exact) return exact.categoryId

  const word = keyWord(description)
  if (word) {
    const similar = sameKind.find((h) => keyWord(h.description) === word)
    if (similar) return similar.categoryId
  }

  const haystack = ` ${normalizeText(`${description} ${raw}`)} `
  for (const rule of RULES) {
    if (rule.kind !== kind || !rule.words.test(haystack)) continue
    const cat = active.find((c) => rule.category.includes(normalizeText(c.name)))
    if (cat) return cat.id
  }
  return null
}
