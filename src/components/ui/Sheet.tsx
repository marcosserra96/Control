import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/**
 * Painel modal: sobe de baixo no celular e aparece centralizado no computador.
 * O rodapé fica fixo para que a ação principal esteja sempre ao alcance do polegar.
 */
export function Sheet({
  open, onOpenChange, title, description, children, footer, wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          // Sem descrição, não aponta para nenhuma (evita leitor de tela repetir o título)
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed z-50 flex max-h-[92dvh] flex-col bg-surface text-ink shadow-2xl focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-[28px] border-t border-line data-[state=open]:animate-sheet-up',
            'md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[86dvh] md:w-full md:-translate-x-1/2 md:-translate-y-1/2',
            'md:rounded-[24px] md:border md:data-[state=open]:animate-pop-in',
            wide ? 'md:max-w-2xl' : 'md:max-w-lg',
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden />
          <header className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 md:px-6 md:pt-6">
            <div>
              <Dialog.Title className="display text-[22px] font-semibold leading-tight">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Fechar"
                className="-mr-1.5 inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 md:px-6">{children}</div>
          {footer && (
            <footer className="pb-safe border-t border-line bg-surface px-5 py-3 md:rounded-b-[24px] md:px-6 md:py-4">
              <div className="flex gap-3 pb-1 md:pb-0">{footer}</div>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Confirmação para ações destrutivas, com texto que diz exatamente o que acontece. */
export function ConfirmSheet({
  open, onOpenChange, title, description, confirmLabel, onConfirm, loading, children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" block onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="danger" block loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Sheet>
  )
}
