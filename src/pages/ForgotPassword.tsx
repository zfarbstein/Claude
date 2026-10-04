import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { Alert, Button, TextField } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    // Don't reveal whether an account exists; only surface errors the user can act on.
    if (error && error.status !== 400 && error.status !== 404) setError(friendlyAuthError(error))
    else setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-slate-800" role="status">
          If an account exists for <strong>{sentTo}</strong>, we sent a link to reset your password. It expires in 1 hour.
        </p>
        <p className="mt-3 text-sm text-slate-600">Don&rsquo;t see it? Check spam or junk. You can request another link in a minute.</p>
        <Button variant="secondary" block className="mt-6" onClick={() => setSentTo(null)}>
          Send another link
        </Button>
        <Link to="/login" className="mt-4 block text-center font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send you a link to choose a new password.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="gatorlink@ufl.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block busy={busy} disabled={!email.trim()}>
          Send reset link
        </Button>
      </form>
      <Link to="/login" className="mt-5 block text-center font-semibold text-brand-700 hover:underline">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
