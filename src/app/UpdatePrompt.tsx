import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

/** Avisa quando há versão nova publicada, sem recarregar no meio de um lançamento. */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Verifica atualizações a cada hora com o app aberto
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div role="status" className="fixed inset-x-4 top-[calc(12px+env(safe-area-inset-top))] z-[70] mx-auto flex max-w-sm animate-pop-in items-center gap-3 rounded-2xl border border-line-strong bg-raised px-4 py-3 shadow-2xl">
      <RefreshCw className="size-5 shrink-0 text-brass" aria-hidden />
      <span className="flex-1 text-sm font-medium">Nova versão disponível</span>
      <button onClick={() => setNeedRefresh(false)} className="text-sm font-semibold text-muted hover:text-ink">Depois</button>
      <button onClick={() => updateServiceWorker(true)} className="text-sm font-bold text-brass hover:underline">Atualizar</button>
    </div>
  )
}
