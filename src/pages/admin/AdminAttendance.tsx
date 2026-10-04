import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { attendancePercent, useAttendanceReport } from '../../attendance/api'
import { useCategories } from '../../calendar/api'
import { Alert, Select, TextField } from '../../components/ui'
import { cx } from '../../lib/cx'
import { dayKey, inChapterTz } from '../../lib/time'
import type { AttendanceStatus } from '../../lib/types'
import { useNow } from '../../lib/useNow'
import { useCurrentSemester } from '../../schedule/api'

const CELL: Record<AttendanceStatus, { letter: string; className: string; label: string }> = {
  present: { letter: 'P', className: 'bg-green-100 text-green-900', label: 'Present' },
  absent: { letter: 'A', className: 'bg-red-100 text-red-900', label: 'Absent' },
  excused: { letter: 'E', className: 'bg-amber-100 text-amber-900', label: 'Excused' },
}

/** Members x events with attendance %. Required events (and any event with attendance taken) count. */
export default function AdminAttendance() {
  const semester = useCurrentSemester()
  const categories = useCategories().data ?? []
  const now = useNow()
  const today = dayKey(now)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState(today)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<'name' | 'percent'>('name')
  const start = from ?? semester.data?.starts_on ?? dayKey(now.getTime() - 90 * 24 * 3600_000)
  const report = useAttendanceReport(start, to, category)

  const rows = useMemo(() => {
    const data = report.data
    if (!data) return []
    const cells = new Map(data.cells.map((c) => [`${c.m}:${c.e}`, c.s]))
    const list = data.members
      .map((m) => {
        const statuses = data.events.map((e) => cells.get(`${m.id}:${e.id}`) ?? null)
        return { ...m, statuses, percent: attendancePercent(statuses.filter((s): s is AttendanceStatus => !!s)) }
      })
      .filter((m) => m.statuses.some(Boolean))
    if (sort === 'percent') list.sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.name.localeCompare(b.name))
    return list
  }, [report.data, sort])

  const events = report.data?.events ?? []

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField label="From" type="date" value={start} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select label="Sort" value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'percent')}>
          <option value="name">By name</option>
          <option value="percent">Lowest attendance first</option>
        </Select>
      </div>
      <p className="text-sm text-slate-600">
        Counts required events and any event where attendance was taken. No check-in counts as absent; excused events don&rsquo;t count against anyone.
      </p>
      {report.isError && <Alert>{report.error.message}</Alert>}
      {report.isPending && <p className="text-slate-600">Loading…</p>}
      {report.data && events.length === 0 && <p className="text-slate-600">No events with attendance in this range.</p>}

      {events.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Attendance by member and event</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-36 border-b border-slate-200 bg-white px-3 py-2 text-left">
                  Member
                </th>
                <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right">
                  %
                </th>
                {events.map((e) => (
                  <th key={e.id} scope="col" className="border-b border-slate-200 px-1 py-2 align-bottom">
                    <Link to={`/attendance/${e.id}`} className="flex w-14 flex-col items-center gap-0.5 text-xs font-semibold text-brand-700 hover:underline">
                      <span className="line-clamp-2 text-center leading-tight">{e.title}</span>
                      <span className="font-normal text-slate-600">{format(inChapterTz(e.starts_at), 'M/d')}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 text-left font-semibold">
                    {m.name}
                    {m.member_type === 'associate' && <span className="ml-1 text-xs font-normal text-slate-600">(pledge)</span>}
                  </th>
                  <td
                    className={cx(
                      'border-b border-slate-100 px-2 text-right font-bold tabular-nums',
                      m.percent !== null && m.percent < 75 ? 'text-red-700' : 'text-slate-900',
                    )}
                  >
                    {m.percent === null ? '—' : `${m.percent}%`}
                  </td>
                  {m.statuses.map((s, i) => (
                    <td key={events[i].id} className="border-b border-slate-100 px-1 py-1 text-center">
                      {s ? (
                        <span title={CELL[s].label} className={cx('inline-flex size-7 items-center justify-center rounded-md text-xs font-bold', CELL[s].className)}>
                          {CELL[s].letter}
                          <span className="sr-only"> {CELL[s].label}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300" aria-label="Not counted">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex flex-wrap gap-3 text-xs text-slate-700">
        {Object.values(CELL).map((c) => (
          <span key={c.letter} className="flex items-center gap-1">
            <span className={cx('inline-flex size-5 items-center justify-center rounded font-bold', c.className)}>{c.letter}</span> {c.label}
          </span>
        ))}
      </p>
    </main>
  )
}
