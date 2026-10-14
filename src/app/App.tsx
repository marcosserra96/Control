import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { ToastProvider } from '@/components/ui/Toast'
import { AccountDetailPage } from '@/features/accounts/AccountDetailPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { DashboardPage, RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { BudgetsTab } from '@/features/plan/BudgetsTab'
import { GoalsTab } from '@/features/plan/GoalsTab'
import { PlanPage } from '@/features/plan/PlanPage'
import { RecurrencesTab } from '@/features/plan/RecurrencesTab'
import { CategoriesPage } from '@/features/settings/CategoriesPage'
import { MorePage } from '@/features/settings/MorePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { TxSheetProvider } from '@/features/transactions/TransactionSheet'
import { isDemo } from '@/lib/supabase'
import { AppLayout } from './AppLayout'
import { LogoMark } from './Logo'
import { MonthProvider } from './month'
import { UpdatePrompt } from './UpdatePrompt'

// O gráfico é a dependência mais pesada: só carrega quando abre Relatórios.
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-label="Carregando">
        <LogoMark className="size-12 animate-pulse" />
      </div>
    )
  }
  if (status === 'signed-out') return <LoginPage />
  return (
    <MonthProvider>
      <TxSheetProvider>
        {isDemo && (
          <div className="pt-safe bg-brass px-4 py-1.5 text-center text-[12px] font-bold text-brass-ink">
            Modo demonstração — dados fictícios, nada é salvo
          </div>
        )}
        <Outlet />
      </TxSheetProvider>
    </MonthProvider>
  )
}

const router = createBrowserRouter([
  {
    element: (
      <ToastProvider>
        <AuthProvider>
          <Gate />
          <UpdatePrompt />
        </AuthProvider>
      </ToastProvider>
    ),
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'extrato', element: <TransactionsPage /> },
          { path: 'contas', element: <AccountsPage /> },
          { path: 'contas/:id', element: <AccountDetailPage /> },
          {
            path: 'planejar',
            element: <PlanPage />,
            children: [
              { index: true, element: <BudgetsTab /> },
              { path: 'recorrentes', element: <RecurrencesTab /> },
              { path: 'metas', element: <GoalsTab /> },
            ],
          },
          { path: 'relatorios', element: <Suspense fallback={<RowsSkeleton />}><ReportsPage /></Suspense> },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'ajustes', element: <SettingsPage /> },
          { path: 'mais', element: <MorePage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
