/**
 * Guarda o último erro de tela com o "caminho" de componentes onde aconteceu.
 * O React entrega esse caminho só para os callbacks da raiz, não para a tela de erro,
 * por isso ele fica guardado aqui para a tela de erro mostrar e permitir copiar.
 */
export interface Diagnostic {
  message: string
  stack: string
  componentStack: string
  at: string
}

let last: Diagnostic | null = null

export function recordError(error: unknown, componentStack?: string | null) {
  const e = error instanceof Error ? error : new Error(String(error))
  last = {
    message: e.message,
    stack: e.stack ?? '',
    componentStack: componentStack ?? '',
    at: new Date().toISOString(),
  }
  console.error('[Control] erro de tela', e, componentStack)
}

export function lastError(): Diagnostic | null {
  return last
}
