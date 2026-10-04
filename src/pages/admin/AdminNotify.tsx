import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { Bell, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Alert, Badge, Button, TextArea, TextField } from '../../components/ui'
import { cx } from '../../lib/cx'
import { CHAPTER_TZ, inChapterTz } from '../../lib/time'
import type { Audience, NotificationRow } from '../../lib/types'
import { useDirectory } from '../../members/api'
import { useCancelNotification, useNotificationHistory, useSendNotification } from '../../notifications/api'

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Everyone', hint: 'Brothers and pledges' },
  { value: 'brothers', label: 'Brothers', hint: 'Not pledges' },
  { value: 'pledges', label: 'Pledges (AMs)', hint: 'Associate members only' },
  { value: 'members', label: 'Specific members', hint: 'Pick below' },
  { value: 'unsubmitted', label: 'No schedule yet', hint: 'Haven’t finished this semester’s schedule' },
]

const AUDIENCE_LABELS: Record<string, string> = Object.fromEntries(AUDIENCES.map((a) => [a.value, a.label]))
const KIND_LABELS: Record<string, string> = { manual: 'Announcement', nudge: 'Schedule reminder', reminder: 'Event reminder', weekly: 'Weekly nights reminder', excuse: 'Excuse decision' }

/** 'yyyy-MM-ddTHH:mm' in chapter time -> ISO instant. */
function chapterLocalToIso(value: string): string {
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(new TZDate(y, m - 1, d, hh, mm, CHAPTER_TZ).getTime()).toISOString()
}

export default function AdminNotify() {
  const toast = useToast()
  const send = useSendNotification()
  const directory = useDirectory()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('everyone')
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [later, setLater] = useState(false)
  const [sendAt, setSendAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Add a title.')
    if (audience === 'members' && picked.length === 0) return setError('Pick at least one member.')
    let when: string | null = null
    if (later) {
      if (!sendAt) return setError('Pick when to send it.')
      when = chapterLocalToIso(sendAt)
      if (Date.parse(when) < Date.now()) return setError('Pick a time in the future.')
    }
    send.mutate(
      { title: title.trim(), body: body.trim(), audience, memberIds: picked, sendAt: when },
      {
        onSuccess: () => {
          toast(when ? `Scheduled for ${format(inChapterTz(when), 'EEE MMM d, h:mm a')}` : 'Sent')
          setTitle('')
          setBody('')
          setPicked([])
          setLater(false)
          setSendAt('')
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  const q = search.trim().toLowerCase()
  const people = (directory.data ?? []).filter((m) => !q || m.name.toLowerCase().includes(q))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-4">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" noValidate>
        <h2 className="text-lg font-bold">New notification</h2>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Formal tickets on sale" />
        <TextArea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3} hint={`${body.length}/300`} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-slate-800">Who gets it</legend>
          {AUDIENCES.map((a) => (
            <label key={a.value} className={cx('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1', audience === a.value ? 'bg-brand-50 ring-brand-700' : 'ring-slate-300')}>
              <input type="radio" name="audience" value={a.value} checked={audience === a.value} onChange={() => setAudience(a.value)} className="size-5 accent-brand-700" />
              <span>
                <span className="block font-semibold">{a.label}</span>
                <span className="block text-sm text-slate-600">{a.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {audience === 'members' && (
          <div className="flex flex-col gap-2">
            <label className="relative block">
              <span className="sr-only">Search members</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members"
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-10 text-base"
              />
            </label>
            <p className="text-sm text-slate-600">{picked.length} picked</p>
            <ul className="max-h-64 overflow-y-auto rounded-xl ring-1 ring-slate-200">
              {people.map((m) => (
                <li key={m.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand-700"
                      checked={picked.includes(m.id)}
                      onChange={(e) => setPicked((all) => (e.target.checked ? [...all, m.id] : all.filter((id) => id !== m.id)))}
                    />
                    {m.name}
                    {m.member_type === 'associate' && <span className="text-sm text-slate-600">(pledge)</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-slate-800">When</legend>
          <div role="group" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={later === v}
                onClick={() => setLater(v)}
                className={cx('min-h-10 rounded-lg text-sm font-bold', later === v ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
              >
                {v ? 'Schedule' : 'Send now'}
              </button>
            ))}
          </div>
          {later && <TextField label="Send at (chapter time)" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} hint="Goes out within 5 minutes of this time." />}
        </fieldset>

        {title.trim() && (
          <div aria-label="Preview" className="flex items-start gap-3 rounded-2xl bg-slate-100 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Bell aria-hidden className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{title}</span>
              {body && <span className="block text-sm text-slate-700">{body}</span>}
            </span>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" busy={send.isPending}>
          {later ? 'Schedule' : 'Send now'}
        </Button>
        <p className="text-sm text-slate-600">Members with notifications on get a push; everyone else gets an email. It also shows under the bell in the app.</p>
      </form>

      <History />
    </main>
  )
}

function History() {
  const history = useNotificationHistory()
  const cancel = useCancelNotification()
  const toast = useToast()
  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-2">
      <h2 id="history-title" className="text-lg font-bold">
        Sent and scheduled
      </h2>
      {history.isError && <Alert>{history.error.message}</Alert>}
      {history.data?.length === 0 && <p className="text-slate-600">Nothing yet.</p>}
      <ul className="flex flex-col gap-2">
        {history.data?.map((n: NotificationRow) => (
          <li key={n.id} className="flex flex-col gap-1 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold">{n.title}</span>
              <Badge
                className={cx(
                  n.status === 'sent' && 'bg-green-100 text-green-900',
                  n.status === 'scheduled' && 'bg-brand-50 text-brand-900',
                  (n.status === 'failed' || n.status === 'canceled') && 'bg-slate-200 text-slate-800',
                  n.status === 'sending' && 'bg-amber-100 text-amber-900',
                )}
              >
                {n.status}
              </Badge>
            </div>
            {n.body && <p className="text-sm text-slate-700">{n.body}</p>}
            <p className="text-xs text-slate-600">
              {KIND_LABELS[n.kind] ?? n.kind} · {AUDIENCE_LABELS[n.audience] ?? n.audience} ·{' '}
              {format(inChapterTz(n.sent_at ?? n.send_at), 'EEE MMM d, h:mm a')}
              {n.status === 'sent' && ` · ${n.recipients ?? 0} people, ${n.pushed ?? 0} by push, ${n.emailed ?? 0} by email`}
            </p>
            {n.error && <p className="text-xs text-red-800">{n.error}</p>}
            {n.status === 'scheduled' && (
              <Button
                variant="ghost"
                className="self-start text-red-700"
                busy={cancel.isPending && cancel.variables === n.id}
                onClick={() => cancel.mutate(n.id, { onSuccess: () => toast('Canceled'), onError: (e) => toast(e.message, 'error') })}
              >
                Cancel
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
