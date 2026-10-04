import { addMonths, format, isSameMonth } from 'date-fns'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useMemberNights, useMemberSchedule } from '../availability/api'
import { STATUS_LABELS, statusStyle } from '../availability/heat'
import { reasonText } from '../availability/reasons'
import { PageHeader } from '../components/AppLayout'
import { Alert, Badge } from '../components/ui'
import { cx } from '../lib/cx'
import { ACCESS_LABELS, accessOf, isAdmin } from '../lib/permissions'
import { dayKey, formatLongDay, formatTimeRange, fromDayKey, inChapterTz, monthGridDays, nowInChapterTz } from '../lib/time'
import { useSettings } from '../lib/useSettings'
import { useDirectory } from './api'
import { WeekSchedule } from './WeekSchedule'

export default function MemberPage() {
  const { id } = useParams()
  const { member: me } = useAuth()
  const directory = useDirectory()
  const person = directory.data?.find((m) => m.id === id)
  const schedule = useMemberSchedule(id)
  const settings = useSettings()
  const night = { start: settings.data?.night_start.slice(0, 5) ?? '19:00', end: settings.data?.night_end.slice(0, 5) ?? '23:00' }
  const detailed = !!schedule.data?.detailed

  return (
    <div>
      <PageHeader title={person?.name || 'Member'} back="/members" />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
        {person && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="bg-brand-50 text-brand-900">{ACCESS_LABELS[accessOf(person)]}</Badge>
            {person.pledge_class && <Badge>{person.pledge_class}</Badge>}
            {isAdmin(me) && <span className="text-sm break-all text-slate-700">{person.email}</span>}
          </div>
        )}
        {directory.data && !person && <Alert>That member isn&rsquo;t in the chapter list.</Alert>}
        {schedule.isError && <Alert>{schedule.error.message}</Alert>}

        {schedule.data && (
          <>
            {!schedule.data.submitted && (
              <Alert kind="info">
                {id === me?.id ? (
                  <>
                    You haven&rsquo;t finished your schedule. <Link to="/setup" className="font-semibold underline">Finish it</Link>
                  </>
                ) : (
                  'Hasn’t submitted a schedule for this semester yet, so their nights show as unknown.'
                )}
              </Alert>
            )}
            {!detailed && <p className="text-sm text-slate-600">You see when they&rsquo;re busy, not what they&rsquo;re doing.</p>}

            <section aria-labelledby="week-title" className="flex flex-col gap-2">
              <h2 id="week-title" className="text-lg font-bold">
                Every week
              </h2>
              <WeekSchedule blocks={schedule.data.blocks} night={night} />
              <p className="flex items-center gap-2 text-xs text-slate-600">
                <span aria-hidden className="inline-block size-3 rounded bg-indigo-50 ring-1 ring-indigo-100" /> Chapter night hours
              </p>
            </section>

            <section aria-labelledby="items-title" className="flex flex-col gap-2">
              <h2 id="items-title" className="text-lg font-bold">
                {detailed ? 'Exams and one-off obligations' : 'Other busy times'}
              </h2>
              {schedule.data.items.length === 0 ? (
                <p className="text-slate-600">Nothing coming up.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {schedule.data.items.map((i, k) => (
                    <li key={k} className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                      <CalendarClock aria-hidden className={cx('mt-0.5 size-5 shrink-0', i.kind === 'exam' ? 'text-amber-700' : 'text-slate-600')} />
                      <span>
                        <span className="block font-bold">
                          {detailed ? (i.course && i.title && !i.title.includes(i.course) ? `${i.course} ${i.title}` : i.title) : 'Busy'}
                        </span>
                        <span className="block text-sm text-slate-700">
                          {formatLongDay(i.starts_at)}, {formatTimeRange(i)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {id && <NightsCalendar memberId={id} detailed={detailed} />}
      </main>
    </div>
  )
}

function NightsCalendar({ memberId, detailed }: { memberId: string; detailed: boolean }) {
  const [cursor, setCursor] = useState(() => nowInChapterTz())
  const days = useMemo(() => monthGridDays(cursor), [cursor])
  const [selected, setSelected] = useState<string | null>(null)
  const nights = useMemberNights(memberId, dayKey(days[0]), dayKey(days[days.length - 1]))
  const picked = selected ? nights.data?.get(selected) : undefined

  return (
    <section aria-labelledby="nights-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h2 id="nights-title" className="flex-1 text-lg font-bold">
          Nights · {format(inChapterTz(cursor), 'MMMM')}
        </h2>
        <button type="button" aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))} className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button type="button" aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))} className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} aria-hidden className="text-[11px] font-bold text-slate-600">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const key = dayKey(day)
          const n = nights.data?.get(key)
          const style = n ? statusStyle(n.status) : null
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={selected === key}
              aria-label={`${format(day, 'EEEE, MMMM d')}: ${n ? STATUS_LABELS[n.status] : 'no data'}`}
              style={style ?? undefined}
              className={cx(
                'flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm font-bold',
                !style && 'bg-slate-100 text-slate-500',
                !isSameMonth(day, cursor) && 'opacity-50',
                selected === key && 'outline-3 outline-brand-700',
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
      {picked && (
        <p className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200" role="status">
          <strong>{formatLongDay(fromDayKey(picked.night))}:</strong> {STATUS_LABELS[picked.status]}
          {detailed && picked.reasons.length > 0 && ` — ${picked.reasons.map(reasonText).join('; ')}`}
        </p>
      )}
    </section>
  )
}
