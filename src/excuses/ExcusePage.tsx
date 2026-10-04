import { formatDistanceToNow } from 'date-fns'
import { Paperclip } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '../components/AppLayout'
import { useToast } from '../components/Toast'
import { Alert, Badge, Button, Select, TextArea } from '../components/ui'
import { formatLongDay, formatTimeRange } from '../lib/time'
import { useSettings } from '../lib/useSettings'
import { useExcusableEvents, useMyExcuses, useSubmitExcuse } from './api'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Waiting for review', className: 'bg-amber-100 text-amber-900' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-900' },
  denied: { label: 'Denied', className: 'bg-red-100 text-red-900' },
}

/** Excuse form for required chapter events, plus your past excuses and their status. */
export default function ExcusePage() {
  const [params] = useSearchParams()
  const toast = useToast()
  const settings = useSettings()
  const events = useExcusableEvents()
  const mine = useMyExcuses()
  const submit = useSubmitExcuse()
  const [eventId, setEventId] = useState(params.get('event') ?? '')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enabled = settings.data?.excuses_enabled ?? true
  const attachmentRequired = settings.data?.excuse_attachment_required ?? false
  const open = new Set((mine.data ?? []).filter((x) => x.status !== 'denied').map((x) => x.event_id))
  const choices = (events.data ?? []).filter((e) => !open.has(e.id) || e.id === eventId)

  const send = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!eventId) return setError('Pick the event.')
    if (!reason.trim()) return setError('Say why you can’t make it.')
    if (attachmentRequired && !file) return setError('Attach proof (a screenshot, photo or PDF).')
    if (file && file.size > 10 * 1024 * 1024) return setError('That file is over 10 MB.')
    submit.mutate(
      { eventId, reason: reason.trim(), file },
      {
        onSuccess: (r) => {
          toast(r.emailed ? 'Excuse sent to the secretary' : 'Excuse submitted')
          setReason('')
          setFile(null)
          setEventId('')
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <div>
      <PageHeader title="Excuses" back="/me" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-4">
        <section aria-labelledby="new-excuse" className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 id="new-excuse" className="text-lg font-bold">
            Request an excuse
          </h2>
          {!enabled ? (
            <Alert kind="info">Excuses are turned off right now. Talk to the secretary.</Alert>
          ) : (
            <form onSubmit={send} className="flex flex-col gap-3" noValidate>
              <p className="text-sm text-slate-700">For required chapter events you can&rsquo;t make. The secretary reviews it and you&rsquo;ll get a notification.</p>
              <Select label="Event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">Pick an event</option>
                {choices.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} · {formatLongDay(ev.starts_at)}, {formatTimeRange(ev)}
                  </option>
                ))}
              </Select>
              {events.data && choices.length === 0 && <p className="text-sm text-slate-600">No required events coming up.</p>}
              <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={4} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="excuse-file" className="text-sm font-semibold text-slate-800">
                  Proof {attachmentRequired ? '(required)' : '(optional)'}
                </label>
                <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-400 px-3 text-slate-800">
                  <Paperclip aria-hidden className="size-5 shrink-0" />
                  <span className="min-w-0 truncate">{file ? file.name : 'Add a screenshot, photo or PDF'}</span>
                  <input
                    id="excuse-file"
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" busy={submit.isPending}>
                Submit excuse
              </Button>
            </form>
          )}
        </section>

        <section aria-labelledby="my-excuses" className="flex flex-col gap-2">
          <h2 id="my-excuses" className="text-lg font-bold">
            Your excuses
          </h2>
          {mine.data?.length === 0 && <p className="text-slate-600">None yet.</p>}
          <ul className="flex flex-col gap-2">
            {mine.data?.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold">{x.event?.title ?? 'Deleted event'}</span>
                  <Badge className={STATUS_BADGE[x.status]?.className}>{STATUS_BADGE[x.status]?.label ?? x.status}</Badge>
                </div>
                {x.event && <span className="text-sm text-slate-700">{formatLongDay(x.event.starts_at)}</span>}
                <p className="text-sm text-slate-800">{x.reason}</p>
                {x.review_note && <p className="text-sm text-slate-700">Note from the secretary: {x.review_note}</p>}
                <span className="text-xs text-slate-600">Sent {formatDistanceToNow(new Date(x.created_at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
