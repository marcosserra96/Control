import { useState } from 'react'
import { useRouteError } from 'react-router'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { lastError } from '@/lib/diagnostics'
import { LogoMark } from './Logo'

/**
 * Tela para erros inesperados ao abrir uma página.
 * Os dados estão no banco; a cópia guardada no aparelho pode ser apagada sem perder nada.
 */
export function ErrorScreen() {
  const error = useRouteError()
  const detail = error instanceof Error ? error.message : String(error ?? '')
  const [copied, setCopied] = useState(false)
  const diag = lastError()
  const report = [
    `Control ${__APP_VERSION__} · ${new Date().toISOString()}`,
    `Página: ${window.location.pathname}`,
    `Navegador: ${navigator.userAgent}`,
    `Erro: ${detail}`,
    '',
    'Pilha:',
    (diag?.stack || (error instanceof Error ? error.stack : '') || '').split('\n').slice(0, 12).join('\n'),
    '',
    'Componentes:',
    (diag?.componentStack || '').trim().split('\n').slice(0, 25).join('\n'),
  ].join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
    } catch { /* sem permissão de área de transferência: o texto continua visível para copiar à mão */ }
  }

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
        <details className="mt-8 text-[13px] text-faint">
          <summary className="cursor-pointer">Detalhes técnicos</summary>
          <button onClick={copy} className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brass hover:underline">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? 'Copiado' : 'Copiar detalhes'}
          </button>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-raised p-3 font-mono text-[11px]">{report}</pre>
        </details>
      </div>
    </main>
  )
}
