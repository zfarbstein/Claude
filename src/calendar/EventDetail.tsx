import { CalendarClock, EyeOff, MapPin, Pencil, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Alert, Badge, Button } from '../components/ui'
import { cx } from '../lib/cx'
import { canManageEvent, canRsvp, isBrother } from '../lib/permissions'
import { formatLongDay, formatTimeRange } from '../lib/time'
import type { CalendarEvent, Category, RsvpStatus } from '../lib/types'
import { useDeleteEvent, useEventRsvps, useSetRsvp } from './api'
import { RSVP_LABELS } from './labels'

const RSVP_ORDER: RsvpStatus[] = ['going', 'maybe', 'not_going']

interface EventDetailProps {
  event: CalendarEvent | null
  category: Category | undefined
  myRsvp: RsvpStatus | undefined
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
}

export function EventDetail({ event, category, myRsvp, onClose, onEdit }: EventDetailProps) {
  return (
    <Sheet open={!!event} onClose={onClose} title={event?.title ?? ''}>
      {event && <EventDetailBody key={event.id} event={event} category={category} myRsvp={myRsvp} onClose={onClose} onEdit={onEdit} />}
    </Sheet>
  )
}

function EventDetailBody({ event, category, myRsvp, onClose, onEdit }: EventDetailProps & { event: CalendarEvent }) {
  const { member, chairCategories } = useAuth()
  const toast = useToast()
  const brother = isBrother(member)
  const manage = canManageEvent(member, chairCategories, event)
  const rsvpOpen = canRsvp(event)
  const rsvps = useEventRsvps(event.id, brother && event.rsvp_enabled && !event.required)
  const setRsvp = useSetRsvp(member!.id)
  const del = useDeleteEvent()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const color = category?.color ?? '#4B5563'

  const chooseRsvp = (status: RsvpStatus) =>
    setRsvp.mutate(
      { eventId: event.id, status: myRsvp === status ? null : status },
      { onError: (e) => toast(e.message, 'error') },
    )

  const remove = (scope: 'single' | 'following') =>
    del.mutate(
      { event, scope },
      {
        onSuccess: (n) => {
          toast(n > 1 ? `${n} events deleted` : 'Event deleted')
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  const counts = RSVP_ORDER.map((s) => ({ s, names: (rsvps.data ?? []).filter((r) => r.status === s).map((r) => r.name) }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge className="bg-slate-100 text-slate-800">
          <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          {category?.label ?? event.category}
        </Badge>
        {event.required && <Badge className="bg-blue-100 text-blue-900">Required</Badge>}
        {brother && event.hidden_from_associates && (
          <Badge className="bg-amber-100 text-amber-900">
            <EyeOff aria-hidden className="size-3" /> Hidden from Associate Members
          </Badge>
        )}
      </div>

      <dl className="flex flex-col gap-3 text-base">
        <div className="flex gap-3">
          <dt>
            <CalendarClock aria-label="When" className="size-5 text-slate-600" />
          </dt>
          <dd>
            <div className="font-semibold">{formatLongDay(event.starts_at)}</div>
            <div className="text-slate-700">{formatTimeRange(event)}</div>
          </dd>
        </div>
        {event.series_id && (
          <div className="flex gap-3">
            <dt>
              <Repeat aria-label="Repeats" className="size-5 text-slate-600" />
            </dt>
            <dd className="text-slate-700">Part of a repeating series</dd>
          </div>
        )}
        {event.location && (
          <div className="flex gap-3">
            <dt>
              <MapPin aria-label="Where" className="size-5 text-slate-600" />
            </dt>
            <dd>
              <a
                className="font-medium text-brand-700 underline underline-offset-2"
                href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noreferrer"
              >
                {event.location}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {event.description && <p className="whitespace-pre-wrap text-slate-800">{event.description}</p>}

      {event.required && (
        <Alert kind="info">This is a required chapter event. Attendance is taken. If you can&rsquo;t make it, submit an excuse.</Alert>
      )}

      {rsvpOpen && (
        <section aria-labelledby="rsvp-title" className="flex flex-col gap-2">
          <h3 id="rsvp-title" className="font-bold">
            Are you going?
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {RSVP_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={myRsvp === s}
                disabled={setRsvp.isPending}
                onClick={() => chooseRsvp(s)}
                className={cx(
                  'min-h-12 rounded-xl text-sm font-bold ring-1',
                  myRsvp === s ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-900 ring-slate-300',
                )}
              >
                {RSVP_LABELS[s]}
              </button>
            ))}
          </div>
        </section>
      )}

      {brother && event.rsvp_enabled && !event.required && (rsvps.data?.length ?? 0) > 0 && (
        <section aria-label="Responses" className="flex flex-col gap-2 text-sm">
          {counts.map(({ s, names }) =>
            names.length ? (
              <details key={s} className="rounded-xl bg-slate-50 p-3">
                <summary className="cursor-pointer font-semibold">
                  {RSVP_LABELS[s]} ({names.length})
                </summary>
                <p className="mt-2 text-slate-700">{names.join(', ')}</p>
              </details>
            ) : null,
          )}
        </section>
      )}

      {manage && !confirmDelete && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={() => onEdit(event)}>
            <Pencil aria-hidden className="size-5" /> Edit
          </Button>
          <Button variant="secondary" className="text-red-700" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden className="size-5" /> Delete
          </Button>
        </div>
      )}

      {manage && confirmDelete && (
        <div role="alertdialog" aria-label="Delete event" className="flex flex-col gap-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="font-semibold text-red-900">Delete this event? RSVPs for it are removed too.</p>
          <Button variant="danger" busy={del.isPending} onClick={() => remove('single')}>
            {event.series_id ? 'Delete this event only' : 'Delete event'}
          </Button>
          {event.series_id && (
            <Button variant="danger" busy={del.isPending} onClick={() => remove('following')}>
              Delete this and following events
            </Button>
          )}
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
