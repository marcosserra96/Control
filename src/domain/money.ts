import type { Cents } from './types'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Eixos de gráfico: sem casas decimais para o rótulo não ser cortado
const compactAxis = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 0 })

/** "R$ 1.234,56". O espaço do Intl é não separável; normalizamos para espaço fino. */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/ /g, ' ')
}

/** "1.234,56" — para quando o símbolo é desenhado à parte. */
export function formatPlain(cents: Cents): string {
  return plain.format(Math.abs(cents) / 100)
}

export function formatAxis(cents: Cents): string {
  return compactAxis.format(cents / 100)
}

export function toCents(value: number | string | null | undefined): Cents {
  if (value === null || value === undefined || value === '') return 0
  return Math.round(Number(value) * 100)
}

export function fromCents(cents: Cents): number {
  return cents / 100
}

/**
 * Lê o que a pessoa digitou ("1.234,5", "1234.50", "12") e devolve centavos,
 * ou null se não for um valor.
 */
export function parseMoneyInput(raw: string): Cents | null {
  const s = raw.replace(/[R$\s  ]/g, '')
  if (!s) return null
  let normalized: string
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    normalized = s.replace(/\./g, '')
  } else {
    const dot = s.indexOf('.')
    // "1.234" com 3 casas depois do ponto é milhar, não decimal
    normalized = dot >= 0 && s.length - dot - 1 === 3 ? s.replace('.', '') : s
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  return Math.round(parseFloat(normalized) * 100)
}

/**
 * Divide um total em n parcelas iguais em centavos.
 * A diferença de arredondamento vai para a primeira parcela, como fazem os cartões.
 */
export function splitInstallments(total: Cents, n: number): Cents[] {
  if (n < 1 || !Number.isInteger(n)) throw new Error('Número de parcelas inválido')
  const base = Math.floor(total / n)
  const rest = total - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base))
}
