import type { EmailOtpType } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { FullScreenLoading } from '../auth/guards'
import { Alert } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

const TYPES = new Set<EmailOtpType>(['email', 'signup', 'invite', 'magiclink', 'email_change'])

/** Landing page for email confirmation links: /auth/confirm?token_hash=...&type=email */
export default function AuthConfirm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  const invalid = type !== 'recovery' && (!tokenHash || !type || !TYPES.has(type))
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || invalid) return
    ran.current = true
    if (type === 'recovery') {
      navigate(`/reset-password?${params.toString()}`, { replace: true })
      return
    }
    void supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! }).then(({ error }) => {
      if (error) setError(friendlyAuthError(error))
      else navigate('/', { replace: true })
    })
  }, [params, navigate, invalid, tokenHash, type])

  if (invalid) {
    return (
      <AuthLayout title="Couldn't confirm your email">
        <Alert>This link is incomplete. Open it straight from the email.</Alert>
        <Link to="/login" className="mt-6 block text-center font-semibold text-brand-700 hover:underline">
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }
  if (!error) return <FullScreenLoading />
  return (
    <AuthLayout title="Couldn't confirm your email">
      <Alert>{error}</Alert>
      <p className="mt-4 text-slate-700">If you already confirmed, just sign in.</p>
      <Link to="/login" className="mt-6 block text-center font-semibold text-brand-700 hover:underline">
        Go to sign in
      </Link>
    </AuthLayout>
  )
}
