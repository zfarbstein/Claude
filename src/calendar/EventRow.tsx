import { EyeOff, MapPin } from 'lucide-react'
import { Badge } from '../components/ui'
import { formatTimeRange } from '../lib/time'
import type { CalendarEvent, Category, RsvpStatus } from '../lib/types'
import { RSVP_LABELS } from './labels'

export function EventRow({
  event,
  category,
  rsvp,
  showHiddenFlag,
  onOpen,
}: {
  event: CalendarEvent
  category: Category | undefined
  rsvp: RsvpStatus | undefined
  showHiddenFlag: boolean
  onOpen: () => void
}) {
  const color = category?.color ?? '#4B5563'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-stretch gap-3 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
    >
      <span aria-hidden className="w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-slate-700">{formatTimeRange(event)}</span>
        <span className="text-base leading-snug font-bold text-slate-900">{event.title}</span>
        {event.location && (
          <span className="flex items-center gap-1 truncate text-sm text-slate-700">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {event.location}
          </span>
        )}
        <span className="flex flex-wrap gap-1.5">
          <span className="sr-only">Category: </span>
          <Badge className="bg-slate-100 text-slate-800">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
            {category?.label ?? event.category}
          </Badge>
          {event.required && <Badge className="bg-blue-100 text-blue-900">Required</Badge>}
          {showHiddenFlag && event.hidden_from_associates && (
            <Badge className="bg-amber-100 text-amber-900">
              <EyeOff aria-hidden className="size-3" /> Hidden from AMs
            </Badge>
          )}
          {rsvp && <Badge className="bg-green-100 text-green-900">{RSVP_LABELS[rsvp]}</Badge>}
        </span>
      </span>
    </button>
  )
}
