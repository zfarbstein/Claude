import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { useAuth } from '../auth/AuthProvider'
import { FullScreenLoading } from '../auth/guards'
import { Alert } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

/** OAuth (Google) return URL. supabase-js exchanges the ?code= for a session on load. */
export default function AuthCallback() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const urlError =
    params.get('error_description') ?? new URLSearchParams(window.location.hash.slice(1)).get('error_description')
  const [error, setError] = useState<string | null>(urlError)

  useEffect(() => {
    void supabase.auth.initialize().then(({ error }) => {
      if (error) setError(friendlyAuthError(error))
    })
    const timer = setTimeout(() => setError((e) => e ?? 'Sign-in took too long. Try again.'), 15_000)
    return () => clearTimeout(timer)
  }, [])

  if (session && !loading) return <Navigate to="/" replace />
  if (!error) return <FullScreenLoading />
  return (
    <AuthLayout title="Sign-in didn't finish">
      <Alert>{error}</Alert>
      <Link to="/login" className="mt-6 block text-center font-semibold text-brand-700 hover:underline">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
