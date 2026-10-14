import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download, LogOut, Smartphone } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { getTheme, setTheme, type ThemePref } from '@/app/theme'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/display'
import { Field, Segmented, TextInput } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useRepo } from '@/data/queries'
import { isDemo, supabase } from '@/lib/supabase'
import { useInstallPrompt } from '@/app/pwa'

export function SettingsPage() {
  const { email, signOut } = useAuth()
  const [theme, setThemeState] = useState<ThemePref>(getTheme())
  const [params] = useSearchParams()
  const install = useInstallPrompt()

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="grid max-w-3xl gap-4">
        {params.get('senha') === 'nova' && <NewPassword />}

        <Panel title="Aparência">
          <Segmented label="Tema" value={theme} onChange={(v) => { setTheme(v); setThemeState(v) }} className="max-w-sm"
            options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Do aparelho' }]} />
        </Panel>

        <Panel title="Instalar no aparelho">
          {install.installed ? (
            <p className="text-sm text-muted">O Control já está instalado neste aparelho.</p>
          ) : install.canPrompt ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Abra direto da tela inicial, em tela cheia, como um aplicativo.</p>
              <Button icon={<Smartphone className="size-4" />} onClick={install.prompt}>Instalar app</Button>
            </div>
          ) : install.ios ? (
            <p className="text-sm text-muted">
              No iPhone: toque em <strong className="text-ink">Compartilhar</strong> no Safari e depois em{' '}
              <strong className="text-ink">Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Use a opção <strong className="text-ink">Instalar app</strong> no menu do navegador (Chrome ou Edge).
            </p>
          )}
        </Panel>

        <ExportPanel />

        <Panel title="Conta">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Conectado como <span className="font-semibold text-ink">{email}</span></p>
            {!isDemo && <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={signOut}>Sair</Button>}
          </div>
        </Panel>
        <p className="px-1 text-[12px] text-faint">Control · versão {__APP_VERSION__}</p>
      </div>
    </>
  )
}

function NewPassword() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <Panel title="Crie sua nova senha">
      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
        e.preventDefault()
        if (password.length < 8) return toast.error(new Error('A senha precisa ter pelo menos 8 caracteres.'))
        setLoading(true)
        const { error } = await supabase!.auth.updateUser({ password })
        setLoading(false)
        if (error) toast.error(error)
        else { toast.success('Senha alterada'); setPassword('') }
      }}>
        <Field label="Nova senha" htmlFor="new-pass" className="min-w-60 flex-1">
          <TextInput id="new-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" loading={loading}>Salvar senha</Button>
      </form>
    </Panel>
  )
}

/** Exporta todos os lançamentos em CSV (abre no Excel e no Google Planilhas). */
function ExportPanel() {
  const repo = useRepo()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function exportCsv() {
    setLoading(true)
    try {
      const [txs, accounts, categories] = await Promise.all([repo.listTransactions({}), repo.listAccounts(), repo.listCategories()])
      const acc = new Map(accounts.map((a) => [a.id, a.name]))
      const cat = new Map(categories.map((c) => [c.id, c.name]))
      const type = { expense: 'Despesa', income: 'Receita', transfer: 'Transferência' }
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
      const lines = [
        ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Conta destino', 'Valor', 'Situação', 'Parcela', 'Observação'].join(';'),
        ...txs.map((t) => [
          t.date, type[t.type], esc(t.description), esc(t.categoryId ? cat.get(t.categoryId) ?? '' : ''),
          esc(acc.get(t.accountId) ?? ''), esc(t.toAccountId ? acc.get(t.toAccountId) ?? '' : ''),
          ((t.type === 'expense' ? -t.amount : t.amount) / 100).toFixed(2).replace('.', ','),
          t.paid ? 'Efetivado' : 'Pendente',
          t.installmentTotal ? `${t.installmentNumber}/${t.installmentTotal}` : '', esc(t.notes ?? ''),
        ].join(';')),
      ]
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `control-lancamentos-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${txs.length} lançamentos exportados`)
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel title="Seus dados">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Baixe todos os lançamentos em planilha (CSV).</p>
        <Button variant="secondary" icon={<Download className="size-4" />} loading={loading} onClick={exportCsv}>Exportar</Button>
      </div>
    </Panel>
  )
}
