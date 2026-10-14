/** CNPJ no texto do extrato (Pix e transferências para empresas costumam trazer). */

function checkDigit(base: string): number {
  const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const sum = base.split('').reduce((s, d, i) => s + Number(d) * weights[i]!, 0)
  const r = sum % 11
  return r < 2 ? 0 : 11 - r
}

export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false
  const d1 = checkDigit(digits.slice(0, 12))
  const d2 = checkDigit(digits.slice(0, 12) + d1)
  return digits.endsWith(`${d1}${d2}`)
}

/**
 * Encontra um CNPJ válido no texto. CPF (11 dígitos) nunca é considerado,
 * e os dígitos verificadores evitam confundir com outros números.
 */
export function extractCnpj(raw: string): string | null {
  const candidates = raw.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []
  for (const c of candidates) {
    const digits = c.replace(/\D/g, '')
    if (isValidCnpj(digits)) return digits
  }
  return null
}

const SUFFIXES = /\s(ltda|ltd|s\/a|s\.a|eireli|epp|me|mei|limitada|sociedade anonima)\.?$/i

/** Nome legível a partir dos dados públicos da empresa. */
export function companyDisplayName(nomeFantasia: string | null | undefined, razaoSocial: string | null | undefined): string | null {
  let name = (nomeFantasia ?? '').trim() || (razaoSocial ?? '').trim()
  if (!name) return null
  // Remove sufixos societários repetidamente ("X COMERCIO LTDA ME" → "X Comercio")
  for (let i = 0; i < 3; i++) name = name.replace(SUFFIXES, '').replace(/[\s\-.,]+$/, '').trim()
  name = name.replace(/^[\d.\/-]+\s*/, '').trim() // MEI começa com o CNPJ: "12.345.678 FULANO"
  if (!name) return null
  const lower = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
  return name.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && lower.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ').slice(0, 80)
}
