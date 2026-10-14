import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatPlain, parseMoneyInput } from '@/domain/money'
import type { Cents } from '@/domain/types'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-[var(--radius-control)] border border-line bg-raised/60 px-3.5 text-[15px] text-ink ' +
  'placeholder:text-faint transition-colors hover:border-line-strong focus:border-brass focus:outline-none ' +
  'aria-[invalid=true]:border-loss'

export function Field({
  label, hint, error, children, htmlFor, className,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-muted">{label}</label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-loss">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest }, ref,
) {
  return <input ref={ref} className={cn(control, 'h-12', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest }, ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
    </div>
  )
})

/**
 * Campo de valor em reais. Aceita "12,50", "1.234" etc. e entrega centavos.
 * Mostra o valor formatado quando perde o foco.
 */
export function MoneyInput({
  value, onChange, id, size = 'md', autoFocus, placeholder = '0,00', invalid, className, allowNegative,
}: {
  value: Cents | null
  onChange: (v: Cents | null) => void
  id?: string
  size?: 'md' | 'xl'
  autoFocus?: boolean
  placeholder?: string
  invalid?: boolean
  className?: string
  allowNegative?: boolean
}) {
  const [text, setText] = useState(() => (value === null ? '' : formatSigned(value)))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(value === null ? '' : formatSigned(value))
  }, [value, focused])

  function handle(raw: string) {
    setText(raw)
    const negative = allowNegative && raw.trim().startsWith('-')
    const parsed = parseMoneyInput(raw.replace('-', ''))
    onChange(parsed === null ? null : negative ? -parsed : parsed)
  }

  if (size === 'xl') {
    return (
      <div className={cn('flex items-baseline gap-2', className)}>
        <span className="display text-2xl font-semibold text-faint">R$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          placeholder={placeholder}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => handle(e.target.value)}
          className="display num w-full min-w-0 bg-transparent text-[44px] font-semibold leading-none text-ink placeholder:text-line-strong focus:outline-none"
        />
      </div>
    )
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-faint">R$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => handle(e.target.value)}
        className={cn(control, 'num h-12 pl-11', className)}
      />
    </div>
  )
}

function formatSigned(v: Cents) {
  return (v < 0 ? '-' : '') + formatPlain(v)
}

export function Toggle({
  checked, onChange, label, description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        {description && <span className="text-[13px] text-faint">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-7 w-12 rounded-full bg-line-strong transition-colors peer-checked:bg-brass peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brass" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-ink shadow transition-transform peer-checked:translate-x-5 peer-checked:bg-brass-ink" />
      </span>
    </label>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  tone?: 'gain' | 'loss' | 'brass'
}

export function Segmented<T extends string>({
  value, onChange, options, label, className,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  label: string
  className?: string
}) {
  const tones = {
    gain: 'aria-checked:bg-gain-soft aria-checked:text-gain',
    loss: 'aria-checked:bg-loss-soft aria-checked:text-loss',
    brass: 'aria-checked:bg-brass-soft aria-checked:text-brass',
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-full bg-raised p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:text-ink',
            'aria-checked:shadow-sm',
            tones[o.tone ?? 'brass'],
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
