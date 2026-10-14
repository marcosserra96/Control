import { normalizeText } from './categorize'

/** Padrões menores que isso pegariam lançamentos demais */
export const MIN_PATTERN = 3

/** "Quando o texto do banco contiver `pattern`, chamar de `renameTo`." */
export interface DescriptionRule {
  id: string
  /** Texto normalizado: minúsculas, sem acentos nem pontuação */
  pattern: string
  renameTo: string
  categoryId: string | null
}

/** Texto do banco no formato em que as regras comparam (também é o que fica salvo em bank_text). */
export function bankText(raw: string): string {
  return normalizeText(raw).slice(0, 200)
}

/** Começos genéricos que o banco põe antes do nome do estabelecimento */
const GENERIC_PREFIX = new RegExp('^(' + [
  'compra (no |com )?(cartao )?(de )?(debito|credito)( deb| cred)?( mc| visa| elo)?',
  'compra cartao( deb| cred)?( mc| visa| elo)?',
  'transferencia (enviada|recebida)( pelo pix)?',
  'pix (enviado|recebido|transf)',
  'pagamento (de boleto|efetuado|pix)?',
  'pagto( pix)?', 'pgto( pix)?', 'debito automatico', 'deb aut', 'ted (enviada|recebida)', 'doc (enviado|recebido)',
].join('|') + ')\\s+')

/**
 * Padrão sugerido para uma regra nova a partir do texto do banco: só o nome do
 * estabelecimento. Tira o começo genérico ("compra no debito", "pix enviado") e
 * corta no primeiro número (CNPJ, terminal, data), que muda de uma compra para outra.
 */
export function defaultPattern(raw: string): string {
  const text = bankText(raw)
  const stripped = text.replace(GENERIC_PREFIX, '')
  const words: string[] = []
  for (const w of stripped.split(' ')) {
    const numeric = /\d{2,}/.test(w)
    if (numeric && !words.length) continue // data ou código antes do nome: "12/10 PADARIA"
    if (numeric) break // CNPJ, terminal, número da loja depois do nome
    words.push(w)
  }
  const pattern = words.join(' ').trim()
  return (pattern.length >= MIN_PATTERN ? pattern : text).slice(0, 120)
}

export function normalizePattern(input: string): string {
  return normalizeText(input).slice(0, 120)
}

/**
 * A regra mais específica (padrão mais longo) cujo trecho aparece no texto do banco.
 * Mesmo critério do banco de dados (ilike '%padrão%'), para a importação e a
 * aplicação retroativa darem o mesmo resultado.
 */
export function findRule(raw: string, rules: DescriptionRule[]): DescriptionRule | null {
  return matchText(bankText(raw), rules)
}

export function matchText(text: string | null, rules: DescriptionRule[]): DescriptionRule | null {
  if (!text) return null
  let best: DescriptionRule | null = null
  for (const r of rules) {
    if (r.pattern.length < MIN_PATTERN || !text.includes(r.pattern)) continue
    if (!best || r.pattern.length > best.pattern.length) best = r
  }
  return best
}
