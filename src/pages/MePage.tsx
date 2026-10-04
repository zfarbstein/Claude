import { CalendarPlus, Copy, KeyRound, LogOut, RefreshCw, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/AppLayout'
import { IosInstallSteps, useInstallPrompt } from '../components/InstallPrompt'
import { useToast } from '../components/Toast'
import { Alert, Badge, Button, TextField } from '../components/ui'
import { ROLE_LABELS, TYPE_LABELS } from '../lib/permissions'
import { isIos, isStandalone } from '../lib/platform'
import { cal, functionsUrl, supabase } from '../lib/supabase'

export default function MePage() {
  const { member, refreshMember, signOut } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(member?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  if (!member) return null

  const saveName = async () => {
    setSavingName(true)
    const { error } = await supabase.from('members').update({ name: name.trim() }).eq('id', member.id)
    setSavingName(false)
    if (error) toast(error.message, 'error')
    else {
      toast('Name saved')
      void refreshMember()
    }
  }

  return (
    <div>
      <PageHeader title="Me" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-4">
        <section aria-labelledby="profile-title" className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 id="profile-title" className="text-lg font-bold">
            Profile
          </h2>
          <p className="text-slate-700">{member.email}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{TYPE_LABELS[member.member_type]}</Badge>
            {member.role !== 'member' && <Badge className="bg-brand-50 text-brand-900">{ROLE_LABELS[member.role]}</Badge>}
            {member.pledge_class && <Badge>{member.pledge_class} class</Badge>}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <Button variant="secondary" busy={savingName} disabled={!name.trim() || name.trim() === member.name} onClick={() => void saveName()}>
              Save
            </Button>
          </div>
        </section>

        <FeedSection />
        <InstallSection />

        <section className="flex flex-col gap-2">
          <Link
            to="/reset-password"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white font-semibold text-slate-900 ring-1 ring-slate-300"
          >
            <KeyRound aria-hidden className="size-5" /> Change password
          </Link>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut aria-hidden className="size-5" /> Sign out
          </Button>
        </section>
      </main>
    </div>
  )
}

function FeedSection() {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const load = async (rotate: boolean) => {
    setBusy(true)
    const { data, error } = await cal.rpc('feed_token', { p_rotate: rotate })
    setBusy(false)
    setConfirmReset(false)
    if (error) toast(error.message, 'error')
    else {
      setToken(data)
      if (rotate) toast('New link created. The old one stops working.')
    }
  }

  const httpsUrl = token ? `${functionsUrl}/ics-feed?token=${token}` : ''
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      toast('Link copied')
    } catch {
      toast('Copy failed. Press and hold the link to copy it.', 'error')
    }
  }

  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 id="feed-title" className="flex items-center gap-2 text-lg font-bold">
        <CalendarPlus aria-hidden className="size-5" /> Sync to your calendar
      </h2>
      <p className="text-slate-700">Subscribe in Google or Apple Calendar to see chapter events next to your own. It updates automatically.</p>
      {!token ? (
        <Button busy={busy} onClick={() => void load(false)}>
          Get my calendar link
        </Button>
      ) : (
        <>
          <a href={webcalUrl} className="flex min-h-12 items-center justify-center rounded-xl bg-brand-700 font-semibold text-white">
            Add to Apple Calendar
          </a>
          <a
            href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center rounded-xl bg-white font-semibold text-slate-900 ring-1 ring-slate-300"
          >
            Add to Google Calendar
          </a>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-700" data-testid="feed-url">
              {httpsUrl}
            </code>
            <button type="button" onClick={() => void copy()} aria-label="Copy link" className="flex size-11 items-center justify-center rounded-lg hover:bg-slate-200">
              <Copy aria-hidden className="size-5" />
            </button>
          </div>
          <p className="text-sm text-slate-600">This link is personal. Anyone who has it can see the chapter calendar, so don&rsquo;t share it.</p>
          {confirmReset ? (
            <Alert kind="info">
              <p className="mb-2">Reset the link? Calendars using the old one will stop updating.</p>
              <div className="flex gap-2">
                <Button variant="danger" busy={busy} onClick={() => void load(true)}>
                  Reset link
                </Button>
                <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            </Alert>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              <RefreshCw aria-hidden className="size-5" /> Reset link
            </Button>
          )}
        </>
      )}
    </section>
  )
}

function InstallSection() {
  const { available, install } = useInstallPrompt()
  if (isStandalone()) return null
  return (
    <section aria-labelledby="install-title" className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 id="install-title" className="flex items-center gap-2 text-lg font-bold">
        <Smartphone aria-hidden className="size-5" /> Install the app
      </h2>
      {isIos() ? (
        <IosInstallSteps />
      ) : available ? (
        <Button onClick={() => void install()}>Install</Button>
      ) : (
        <p className="text-slate-700">In Chrome, open the menu (⋮) and tap &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.</p>
      )}
    </section>
  )
}
