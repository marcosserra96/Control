import { parseMoneyInput } from '../money'
import type { Cents, ISODate } from '../types'
import { cleanDescription, extractInstallment } from './clean'

/** Uma linha do extrato, já normalizada. */
export interface StatementRow {
  /** Identificador estável: FITID do OFX ou hash do conteúdo no CSV */
  externalId: string
  date: ISODate
  /** Com sinal: negativo = saiu dinheiro / compra no cartão; positivo = entrou / crédito */
  amount: Cents
  description: string
  /** Texto original, para regras de reconhecimento */
  raw: string
  installment: { number: number; total: number } | null
}

export interface Statement {
  format: 'ofx' | 'csv'
  /** Extrato de conta ou fatura de cartão; 'unknown' quando o arquivo não diz */
  kind: 'bank' | 'card' | 'unknown'
  /** Nome do banco, quando o arquivo informa (ex.: "Nubank") */
  bankName: string | null
  /** Banco + número da conta, para lembrar a conta do Control nas próximas vezes */
  accountKey: string | null
  rows: StatementRow[]
}

export class ImportError extends Error {}

/** Lê o arquivo respeitando a codificação: bancos brasileiros ainda usam muito o Windows-1252. */
export function decodeBytes(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 600))
  const declared = /CHARSET:\s*(1252|ISO-?8859-?1)|encoding="(windows-1252|iso-8859-1)"/i.test(head)
  if (!declared) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
    } catch {
      /* não é UTF-8 válido: cai para Windows-1252 */
    }
  }
  return new TextDecoder('windows-1252').decode(bytes)
}

export function parseStatement(text: string, fileName = ''): Statement {
  const trimmed = text.trimStart()
  if (/^OFXHEADER|<OFX>|<\?OFX/i.test(trimmed.slice(0, 2000)) || /\.ofx$/i.test(fileName)) {
    return parseOfx(text)
  }
  return parseCsv(text, fileName)
}

// --- OFX ----------------------------------------------------------------------

/** Códigos de compensação (sem zeros à esquerda) dos bancos mais comuns */
const BANK_CODES: Record<string, string> = {
  '260': 'Nubank', '77': 'Inter', '237': 'Bradesco', '33': 'Santander', '104': 'Caixa',
  '1': 'Banco do Brasil', '341': 'Itaú', '336': 'C6 Bank', '290': 'PagBank', '323': 'Mercado Pago',
}

function tag(block: string, name: string): string | null {
  // SGML (OFX 1.x) não fecha as tags de valor; XML (2.x) fecha. O valor vai até o próximo "<" ou fim de linha.
  const m = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i'))
  const v = m?.[1]?.trim()
  return v ? decodeEntities(v) : null
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

function ofxDate(v: string | null): ISODate | null {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const [, y, mo, d] = m
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null
  return `${y}-${mo}-${d}`
}

function ofxAmount(v: string | null): Cents | null {
  if (!v) return null
  const s = v.replace(/\s/g, '')
  const negative = s.startsWith('-')
  const body = s.replace(/^[+-]/, '')
  // Alguns bancos brasileiros escrevem "1234,56" mesmo no OFX
  const cents = body.includes(',') ? parseMoneyInput(body) : Math.round(parseFloat(body) * 100)
  if (cents === null || Number.isNaN(cents)) return null
  return negative ? -cents : cents
}

function parseOfx(text: string): Statement {
  const kind = /<CCSTMTRS>/i.test(text) ? 'card' : /<STMTRS>/i.test(text) ? 'bank' : 'unknown'
  const bankId = tag(text, 'BANKID')
  const org = tag(text, 'ORG')
  const acctId = tag(text, 'ACCTID')
  const bankName = (bankId ? BANK_CODES[bankId.replace(/^0+(?=\d)/, '')] : undefined) ?? org ?? null

  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? []
  const rows: StatementRow[] = []
  const seen = new Map<string, number>()
  for (const b of blocks) {
    const date = ofxDate(tag(b, 'DTPOSTED') ?? tag(b, 'DTUSER'))
    const amount = ofxAmount(tag(b, 'TRNAMT'))
    if (!date || amount === null || amount === 0) continue
    const memo = tag(b, 'MEMO')
    const name = tag(b, 'NAME')
    const raw = pickDescription(name, memo)
    const fitid = tag(b, 'FITID')
    const base = fitid ? `f:${fitid}` : `h:${date}|${amount}|${raw.toLowerCase()}`
    // Alguns bancos repetem o FITID no mesmo arquivo; diferenciamos pela ordem
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const { text: withoutInstallment, installment } = extractInstallment(raw)
    rows.push({
      externalId: n ? `${base}#${n}` : base,
      date, amount, raw,
      description: cleanDescription(withoutInstallment),
      installment,
    })
  }
  if (!blocks.length) throw new ImportError('Este OFX não tem lançamentos. Confira se escolheu o período certo ao exportar.')
  return {
    format: 'ofx', kind, bankName,
    accountKey: acctId ? `${bankId ?? org ?? 'ofx'}:${acctId}`.slice(0, 120) : null,
    rows,
  }
}

function pickDescription(name: string | null, memo: string | null): string {
  if (name && memo) {
    const n = name.toLowerCase(), m = memo.toLowerCase()
    if (m.includes(n)) return memo
    if (n.includes(m)) return name
    return `${name} ${memo}`
  }
  return memo ?? name ?? 'Sem descrição'
}

// --- CSV ----------------------------------------------------------------------

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

function norm(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

function csvDate(v: string): ISODate | null {
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]
    const mo = m[2]!.padStart(2, '0'), d = m[1]!.padStart(2, '0')
    if (Number(mo) > 12 || Number(d) > 31) return null
    return `${y}-${mo}-${d}`
  }
  return null
}

