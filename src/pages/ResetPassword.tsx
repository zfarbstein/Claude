import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { useAuth } from '../auth/AuthProvider'
import { FullScreenLoading } from '../auth/guards'
import { Alert, Button, TextField } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { PASSWORD_HINT, validatePassword } from '../lib/password'
import { supabase } from '../lib/supabase'

const EXPIRED_CODES = new Set(['otp_expired', 'otp_disabled', 'flow_state_expired', 'flow_state_not_found'])

/**
 * Handles the recovery link from the reset email:
 *   /reset-password?token_hash=...&type=recovery
 * The token is only redeemed when the member submits the form, so email link
 * scanners (e.g. Outlook Safe Links) that open the link can't burn it, and the
 * link works on a different device than the one that requested it.
 * Signed-in members can also open this page directly to change their password.
 */
export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const tokenHash = params.get('token_hash')
  const hasToken = !!tokenHash && params.get('type') === 'recovery'
  const linkError =
    params.get('error_description') ?? new URLSearchParams(window.location.hash.slice(1)).get('error_description')

  const [redeemed, setRedeemed] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [done, setDone] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = validatePassword(password) ?? (password !== confirm ? 'The passwords don’t match.' : null)
    setFieldError(problem)
    if (problem) return

    setBusy(true)
    if (hasToken && !redeemed) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' })
      if (error) {
        setBusy(false)
        if (EXPIRED_CODES.has(error.code ?? '') || error.status === 403) setExpired(true)
        else setError(friendlyAuthError(error))
        return
      }
      setRedeemed(true)
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setBusy(false)
      setError(friendlyAuthError(error))
      return
    }
    // Sign out any other device that had the old password.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
    window.history.replaceState(null, '', '/reset-password')
    setBusy(false)
    setDone(true)
  }

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 aria-hidden className="size-12 text-green-700" />
          <p className="text-slate-800">Your password has been changed. Use it next time you sign in.</p>
        </div>
        <Button block className="mt-6" onClick={() => navigate('/', { replace: true })}>
          Continue
        </Button>
      </AuthLayout>
    )
  }

  if (!hasToken && !redeemed && loading) return <FullScreenLoading />

  if (expired || linkError || (!hasToken && !session)) {
    return (
      <AuthLayout title="This link has expired">
        <p className="text-slate-800">
          Password reset links work once and expire after 1 hour. Request a new one and use the newest email.
        </p>
        <Link
          to="/forgot-password"
          className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
        >
          Request a new link
        </Link>
        <Link to="/login" className="mt-4 block text-center font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="New password"
          type={show ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <TextField
          label="Confirm new password"
          type={show ? 'text' : 'password'}
          name="confirm-password"
          autoComplete="new-password"
          error={fieldError}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="flex min-h-11 items-center gap-2 self-start font-semibold text-brand-700"
          aria-pressed={show}
        >
          {show ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          {show ? 'Hide passwords' : 'Show passwords'}
        </button>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block busy={busy} disabled={!password || !confirm}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  )
}
