import { companyDisplayName } from '@/domain/import/cnpj'

/**
 * Consulta pública de empresas por CNPJ (BrasilAPI: gratuita, sem cadastro).
 * Só o CNPJ sai do aparelho. Resultado fica em cache local para não repetir consultas.
 */
export interface Company {
  name: string
  /** Atividade principal, ajuda a sugerir a categoria (ex.: "Restaurantes e similares") */
  activity: string | null
}

const CACHE_KEY = 'control:cnpj'
const TIMEOUT_MS = 6000

type Cache = Record<string, Company | null>

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}

function writeCache(c: Cache) {
  try {
    // Limita o tamanho: guarda os 500 mais recentes
    const entries = Object.entries(c).slice(-500)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch { /* armazenamento cheio ou bloqueado: segue sem cache */ }
}

async function fetchCompany(cnpj: string): Promise<Company | null | undefined> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: ctrl.signal })
    if (res.status === 404) return null // CNPJ inexistente: guardar para não consultar de novo
    if (!res.ok) return undefined // erro temporário: não guardar
    const data = (await res.json()) as { nome_fantasia?: string; razao_social?: string; cnae_fiscal_descricao?: string }
    const name = companyDisplayName(data.nome_fantasia, data.razao_social)
    return name ? { name, activity: data.cnae_fiscal_descricao ?? null } : null
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** Consulta vários CNPJs com no máximo 3 ao mesmo tempo. Falhas viram "sem resultado". */
export async function lookupCompanies(cnpjs: string[]): Promise<Map<string, Company>> {
  const cache = readCache()
  const out = new Map<string, Company>()
  const pending = [...new Set(cnpjs)].filter((c) => {
    if (c in cache) {
      const hit = cache[c]
      if (hit) out.set(c, hit)
      return false
    }
    return true
  })
  let changed = false
  const worker = async () => {
    for (let c = pending.shift(); c; c = pending.shift()) {
      const result = await fetchCompany(c)
      if (result === undefined) continue
      cache[c] = result
      changed = true
      if (result) out.set(c, result)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  if (changed) writeCache(cache)
  return out
}
