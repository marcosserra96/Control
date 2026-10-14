import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '@/app/AppLayout'
import { cn } from '@/lib/cn'

const tabs = [
  { to: '/planejar', label: 'Orçamento', end: true },
  { to: '/planejar/recorrentes', label: 'Recorrentes' },
  { to: '/planejar/metas', label: 'Metas' },
]

export function PlanPage() {
  return (
    <>
      <PageHeader title="Planejar">
        <nav aria-label="Seções de planejamento" className="mt-2 flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cn(
                '-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[15px] font-semibold transition-colors',
                isActive ? 'border-brass text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </PageHeader>
      <Outlet />
    </>
  )
}
