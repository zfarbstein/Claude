import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { GoogleButton } from '../auth/GoogleButton'
import { Alert, Button, TextField } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { PASSWORD_HINT, validatePassword } from '../lib/password'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const pwError = validatePassword(password)
    setPasswordError(pwError)
    if (pwError || !name.trim() || !email.trim()) return
    setBusy(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })
    setBusy(false)
    if (error) setError(friendlyAuthError(error))
    else setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-slate-800">
          We sent a confirmation link to <strong>{sentTo}</strong>. Tap it to confirm your email. After that, an officer will approve
          your account.
        </p>
        <p className="mt-3 text-sm text-slate-600">Don&rsquo;t see it? Check spam or junk, or wait a minute.</p>
        <Link to="/login" className="mt-6 block text-center font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create an account" subtitle="An officer approves every new account before you can see the calendar.">
      <GoogleButton />
      <div className="my-5 flex items-center gap-3 text-sm text-slate-600">
        <span className="h-px flex-1 bg-slate-200" />
        or use email
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Full name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
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
        <TextField
          label="Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={passwordError}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block busy={busy} disabled={!name.trim() || !email.trim() || !password}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-slate-700">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
