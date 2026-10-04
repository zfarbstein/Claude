import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { BellRing, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '../../components/Toast'
import { Alert, Badge, Button } from '../../components/ui'
import { cx } from '../../lib/cx'
import { unwrap } from '../../lib/query'
import { cal, supabase } from '../../lib/supabase'
import type { Submission } from '../../lib/types'
import { useSendNotification } from '../../notifications/api'
import { useCurrentSemester } from '../../schedule/api'

type Filter = 'missing' | 'done' | 'all'

const NUDGE = {
  title: 'Finish your schedule',
  body: 'Add your classes, exams and weekly obligations so the chapter knows when you’re free. It takes about 5 minutes.',
  url: '/setup',
}

const stepsDone = (s: Submission | undefined) => (s ? [s.classes_done_at, s.exams_done_at, s.obligations_done_at].filter(Boolean).length : 0)

/** Who has submitted this semester's schedule, with reminders for everyone who hasn't. */
export default function AdminSchedules() {
  const toast = useToast()
  const semester = useCurrentSemester()
  const send = useSendNotification()
  const [filter, setFilter] = useState<Filter>('missing')
  const [confirmAll, setConfirmAll] = useState(false)
  const data = useQuery({
    queryKey: ['admin', 'submissions', semester.data?.id],
    enabled: !!semester.data,
    queryFn: async () => {
      const [members, subs] = await Promise.all([
        supabase.from('members').select('id,name,member_type').eq('status', 'approved').eq('active', true).order('name'),
        cal.from('schedule_submissions').select('*').eq('semester_id', semester.data!.id),
      ])
      const bySubmitter = new Map(unwrap(subs).map((s) => [s.member_id, s]))
      return unwrap(members).map((m) => ({ ...m, submission: bySubmitter.get(m.id) }))
    },
  })

  if (semester.data === null) return <main className="mx-auto max-w-3xl px-4 py-4"><Alert kind="info">Start a semester first (Semester tab).</Alert></main>

  const rows = data.data ?? []
  const done = rows.filter((r) => r.submission?.completed)
  const missing = rows.filter((r) => !r.submission?.completed)
  const list = filter === 'missing' ? missing : filter === 'done' ? done : rows

  const nudge = (memberIds: string[] | null) =>
    send.mutate(
      { ...NUDGE, audience: memberIds ? 'members' : 'unsubmitted', memberIds: memberIds ?? [] },
      {
        onSuccess: () => {
          toast(memberIds ? 'Reminder sent' : `Reminder sent to ${missing.length} members`)
          setConfirmAll(false)
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label="Submission progress">
        <p className="text-sm text-slate-600">{semester.data?.name}</p>
        <p className="text-2xl font-bold tabular-nums">
          {done.length}/{rows.length} <span className="text-base font-semibold text-slate-700">submitted</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
          <div className="h-full bg-green-600" style={{ width: rows.length ? `${(done.length / rows.length) * 100}%` : 0 }} />
        </div>
        {missing.length > 0 &&
          (confirmAll ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm font-semibold">Send &ldquo;{NUDGE.title}&rdquo; to the {missing.length} members who haven&rsquo;t finished?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button busy={send.isPending} onClick={() => nudge(null)}>
                  Send reminder
                </Button>
                <Button variant="secondary" onClick={() => setConfirmAll(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3 w-full" onClick={() => setConfirmAll(true)}>
              <BellRing aria-hidden className="size-5" /> Remind everyone who hasn&rsquo;t finished
            </Button>
          ))}
      </section>

      <div role="group" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['missing', `Not done (${missing.length})`],
            ['done', `Done (${done.length})`],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cx('min-h-10 rounded-lg text-sm font-bold', filter === key ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
          >
            {label}
          </button>
        ))}
      </div>
      {data.isError && <Alert>{data.error.message}</Alert>}
      {data.isPending && <p className="text-slate-600">Loading…</p>}

      <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {list.map((r) => {
          const n = stepsDone(r.submission)
          return (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              <Link to={`/admin/schedules/${r.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{r.name}</span>
                  <span className="block text-sm text-slate-600">
                    {r.submission?.completed
                      ? `Done ${formatDistanceToNow(new Date(r.submission.updated_at), { addSuffix: true })}`
                      : n > 0
                        ? `In progress (${n} of 3 steps)`
                        : 'Not started'}
                  </span>
                </span>
                {r.submission?.canvas_sync_error && <Badge className="bg-red-100 text-red-900">Canvas error</Badge>}
                <ChevronRight aria-hidden className="size-5 shrink-0 text-slate-400" />
              </Link>
              {!r.submission?.completed && (
                <Button variant="secondary" className="min-h-10 px-3 text-sm" busy={send.isPending && send.variables?.memberIds?.[0] === r.id} onClick={() => nudge([r.id])}>
                  Remind
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
