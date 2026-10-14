import { Link } from 'react-router'
import { BarChart3, ChevronRight, Settings, Tags, WalletCards, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'

const items: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  { to: '/contas', label: 'Contas e cartões', description: 'Saldos, faturas e limites', icon: WalletCards },
  { to: '/relatorios', label: 'Relatórios', description: 'Evolução mensal e categorias', icon: BarChart3 },
  { to: '/categorias', label: 'Categorias', description: 'Nomes, cores e ícones', icon: Tags },
  { to: '/ajustes', label: 'Ajustes', description: 'Tema, instalar app, exportar, sair', icon: Settings },
]

/** Menu do celular para o que não cabe na barra inferior. */
export function MorePage() {
  return (
    <>
      <PageHeader title="Mais" />
      <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {items.map(({ to, label, description, icon: Icon }) => (
          <li key={to} className="border-b border-line last:border-0">
            <Link to={to} className="flex items-center gap-4 px-4 py-4 hover:bg-raised/60">
              <span className="flex size-10 items-center justify-center rounded-xl bg-raised text-brass"><Icon className="size-5" aria-hidden /></span>
              <span className="flex-1">
                <span className="block font-semibold">{label}</span>
                <span className="text-[13px] text-faint">{description}</span>
              </span>
              <ChevronRight className="size-4 text-faint" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
