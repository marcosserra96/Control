import { useRouteError } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { LogoMark } from './Logo'

/**
 * Tela para erros inesperados ao abrir uma página.
 * Os dados estão no banco; a cópia guardada no aparelho pode ser apagada sem perder nada.
 */
export function ErrorScreen() {
  const error = useRouteError()
  const detail = error instanceof Error ? error.message : String(error ?? '')

  function reload(clearCache: boolean) {
    if (clearCache) {
      try {
        localStorage.removeItem('control:cache')
      } catch { /* armazenamento bloqueado: só recarrega */ }
    }
    window.location.assign('/')
  }

  return (
    <main className="pt-safe flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md">
        <LogoMark className="mb-8 size-10" />
        <h1 className="display mb-3 text-[28px] font-semibold leading-tight">Não foi possível abrir esta tela</h1>
        <p className="mb-6 text-muted">
          Seus dados estão salvos com segurança. Tente de novo; se continuar, apague a cópia guardada neste aparelho e o
          app baixa tudo outra vez.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => reload(false)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brass font-semibold text-brass-ink hover:brightness-110"
          >
            <RefreshCw className="size-4" aria-hidden /> Tentar de novo
          </button>
          <button
            onClick={() => reload(true)}
            className="h-12 rounded-[var(--radius-control)] border border-line bg-raised font-semibold text-ink hover:bg-line-strong/60"
          >
            Apagar cópia do aparelho e recarregar
          </button>
        </div>
        {detail && (
          <details className="mt-8 text-[13px] text-faint">
            <summary className="cursor-pointer">Detalhes técnicos</summary>
            <p className="mt-2 break-words font-mono">{detail}</p>
          </details>
        )}
      </div>
    </main>
  )
}
