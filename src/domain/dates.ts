import type { ISODate } from './types'

/** Datas de calendário sem fuso: tudo é feito com componentes ano/mês/dia. */

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(): ISODate {
  return toISODate(new Date())
}

export function parseISODate(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y: y!, m: m!, d: d! }
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** Primeiro dia do mês de uma data. */
export function monthOf(date: ISODate): ISODate {
  return date.slice(0, 7) + '-01'
}

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 → 28/02). */
export function addMonths(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(date)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  const nd = Math.min(d, daysInMonth(ny, nm))
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

export function addDays(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(date)
  return toISODate(new Date(y, m - 1, d + n))
}

export function endOfMonth(month: ISODate): ISODate {
  const { y, m } = parseISODate(month)
  return `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`
}

/** Lista de meses (1º dia) de `from` até `to`, inclusive. */
export function monthRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  let cur = monthOf(from)
  const last = monthOf(to)
  while (cur <= last) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function monthName(month: ISODate): string {
  return MONTHS[parseISODate(month).m - 1]!
}

export function monthShort(month: ISODate): string {
  return MONTHS_SHORT[parseISODate(month).m - 1]!
}

/** "outubro" no ano atual, "outubro de 2025" em outros anos. */
export function monthLabel(month: ISODate, ref: ISODate = today()): string {
  const { y } = parseISODate(month)
  const name = monthName(month)
  return y === parseISODate(ref).y ? name : `${name} de ${y}`
}

/** "Hoje", "Ontem", "Amanhã" ou "quinta, 9 de out". */
export function dayLabel(date: ISODate, ref: ISODate = today()): string {
  if (date === ref) return 'Hoje'
  if (date === addDays(ref, -1)) return 'Ontem'
  if (date === addDays(ref, 1)) return 'Amanhã'
  const { y, m, d } = parseISODate(date)
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()]!
  const base = `${wd}, ${d} de ${MONTHS_SHORT[m - 1]}`
  return y === parseISODate(ref).y ? base : `${base} de ${y}`
}

export function shortDate(date: ISODate): string {
  const { m, d } = parseISODate(date)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}
