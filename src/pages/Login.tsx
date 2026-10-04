import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../auth/AuthLayout'
import { GoogleButton } from '../auth/GoogleButton'
import { Alert, Button, TextField } from '../components/ui'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    // On success, PublicOnly redirects as soon as the session arrives.
    if (error) {
      setError(friendlyAuthError(error))
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <GoogleButton />
      <div className="my-5 flex items-center gap-3 text-sm text-slate-600">
        <span className="h-px flex-1 bg-slate-200" />
        or use email
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="gatorlink@ufl.edu"
          hint="Your UF email works best, but any email is fine."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block busy={busy} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
      <div className="mt-5 flex flex-col items-center gap-3 text-base">
        <Link to="/forgot-password" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
          Forgot password?
        </Link>
        <p className="text-slate-700">
          New here?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
