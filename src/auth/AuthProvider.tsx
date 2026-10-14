import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createMemoryRepo, emptySeed } from '@/data/memoryRepo'
import { RepoContext } from '@/data/queries'
import type { Repo } from '@/data/repo'
import { createSupabaseRepo } from '@/data/supabaseRepo'
import { isDemo, supabase } from '@/lib/supabase'

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in'
  email: string | null
  userId: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('AuthProvider ausente')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  // Sem Supabase configurado não há sessão para esperar: cai direto no aviso de configuração
  const [session, setSession] = useState<Session | null | undefined>(isDemo || !supabase ? null : undefined)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Troca de usuário (ou saída): o cache local de outro usuário nunca pode aparecer.
  const userId = isDemo ? 'demo' : session?.user.id ?? null
  useEffect(() => {
    const previous = localStorage.getItem('control:user')
    if (userId && previous && previous !== userId) qc.clear()
    if (userId) localStorage.setItem('control:user', userId)
  }, [userId, qc])

  const repo: Repo | null = useMemo(() => {
    // ?vazio simula o primeiro acesso de uma conta nova (só no modo demonstração)
    if (isDemo) return createMemoryRepo(new URLSearchParams(location.search).has('vazio') ? emptySeed() : undefined)
    return supabase && session ? createSupabaseRepo(supabase) : null
  }, [session])

  const state: AuthState = {
    status: isDemo ? 'signed-in' : session === undefined ? 'loading' : session ? 'signed-in' : 'signed-out',
    email: isDemo ? 'demonstracao@control.app' : session?.user.email ?? null,
    userId,
    signOut: async () => {
      qc.clear()
      localStorage.removeItem('control:user')
      localStorage.removeItem('control:cache')
      if (supabase) await supabase.auth.signOut()
    },
  }

  return (
    <AuthContext value={state}>
      <RepoContext value={repo}>{children}</RepoContext>
    </AuthContext>
  )
}