function csvAmount(v: string): Cents | null {
  const s = v.replace(/[R$\s ]/g, '')
  if (!s) return null
  const negative = /^-|-$|^\(.*\)$/.test(s)
  const body = s.replace(/[-+()]/g, '')
  // "1234.56" (padrão internacional) ou "1.234,56" (padrão brasileiro)
  const cents = /^\d+\.\d{1,2}$/.test(body) ? Math.round(parseFloat(body) * 100) : parseMoneyInput(body)
  if (cents === null) return null
  return negative ? -cents : cents
}

const COLS = {
  date: ['data lancamento', 'data', 'date', 'data da compra', 'data de lancamento'],
  amount: ['valor', 'amount', 'valor (r$)', 'valor r$', 'quantia'],
  description: ['descricao', 'title', 'estabelecimento', 'historico', 'lancamento', 'description', 'detalhes'],
  history: ['historico'],
  id: ['identificador', 'id'],
}

function findCol(header: string[], names: string[], exclude: number[] = []): number {
  for (const n of names) {
    const i = header.findIndex((h, idx) => !exclude.includes(idx) && h === n)
    if (i >= 0) return i
  }
  for (const n of names) {
    const i = header.findIndex((h, idx) => !exclude.includes(idx) && h.startsWith(n))
    if (i >= 0) return i
  }
  return -1
}

function parseCsv(text: string, fileName: string): Statement {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  // O cabeçalho pode vir depois de linhas de título (ex.: nome do banco, período)
  let headerIdx = -1
  let sep = ','
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const l = lines[i]!
    const candidate = [';', ',', '\t'].sort((a, b) => l.split(b).length - l.split(a).length)[0]!
    const cells = splitCsvLine(l, candidate).map(norm)
    if (findCol(cells, COLS.date) >= 0 && findCol(cells, COLS.amount) >= 0) {
      headerIdx = i
      sep = candidate
      break
    }
  }
  if (headerIdx < 0) {
    throw new ImportError('Não reconheci este arquivo. Exporte o extrato em OFX ou em CSV com colunas de data, descrição e valor.')
  }
  const header = splitCsvLine(lines[headerIdx]!, sep).map(norm)
  const iDate = findCol(header, COLS.date)
  const iAmount = findCol(header, COLS.amount)
  const iDesc = findCol(header, COLS.description, [iDate, iAmount])
  const iHist = header.indexOf('historico')
  const iId = findCol(header, COLS.id, [iDate, iAmount, iDesc])

  // Fatura do Nubank: colunas date,title,amount com compras positivas
  const nubankCard = header.includes('title') && header.includes('amount')
  const kind: Statement['kind'] = nubankCard ? 'card' : 'unknown'

  const rows: StatementRow[] = []
  const seen = new Map<string, number>()
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, sep)
    const date = csvDate(cells[iDate] ?? '')
    let amount = csvAmount(cells[iAmount] ?? '')
    if (!date || amount === null || amount === 0) continue // linhas de saldo, totais, rodapé
    if (nubankCard) amount = -amount
    let raw = (iDesc >= 0 ? cells[iDesc] : '') ?? ''
    // Inter e outros separam "Histórico" (tipo) de "Descrição" (quem)
    if (iHist >= 0 && iHist !== iDesc && cells[iHist] && !norm(raw).includes(norm(cells[iHist]!))) {
      raw = `${cells[iHist]} ${raw}`.trim()
    }
    raw ||= 'Sem descrição'
    const base = iId >= 0 && cells[iId] ? `c:${cells[iId]}` : `h:${date}|${amount}|${raw.toLowerCase()}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const { text: withoutInstallment, installment } = extractInstallment(raw)
    rows.push({
      externalId: n ? `${base}#${n}` : base,
      date, amount, raw,
      description: cleanDescription(withoutInstallment),
      installment,
    })
  }
  if (!rows.length) throw new ImportError('O arquivo não tem lançamentos com data e valor.')
  // Arquivos do Nubank se chamam "NU_…" (conta) ou "Nubank_…" (fatura)
  const bankName = /nubank|(^|\/)nu_/i.test(fileName) || nubankCard ? 'Nubank' : /inter/i.test(fileName) ? 'Inter' : null
  return { format: 'csv', kind, bankName, accountKey: null, rows }
}
