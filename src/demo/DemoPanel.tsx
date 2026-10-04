import { ArrowLeft, FlaskConical, Mail, RotateCcw } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Alert, Button } from '../components/ui'
import { cx } from '../lib/cx'
import { supabase } from '../lib/supabase'
import { DEMO_PASSWORD, getOutbox, getVersion, markInboxRead, resetDemo, subscribe, type DemoEmail } from './backend'

const ACCOUNTS = [
  { email: 'president@example.com', label: 'Admin (exec)', name: 'Alex Rivera' },
  { email: 'social@example.com', label: 'Chair: Socials', name: 'Sam Patel' },
  { email: 'rush@example.com', label: 'Chair: Rush', name: 'Taylor Brooks' },
  { email: 'brother1@example.com', label: 'Brother', name: 'Marcus Johnson' },
  { email: 'am1@example.com', label: 'Associate Member', name: 'Luke Garcia' },
  { email: 'pending1@example.com', label: 'Waiting for approval', name: 'Pat Newcomer' },
]

const INTRO_KEY = 'chapter-calendar-demo-intro-seen'

function introSeen() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

/** Floating "Demo" button: switch between sample accounts, read emails the app sent, reset. */
export default function DemoPanel() {
  useSyncExternalStore(subscribe, getVersion)
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const [open, setOpen] = useState(() => !introSeen())
  const [tab, setTab] = useState<'accounts' | 'inbox'>('accounts')
  const [reading, setReading] = useState<DemoEmail | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const outbox = getOutbox()
  const unread = outbox.filter((m) => !m.read).length
  const currentEmail = session?.user.email

  const close = () => {
    try {
      localStorage.setItem(INTRO_KEY, '1')
    } catch {
      // ignore
    }
    setOpen(false)
    setReading(null)
    setConfirmReset(false)
  }

  const openPanel = () => {
    setTab(unread > 0 ? 'inbox' : 'accounts')
    setOpen(true)
  }

  const showTab = (next: 'accounts' | 'inbox') => {
    setTab(next)
    setReading(null)
    if (next === 'inbox') markInboxRead()
  }

  const signInAs = async (email: string) => {
    setBusy(email)
    const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
    setBusy(null)
    if (error) {
      toast(`${error.message} (if you changed this account's password in the demo, use the new one or reset the demo)`, 'error')
      return
    }
    close()
    navigate('/', { replace: true })
  }

  const reset = async () => {
    setBusy('reset')
    await supabase.auth.signOut()
    await resetDemo()
    setBusy(null)
    close()
    navigate('/login', { replace: true })
    toast('Demo data reset')
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 z-40 flex min-h-12 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-bold text-white shadow-lg"
      >
        {unread > 0 ? <Mail aria-hidden className="size-5" /> : <FlaskConical aria-hidden className="size-5" />}
        Demo
        {unread > 0 && (
          <span className="flex min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs text-slate-900" aria-label={`${unread} new emails`}>
            {unread}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={close} title="Demo tools">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            This test version runs entirely in your browser with sample members and events. Emails the app sends show up in the
            Inbox tab here instead of a real inbox.
          </p>
          <div role="tablist" aria-label="Demo tools" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(['accounts', 'inbox'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => showTab(t)}
                className={cx('min-h-11 rounded-lg text-sm font-bold', tab === t ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
              >
                {t === 'accounts' ? 'Sign in as' : `Inbox${outbox.length ? ` (${outbox.length})` : ''}`}
              </button>
            ))}
          </div>

          {tab === 'accounts' && (
            <ul className="flex flex-col gap-2">
              {ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void signInAs(a.email)}
                    className={cx(
                      'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 text-left ring-1',
                      currentEmail === a.email ? 'bg-brand-50 ring-brand-700' : 'bg-white ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span>
                      <span className="block font-bold text-slate-900">{a.label}</span>
                      <span className="block text-sm text-slate-700">
                        {a.name} · {a.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-brand-700">
                      {busy === a.email ? 'Signing in…' : currentEmail === a.email ? 'Signed in' : 'Sign in'}
                    </span>
                  </button>
                </li>
              ))}
              <li className="text-sm text-slate-600">
                Every sample account uses the password <strong>{DEMO_PASSWORD}</strong>. You can also create your own account on the
                sign-up page and approve it as the admin.
              </li>
            </ul>
          )}

          {tab === 'inbox' && !reading && (
            <ul className="flex flex-col gap-2">
              {outbox.length === 0 && <li className="text-slate-600">No emails yet. Sign up or use &ldquo;Forgot password?&rdquo; to get one.</li>}
              {outbox.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setReading(m)}
                    className="flex w-full flex-col gap-0.5 rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    <span className="font-bold text-slate-900">{m.subject}</span>
                    <span className="text-sm text-slate-700">To {m.to}</span>
                    <span className="text-xs text-slate-600">{new Date(m.sent_at).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === 'inbox' && reading && (
            <article className="flex flex-col gap-3">
              <button type="button" onClick={() => setReading(null)} className="flex min-h-11 items-center gap-1 self-start font-semibold text-brand-700">
                <ArrowLeft aria-hidden className="size-5" /> All emails
              </button>
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-xs text-slate-600">To {reading.to}</p>
                <h3 className="mt-2 text-lg font-bold">{reading.heading}</h3>
                <p className="mt-2 text-slate-800">{reading.body}</p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    close()
                    navigate(reading.path)
                  }}
                >
                  {reading.action}
                </Button>
              </div>
            </article>
          )}

          <div className="border-t border-slate-200 pt-4">
            {confirmReset ? (
              <Alert kind="info">
                <p className="mb-2">Put back the original sample members and events, clear the inbox, and sign out?</p>
                <div className="flex gap-2">
                  <Button variant="danger" busy={busy === 'reset'} onClick={() => void reset()}>
                    Reset demo
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                </div>
              </Alert>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmReset(true)}>
                <RotateCcw aria-hidden className="size-5" /> Reset demo data
              </Button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  )
}
