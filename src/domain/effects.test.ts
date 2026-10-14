import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Um efeito do React só pode devolver uma função de limpeza (ou nada).
 * `useEffect(() => algo())` devolve o resultado de `algo()`; se for, por exemplo, uma
 * Promise (como `window.scrollTo` nos navegadores novos), o app quebra ao trocar de tela
 * com "x is not a function". Este teste proíbe o formato sem chaves.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('efeitos do React', () => {
  it('nunca devolvem o resultado de uma expressão', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(new URL('..', import.meta.url).pathname)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/use(?:Layout|Insertion)?Effect\(\s*(?:async\s*)?\(\)\s*=>(?!\s*(?:\{|\(\)\s*=>))/g)) {
        const line = text.slice(0, m.index).split('\n').length
        offenders.push(`${file.split('/src/')[1]}:${line}`)
      }
      if (/use(?:Layout)?Effect\(\s*async/.test(text)) offenders.push(`${file.split('/src/')[1]}: efeito async`)
    }
    expect(offenders).toEqual([])
  })
})
