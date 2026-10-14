import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Logo } from '@/app/Logo'
import { isConfigured, supabase } from '@/lib/supabase'

type Mode = 'sign-in' | 'sign-up' | 'reset'

const COPY: Record<Mode, { title: string; cta: string }> = {
  'sign-in': { title: 'Entre na sua conta', cta: 'Entrar' },
  'sign-up': { title: 'Crie sua conta', cta: 'Criar conta' },
  reset: { title: 'Redefinir senha', cta: 'Enviar link' },
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (/already registered/i.test(message)) return 'Este e-mail já tem conta. Entre com sua senha.'
  if (/password should be at least/i.test(message)) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (/signups not allowed/i.test(message)) return 'Novos cadastros estão desativados neste app.'
  if (/rate limit/i.test(message)) return 'Muitas tentativas. Aguarde alguns minutos.'
  if (/failed to fetch/i.test(message)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return message
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!isConfigured || !supabase) return <SetupNotice />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError(null)
    setNotice(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Informe um e-mail válido.')
    if (mode !== 'reset' && !password) return setError('Informe sua senha.')
    setLoading(true)
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'sign-up') {
        if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) setNotice('Conta criada. Abra o link que enviamos para o seu e-mail para ativar.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/ajustes?senha=nova`,
        })
        if (error) throw error
        setNotice('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.')
      }
    } catch (err) {
      setError(translateAuthError(err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="pt-safe flex min-h-dvh flex-col px-5 md:items-center md:justify-center">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 md:flex-none">
        <Logo className="mb-12" />
        <h1 className="display mb-8 text-[32px] font-semibold leading-tight">{COPY[mode].title}</h1>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="E-mail" htmlFor="email">
            <TextInput
              id="email" type="email" autoComplete="email" inputMode="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {mode !== 'reset' && (
            <Field label="Senha" htmlFor="password" hint={mode === 'sign-up' ? 'Mínimo de 8 caracteres' : undefined}>
              <TextInput
                id="password" type="password" required minLength={8}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {error && <p role="alert" className="rounded-xl bg-loss-soft px-3.5 py-2.5 text-sm text-loss">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-gain-soft px-3.5 py-2.5 text-sm text-gain">{notice}</p>}
          <Button type="submit" size="lg" block loading={loading} className="mt-2">{COPY[mode].cta}</Button>
        </form>
        <div className="mt-6 flex flex-col items-start gap-3 text-sm">
          {mode === 'sign-in' ? (
            <>
              <button className="text-muted hover:text-ink" onClick={() => setMode('reset')}>Esqueci minha senha</button>
              <button className="text-muted hover:text-ink" onClick={() => setMode('sign-up')}>
                Ainda não tem conta? <span className="font-semibold text-brass">Criar conta</span>
              </button>
            </>
          ) : (
            <button className="text-muted hover:text-ink" onClick={() => setMode('sign-in')}>
              Já tem conta? <span className="font-semibold text-brass">Entrar</span>
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

function SetupNotice() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="max-w-md">
        <Logo className="mb-10" />
        <h1 className="display mb-3 text-[28px] font-semibold">Falta conectar o banco de dados</h1>
        <p className="mb-4 text-muted">
          Defina as variáveis <code className="rounded bg-raised px-1.5 py-0.5 text-ink">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-raised px-1.5 py-0.5 text-ink">VITE_SUPABASE_ANON_KEY</code> no Vercel (ou no
          arquivo <code className="rounded bg-raised px-1.5 py-0.5 text-ink">.env.local</code>) e publique de novo.
        </p>
        <p className="text-muted">O passo a passo está no README do projeto.</p>
      </div>
    </main>
  )
}
