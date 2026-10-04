import { CalendarClock, Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '../components/AppLayout'
import { Alert } from '../components/ui'
import { formatLongDay, formatTimeRange } from '../lib/time'
import { useNow } from '../lib/useNow'
import { WEEKDAY_NAMES } from '../../supabase/functions/_shared/schedule-types'
import { useMySchedule, useScheduleStatus } from './api'

const editLink = (step: number) => `/setup?step=${step}&edit=1`

/** '09:35:00', '10:25:00' -> '9:35–10:25a' */
function clockRange(start: string, end: string) {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return { text: `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`, pm: h >= 12 }
  }
  const a = fmt(start)
  const b = fmt(end)
  return a.pm === b.pm ? `${a.text}–${b.text}${b.pm ? 'p' : 'a'}` : `${a.text}${a.pm ? 'p' : 'a'}–${b.text}${b.pm ? 'p' : 'a'}`
}

/** The member's own weekly schedule and exams, with links back into each setup step. */
export default function MySchedulePage() {
  const status = useScheduleStatus()
  const schedule = useMySchedule(status.semester?.id)
  const now = useNow()

  if (!status.semester) {
    return (
      <div>
        <PageHeader title="My schedule" />
        <main className="mx-auto max-w-3xl px-4 py-4">
          <Alert kind="info">Your chapter hasn&rsquo;t started a semester yet. Once an admin does, you can add your schedule here.</Alert>
        </main>
      </div>
    )
  }

  const blocks = schedule.data?.blocks ?? []
  const exams = (schedule.data?.items ?? []).filter((i) => i.kind === 'exam' && !i.dismissed && Date.parse(i.ends_at) >= now.getTime())
  const deadlines = (schedule.data?.items ?? []).filter((i) => i.kind === 'deadline' && !i.dismissed).length

  return (
    <div>
      <PageHeader title="My schedule" />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
        <p className="text-sm text-slate-600">{status.semester.name}. Only you and chapter admins can see the details.</p>

        <section aria-labelledby="week-title" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 id="week-title" className="text-lg font-bold">
              Every week
            </h2>
            <span className="flex gap-1">
              <Link to={editLink(1)} className="flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-brand-700">
                <Pencil aria-hidden className="size-4" /> Classes
              </Link>
              <Link to={editLink(3)} className="flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-brand-700">
                <Pencil aria-hidden className="size-4" /> Other
              </Link>
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WEEKDAY_NAMES.map((day, d) => {
              const today = blocks.filter((b) => b.weekday === d)
              if (today.length === 0) return null
              return (
                <li key={day} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <h3 className="font-bold">{day}</h3>
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {today.map((b) => (
                      <li key={b.id} className="flex gap-2">
                        <span className="w-28 shrink-0 font-semibold text-slate-700 tabular-nums">{clockRange(b.start_time, b.end_time)}</span>
                        <span className="min-w-0">
                          {b.label}
                          {b.kind === 'obligation' && <span className="text-slate-600"> (obligation)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
          {blocks.length === 0 && <p className="text-slate-600">Nothing weekly.</p>}
        </section>

        <section aria-labelledby="exam-title" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 id="exam-title" className="text-lg font-bold">
              Upcoming exams
            </h2>
            <Link to={editLink(2)} className="flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-brand-700">
              <Pencil aria-hidden className="size-4" /> Edit
            </Link>
          </div>
          {exams.length === 0 ? (
            <p className="text-slate-600">No upcoming exams.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {exams.map((e) => (
                <li key={e.id} className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
                  <span>
                    <span className="block font-bold">{e.course ? `${e.course} ${e.title}` : e.title}</span>
                    <span className="block text-sm text-slate-700">
                      {formatLongDay(e.starts_at)}, {formatTimeRange(e)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {deadlines > 0 && <p className="text-sm text-slate-600">Plus {deadlines} deadlines that don&rsquo;t block your availability.</p>}
        </section>
      </main>
    </div>
  )
}
