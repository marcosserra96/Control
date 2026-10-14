import { describe, expect, it } from 'vitest'
import type { Account, Category, Transaction } from '../types'
import { suggestCategory } from './categorize'
import { cleanDescription, extractInstallment } from './clean'
import { decodeBytes, ImportError, parseStatement } from './parse'
import { reconcile, toWrites } from './reconcile'

// --- arquivos de exemplo ------------------------------------------------------

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Bradesco S/A</ORG><FID>237</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0237<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-150.50<FITID>A1<MEMO>COMPRA CARTAO DEB MC 04/10 SUPERMERCADO BOM PREÇO
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>9200,00<FITID>A2<MEMO>SALARIO EMPRESA X
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-1499.17<FITID>A3<MEMO>PAGTO FATURA CARTAO NUBANK
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261012<TRNAMT>-262.04<FITID>A4<MEMO>CONTA DE LUZ ENEL
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const OFX_CARD = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>5555</ACCTID></CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261006</DTPOSTED><TRNAMT>-58.90</TRNAMT><FITID>c1</FITID><MEMO>IFD*IFOOD CLUB</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260807</DTPOSTED><TRNAMT>-429.90</TRNAMT><FITID>c2</FITID><MEMO>NOTEBOOK LOJA - Parcela 3/10</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>1499.17</TRNAMT><FITID>c3</FITID><MEMO>Pagamento recebido</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261011</DTPOSTED><TRNAMT>-44.90</TRNAMT><FITID>c4</FITID><MEMO>NETFLIX.COM</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`

const NUBANK_ACCOUNT_CSV = `Data,Valor,Identificador,Descrição
05/10/2026,9200.00,id-1,Transferência recebida pelo Pix - EMPRESA X LTDA - 12.345.678/0001-90 - BANCO
08/10/2026,-2100.00,id-2,Transferência enviada pelo Pix - JOAO DA SILVA - •••.123.456-•• - ITAÚ UNIBANCO
09/10/2026,-35.50,id-3,Compra no débito - PADARIA REAL`

const NUBANK_CARD_CSV = `date,title,amount
2026-10-03,Supermercado Dia,212.35
2026-10-06,Uber *Trip,18.90
2026-10-08,Pagamento recebido,-1499.17
2026-10-09,Loja Eletro - Parcela 2/6,200.00`

const INTER_CSV = `Extrato Conta Corrente
Conta ;1234567
Período ;01/10/2026 a 14/10/2026

