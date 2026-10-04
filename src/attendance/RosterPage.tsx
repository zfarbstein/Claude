import { useQuery } from '@tanstack/react-query'
import { QrCode, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchEvent } from '../calendar/api'
import { PageHeader } from '../components/AppLayout'
import { useToast } from '../components/Toast'
import { Alert, Badge } from '../components/ui'
import { cx } from '../lib/cx'
import { formatLongDay, formatTimeRange } from '../lib/time'
import type { AttendanceStatus } from '../lib/types'
import { useRoster, useSetAttendance } from './api'

const STATUSES: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: 'present', label: 'Present', on: 'bg-green-700 text-white ring-green-700' },
  { value: 'absent', label: 'Absent', on: 'bg-red-700 text-white ring-red-700' },
  { value: 'excused', label: 'Excused', on: 'bg-amber-600 text-white ring-amber-600' },
]

/** Admin roster for one event: one tap per member, with QR check-ins appearing live. */
export default function RosterPage() {
  const { eventId = '' } = useParams()
  const toast = useToast()
  const event = useQuery({ queryKey: ['event', eventId], queryFn: () => fetchEvent(eventId) })
  const roster = useRoster(eventId)
  const setAttendance = useSetAttendance(eventId)
  const [query, setQuery] = useState('')

  const rows = roster.data ?? []
  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q))
  const count = (s: AttendanceStatus | null) => rows.filter((r) => r.status === s).length

  const mark = (memberId: string, current: AttendanceStatus | null, next: AttendanceStatus) =>
    setAttendance.mutate({ memberId, status: current === next ? null : next }, { onError: (e) => toast(e.message, 'error') })

  return (
    <div>
      <PageHeader title="Attendance" back="/admin/attendance" />
      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
        {event.data && (
          <div>
            <h2 className="text-xl font-bold">{event.data.title}</h2>
            <p className="text-slate-700">
              {formatLongDay(event.data.starts_at)}, {formatTimeRange(event.data)}
            </p>
          </div>
        )}
        {event.data === null && <Alert>That event was deleted.</Alert>}

        <Link
          to={`/attendance/${eventId}/code`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 font-semibold text-white hover:bg-brand-800"
        >
          <QrCode aria-hidden className="size-5" /> Show check-in QR code
        </Link>

        <dl className="grid grid-cols-4 gap-2 text-center text-sm" aria-label="Totals">
          {[
            ['Present', count('present')],
            ['Absent', count('absent')],
            ['Excused', count('excused')],
            ['Not marked', count(null)],
          ].map(([label, n]) => (
            <div key={label} className="rounded-xl bg-white p-2 ring-1 ring-slate-200">
              <dt className="text-xs font-semibold text-slate-600">{label}</dt>
              <dd className="text-xl font-bold tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>

        <label className="relative block">
          <span className="sr-only">Search the roster</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-10 text-base"
          />
        </label>

        {roster.isError && <Alert>{roster.error.message}</Alert>}
        {roster.isPending && <p className="text-slate-600">Loading…</p>}
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.member_id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="font-bold">{r.name}</span>
                {r.member_type === 'associate' && <Badge>Pledge</Badge>}
                {r.method === 'qr' && <Badge className="bg-green-100 text-green-900">Checked in</Badge>}
                {r.excuse_status === 'pending' && <Badge className="bg-amber-100 text-amber-900">Excuse pending</Badge>}
                {r.excuse_status === 'approved' && <Badge className="bg-amber-100 text-amber-900">Excuse approved</Badge>}
              </div>
              <div role="group" aria-label={`${r.name} attendance`} className="grid grid-cols-3 gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={r.status === s.value}
                    onClick={() => mark(r.member_id, r.status, s.value)}
                    className={cx('min-h-11 rounded-lg text-sm font-bold ring-1', r.status === s.value ? s.on : 'bg-white text-slate-800 ring-slate-300')}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
