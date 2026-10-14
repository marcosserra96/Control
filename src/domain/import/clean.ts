/** Limpeza de descrições de extrato para ficarem legíveis no app. */

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'por', 'com', 'a', 'o'])

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Só converte quando o texto está todo em maiúsculas (padrão de muitos bancos). */
function softCase(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, '')
  return letters && letters === letters.toUpperCase() ? titleCase(s) : s
}

/**
 * Detecta parcelas no texto ("Parcela 2/10", "02/10", "PARC 2 DE 10") e remove do texto.
 */
export function extractInstallment(raw: string): { text: string; installment: { number: number; total: number } | null } {
  const patterns = [
    /\s*[-–]?\s*parcela\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*/i,
    /\s*[-–]?\s*parc\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*/i,
    /\s+(\d{2})\/(\d{2})\s*$/, // "LOJA 02/10" no fim (exige dois dígitos para não confundir com datas)
  ]
  for (const p of patterns) {
    const m = raw.match(p)
    if (!m) continue
    const number = Number(m[1]), total = Number(m[2])
    if (number >= 1 && total >= 2 && number <= total && total <= 60) {
      return { text: raw.replace(p, ' ').trim(), installment: { number, total } }
    }
  }
  return { text: raw, installment: null }
}

export function cleanDescription(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()

  // Pix e transferências do Nubank/Inter: "Transferência enviada pelo Pix - NOME - •••.123.456-•• - BANCO..."
  const pix = s.match(/^(transfer[eê]ncia|pix)\s+(enviad[ao]|recebid[ao])(?:\s+pelo pix)?\s*[-:]?\s*([^-•*\d]+)/i)
  if (pix) {
    const who = titleCase(pix[3]!.trim())
    return /recebid/i.test(pix[2]!) ? `Pix de ${who}` : `Pix para ${who}`
  }
  const inter = s.match(/^pix\s+(enviado|recebido)\s*:?\s*"?([^"]+)"?/i)
  if (inter) return /recebido/i.test(inter[1]!) ? `Pix de ${titleCase(inter[2]!.trim())}` : `Pix para ${titleCase(inter[2]!.trim())}`

  // "Compra no débito - LOJA", "COMPRA CARTAO DEB MC 12/10 LOJA"
  s = s.replace(/^compra\s+(no\s+)?(d[eé]bito|cart[aã]o)(\s+deb(ito)?)?(\s+(mc|visa|elo))?\s*[-:]?\s*(\d{2}\/\d{2}\s+)?/i, '')
  // Prefixos de maquininha/intermediador: "IFD*", "MP *", "PAG*", "EC *", "SumUp *"
  s = s.replace(/^(ifd|mp|pag|pg|ec|sumup|ppro|pagseguro|mercadopago|ebanx|dl|hna)\s?\*\s?/i, '')
  // Número da loja/terminal no fim: "DROGASIL 1234"
  s = s.replace(/(\S)\s+\d{3,}$/, '$1')
  // Sufixo de país comum em fatura: "LOJA BR"
  s = s.replace(/(\S)\s+(br|bra)$/i, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  return softCase(s || raw.trim()).slice(0, 80)
}
