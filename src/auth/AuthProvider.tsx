import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'

interface AuthContextValue {
  session: Session | null
  member: Member | null
  /** True until the session and (if signed in) the member row are known. */
  loading: boolean
  error: string | null
  refreshMember: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [member, setMember] = useState<Member | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setSessionReady(true)
    })
    // Never await Supabase calls inside this callback (it can deadlock the auth lock).
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionReady(true)
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  const loadMember = useCallback(async (id: string) => {
    const m = await supabase.from('members').select('*').eq('id', id).maybeSingle()
    if (m.error) {
      setError(m.error.message)
    } else {
      setError(null)
      setMember(m.data)
    }
    setLoadedFor(id)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- loading the member row is a fetch, not derived state
    if (userId) void loadMember(userId)
  }, [userId, loadMember])

  // Pick up role changes, approvals and deactivations when the app comes back to the foreground.
  useEffect(() => {
    if (!userId) return
    let last = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return
      last = Date.now()
      void loadMember(userId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, loadMember])

  const refreshMember = useCallback(async () => {
    if (userId) await loadMember(userId)
  }, [userId, loadMember])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      member: userId && loadedFor === userId ? member : null,
      loading: !sessionReady || (userId !== null && loadedFor !== userId),
      error,
      refreshMember,
      signOut,
    }),
    [session, userId, loadedFor, member, sessionReady, error, refreshMember, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
