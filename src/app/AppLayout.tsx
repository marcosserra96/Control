import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  BarChart3, FileUp, Home, LayoutGrid, ListOrdered, Plus, Replace, Settings, Tags, Target, WalletCards, WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useRepo } from '@/data/queries'
import { endOfMonth, today } from '@/domain/dates'
import { useTxSheet } from '@/features/transactions/TransactionSheet'
import { cn } from '@/lib/cn'
import { Logo } from './Logo'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const primary: NavItem[] = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/extrato', label: 'Extrato', icon: ListOrdered },
  { to: '/contas', label: 'Contas e cartões', icon: WalletCards },
  { to: '/planejar', label: 'Planejar', icon: Target },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
]
const secondary: NavItem[] = [
  { to: '/importar', label: 'Importar extrato', icon: FileUp },
  { to: '/categorias', label: 'Categorias', icon: Tags },
  { to: '/nomes', label: 'Nomes do extrato', icon: Replace },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

export function AppLayout() {
  const { openNew } = useTxSheet()
  useRecurringSync()
  const online = useOnline()
  const { pathname } = useLocation()

  // Com chaves de propósito: navegadores novos fazem scrollTo devolver uma Promise,
  // e um efeito não pode devolver nada além de uma função de limpeza.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Atalho no computador: N abre um novo lançamento
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      if (el.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      e.preventDefault()
      openNew()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNew])

  return (
    <div className="md:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brass focus:px-3 focus:py-2 focus:text-brass-ink">
        Pular para o conteúdo
      </a>
      <Sidebar onNew={() => openNew()} />
      <div className="min-w-0 flex-1">
        {!online && (
          <div role="status" className="pt-safe sticky top-0 z-30 flex items-center justify-center gap-2 bg-warn/15 px-4 py-2 text-[13px] font-semibold text-warn backdrop-blur">
            <WifiOff className="size-4" aria-hidden />
            Sem internet. Você vê os últimos dados salvos, mas não consegue lançar.
          </div>
        )}
        <main id="conteudo" className="mx-auto w-full max-w-[1120px] px-4 pb-[calc(112px+env(safe-area-inset-bottom))] md:px-8 md:pb-16">
          <Outlet />
        </main>
      </div>
      <BottomBar onNew={() => openNew()} />
    </div>
  )
}

function Sidebar({ onNew }: { onNew: () => void }) {
  const { email } = useAuth()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
      <Logo className="mb-8 px-2" />
      <button
        onClick={onNew}
        className="mb-6 flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brass text-[15px] font-bold text-brass-ink hover:brightness-110"
      >
        <Plus className="size-5" strokeWidth={2.6} aria-hidden /> Novo lançamento
        <kbd className="ml-1 rounded bg-brass-ink/15 px-1.5 text-[11px] font-bold">N</kbd>
      </button>
      <nav aria-label="Principal" className="flex flex-col gap-0.5">
        {primary.map((i) => <SideLink key={i.to} item={i} />)}
      </nav>
      <nav aria-label="Configurações" className="mt-auto flex flex-col gap-0.5 border-t border-line pt-4">
        {secondary.map((i) => <SideLink key={i.to} item={i} />)}
        <p className="mt-3 truncate px-3 text-[12px] text-faint" title={email ?? undefined}>{email}</p>
      </nav>
    </aside>
  )
}

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cn(
        'flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors',
        isActive ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-[18px]', isActive && 'text-brass')} aria-hidden />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function BottomBar({ onNew }: { onNew: () => void }) {
  const tabs: (NavItem | 'new')[] = [
    { to: '/', label: 'Início', icon: Home, end: true },
    { to: '/extrato', label: 'Extrato', icon: ListOrdered },
    'new',
    { to: '/planejar', label: 'Planejar', icon: Target },
    { to: '/mais', label: 'Mais', icon: LayoutGrid },
  ]
  const { pathname } = useLocation()
  const moreActive = ['/mais', '/contas', '/relatorios', '/categorias', '/ajustes', '/importar', '/nomes'].some((p) => pathname.startsWith(p))

  return (
    <nav
      aria-label="Principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid h-[68px] max-w-md grid-cols-5 items-center px-2">
        {tabs.map((t) =>
          t === 'new' ? (
            <div key="new" className="flex justify-center">
              <button
                onClick={onNew}
                aria-label="Novo lançamento"
                className="flex size-14 -translate-y-3 items-center justify-center rounded-[20px] bg-brass text-brass-ink shadow-[0_8px_24px_-6px_var(--c-brass)] active:scale-95"
              >
                <Plus className="size-7" strokeWidth={2.6} />
              </button>
            </div>
          ) : (
            <TabLink key={t.to} item={t} forceActive={t.to === '/mais' ? moreActive : undefined} />
          ),
        )}
      </div>
    </nav>
  )
}

function TabLink({ item, forceActive }: { item: NavItem; forceActive?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className="flex flex-col items-center gap-1 py-2">
      {({ isActive }) => {
        const active = forceActive ?? isActive
        return (
          <>
            <Icon className={cn('size-[22px]', active ? 'text-brass' : 'text-faint')} strokeWidth={active ? 2.4 : 2} aria-hidden />
            <span className={cn('text-[11px] font-semibold', active ? 'text-ink' : 'text-faint')}>{item.label}</span>
          </>
        )
      }}
    </NavLink>
  )
}

/** Cabeçalho de página. No celular, títulos ficam compactos para sobrar espaço aos números. */
export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pt-safe mb-5 md:mb-8">
      <div className="flex min-h-16 items-center justify-between gap-3 pt-3 md:min-h-20 md:pt-8">
        <h1 className="display text-[26px] font-semibold leading-tight md:text-[34px]">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** Gera as ocorrências de recorrências até o fim do mês, uma vez por sessão. */
function useRecurringSync() {
  const repo = useRepo()
  const qc = useQueryClient()
  useEffect(() => {
    let cancelled = false
    repo.generateRecurring(endOfMonth(today()))
      .then((n) => {
        if (!cancelled && n > 0) {
          qc.invalidateQueries({ queryKey: ['transactions'] })
          qc.invalidateQueries({ queryKey: ['balances'] })
        }
      })
      .catch(() => { /* sem conexão: tenta na próxima abertura */ })
    return () => { cancelled = true }
  }, [repo, qc])
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
