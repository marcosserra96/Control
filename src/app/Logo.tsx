import { cn } from '@/lib/cn'

/**
 * Marca: um "C" aberto como um ponteiro de medidor — controle visível, não rígido.
 * O mesmo desenho é usado no ícone do app (public/icon.svg).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--c-brass)" />
      <path
        d="M21.14 9.87A8 8 0 1 0 21.14 22.13"
        fill="none"
        stroke="var(--c-brass-ink)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.6" fill="var(--c-brass-ink)" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="display text-[22px] font-bold">Control</span>
    </div>
  )
}