Data Lançamento;Histórico;Descrição;Valor;Saldo
01/10/2026;Pix enviado ;"Maria Souza";-50,00;1.950,00
03/10/2026;Compra no debito;"POSTO SHELL";-200,00;1.750,00
05/10/2026;Pix recebido;"Fulano";1.234,56;2.984,56`

// --- utilidades ---------------------------------------------------------------

const acc = (p: Partial<Account>): Account => ({
  id: 'cc', name: 'Conta Bradesco', type: 'checking', color: '', initialBalance: 0, creditLimit: null,
  closingDay: null, dueDay: null, includeInTotal: true, archived: false, sortOrder: 0, importKey: null, ...p,
})
const checking = acc({})
const nubankCard = acc({ id: 'card', name: 'Cartão Nubank', type: 'credit_card', closingDay: 3, dueDay: 10 })
const cat = (id: string, name: string, kind: Category['kind'] = 'expense'): Category =>
  ({ id, name, kind, color: '', icon: 'circle', archived: false })
const categories = [cat('mercado', 'Mercado'), cat('rest', 'Restaurantes'), cat('casa', 'Contas da casa'),
  cat('assin', 'Assinaturas'), cat('transp', 'Transporte'), cat('sal', 'Salário', 'income')]
const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), type: 'expense', amount: 1000, date: '2026-10-10', description: 'x', notes: null,
  accountId: 'cc', toAccountId: null, categoryId: null, paid: true, invoiceMonth: null, installmentGroup: null,
  installmentNumber: null, installmentTotal: null, recurrenceId: null, externalId: null, importId: null, ...p,
})

// --- testes -------------------------------------------------------------------

describe('leitura de arquivos', () => {
  it('lê OFX SGML com valores em vírgula e identifica o banco', () => {
    const s = parseStatement(OFX_SGML)
    expect(s.format).toBe('ofx')
    expect(s.kind).toBe('bank')
    expect(s.bankName).toBe('Bradesco')
    expect(s.accountKey).toBe('0237:12345-6')
    expect(s.rows.map((r) => r.amount)).toEqual([-15050, 920000, -149917, -26204])
    expect(s.rows[0]).toMatchObject({ externalId: 'f:A1', date: '2026-10-05', description: 'Supermercado Bom Preço' })
  })

  it('decodifica arquivo em Windows-1252', () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('CHARSET:1252\nPRE'), 0xc7, 0x4f])
    expect(decodeBytes(bytes)).toContain('PREÇO')
  })

  it('lê OFX de cartão (XML) com parcelas', () => {
    const s = parseStatement(OFX_CARD)
    expect(s.kind).toBe('card')
    expect(s.rows[0]?.description).toBe('Ifood Club')
    expect(s.rows[1]).toMatchObject({ description: 'Notebook Loja', installment: { number: 3, total: 10 } })
  })

  it('lê extrato da conta Nubank (CSV)', () => {
    const s = parseStatement(NUBANK_ACCOUNT_CSV, 'NU_123_01OUT2026_14OUT2026.csv')
    expect(s.bankName).toBe('Nubank')
    expect(s.rows.map((r) => r.description)).toEqual(['Pix de Empresa X Ltda', 'Pix para Joao da Silva', 'Padaria Real'])
    expect(s.rows[1]).toMatchObject({ amount: -210000, externalId: 'c:id-2' })
  })

  it('lê fatura do Nubank (CSV) invertendo o sinal das compras', () => {
    const s = parseStatement(NUBANK_CARD_CSV, 'Nubank_2026-10-10.csv')
    expect(s.kind).toBe('card')
    expect(s.rows.map((r) => r.amount)).toEqual([-21235, -1890, 149917, -20000])
    expect(s.rows[3]?.installment).toEqual({ number: 2, total: 6 })
  })

  it('lê CSV do Inter com linhas de título e ponto e vírgula', () => {
    const s = parseStatement(INTER_CSV, 'Extrato-Inter.csv')
    expect(s.rows).toHaveLength(3)
    expect(s.rows.map((r) => [r.description, r.amount])).toEqual([
      ['Pix para Maria Souza', -5000], ['Posto Shell', -20000], ['Pix de Fulano', 123456],
    ])
  })

  it('explica quando não reconhece o arquivo', () => {
    expect(() => parseStatement('nome,idade\nana,30')).toThrow(ImportError)
  })

  it('não confunde o mesmo lançamento repetido no dia com duplicata', () => {
    const csv = 'Data,Valor,Descrição\n01/10/2026,-5.00,Café\n01/10/2026,-5.00,Café'
    const s = parseStatement(csv)
    expect(new Set(s.rows.map((r) => r.externalId)).size).toBe(2)
  })
})

describe('limpeza de descrições', () => {
  it.each([
    ['MP *LOJAXYZ', 'Lojaxyz'],
    ['UBER *TRIP HELP.UBER.COM', 'Uber *trip Help.uber.com'],
    ['Restaurante Já Mudou', 'Restaurante Já Mudou'],
    ['PADARIA SAO PAULO BR', 'Padaria Sao Paulo'],
    ['Compra no débito - DROGASIL 1234', 'Drogasil'],
  ])('%s → %s', (input, out) => {
    expect(cleanDescription(input)).toBe(out)
  })
  it('não confunde data com parcela', () => {
    expect(extractInstallment('COMPRA 12/10 LOJA').installment).toBeNull()
    expect(extractInstallment('LOJA 02/10').installment).toEqual({ number: 2, total: 10 })
    expect(extractInstallment('LOJA 13/10').installment).toBeNull()
  })
})

describe('categorização', () => {
  it('prefere o histórico do usuário', () => {
    const hist = [{ description: 'Ifood Club', categoryId: 'mercado', type: 'expense' as const }]
    expect(suggestCategory('Ifood Club', '', 'expense', hist, categories)).toBe('mercado')
    expect(suggestCategory('Ifood Burguer', '', 'expense', hist, categories)).toBe('mercado') // mesmo estabelecimento
  })
  it('usa regras padrão sem histórico', () => {
    expect(suggestCategory('Ifood Club', 'IFD*IFOOD CLUB', 'expense', [], categories)).toBe('rest')
    expect(suggestCategory('Netflix.com', 'NETFLIX.COM', 'expense', [], categories)).toBe('assin')
    expect(suggestCategory('Conta de Luz Enel', '', 'expense', [], categories)).toBe('casa')
    expect(suggestCategory('Salario Empresa X', '', 'income', [], categories)).toBe('sal')
    expect(suggestCategory('Algo Desconhecido', '', 'expense', [], categories)).toBeNull()
  })
})

describe('conciliação', () => {
  it('não duplica o que já foi importado nem o que foi lançado à mão', () => {
    const items = reconcile({
      statement: parseStatement(OFX_SGML),
      account: checking,
      accounts: [checking, nubankCard],
      existing: [
        tx({ externalId: 'f:A2', type: 'income', amount: 920000, date: '2026-10-05' }),
        tx({ description: 'Luz', amount: 26204, date: '2026-10-12', paid: false }),
      ],
      history: [],
      categories,
    })
    expect(items.map((i) => i.status)).toEqual(['new', 'duplicate', 'new', 'matched'])
    expect(items[0]?.categoryId).toBe('mercado')
    // Pagamento de fatura vira transferência para o cartão certo, na fatura certa
    expect(items[2]).toMatchObject({ type: 'transfer', toAccountId: 'card', invoiceMonth: '2026-10-01' })
    expect(items[3]?.reason).toMatch(/pendente/)
  })

  it('na fatura, ignora o pagamento e encaixa parcelas antigas no mês cobrado', () => {
    const items = reconcile({
      statement: parseStatement(OFX_CARD),
      account: nubankCard,
      accounts: [checking, nubankCard],
      existing: [],
      history: [],
      categories,
    })
    expect(items[2]?.status).toBe('ignored')
    // Compras de 6 e 11/out (após o fechamento dia 3) → fatura de novembro
    expect(items[0]?.invoiceMonth).toBe('2026-11-01')
    // Parcela comprada em agosto é cobrada nesta mesma fatura
    expect(items[1]).toMatchObject({ invoiceMonth: '2026-11-01', date: '2026-10-07' })
  })

  it('reconhece parcela já lançada à mão pelo número da parcela', () => {
    const items = reconcile({
      statement: parseStatement(OFX_CARD),
      account: nubankCard,
      accounts: [nubankCard],
      existing: [tx({ accountId: 'card', amount: 42990, date: '2026-10-07', installmentGroup: 'g', installmentNumber: 3,
        installmentTotal: 10, invoiceMonth: '2026-11-01' })],
      history: [],
      categories,
    })
    expect(items[1]?.status).toBe('matched')
  })

  it('gera os lançamentos e vínculos a gravar', () => {
    const items = reconcile({
      statement: parseStatement(OFX_SGML), account: checking, accounts: [checking, nubankCard],
      existing: [tx({ id: 'manual', description: 'Luz', amount: 26204, date: '2026-10-12', paid: false })],
      history: [], categories,
    })
    const { create, link } = toWrites(items, 'cc', 'imp-1', () => 'g')
    expect(create).toHaveLength(3)
    expect(create.every((c) => c.importId === 'imp-1' && c.externalId && c.paid)).toBe(true)
    expect(link).toEqual([{ id: 'manual', patch: { externalId: 'f:A4', paid: true } }])
  })
})
