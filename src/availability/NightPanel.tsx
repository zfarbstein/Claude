import { CircleSlash, FileText } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useToast } from '../components/Toast'
import { Alert, Button, TextField } from '../components/ui'
import { cx } from '../lib/cx'
import { formatLongDay, fromDayKey } from '../lib/time'
import type { MemberNight, NightCount, NightDetailRow, NightStatus } from '../lib/types'
import { useNightDetail, useSetNightMark } from './api'
import { clockRange, STATUS_LABELS } from './heat'
import { reasonText } from './reasons'

interface NightPanelProps {
  night: string
  window: { start: string; end: string }
  summary: NightCount | undefined
  mine: MemberNight | undefined
  past: boolean
  showChapter: boolean
  showNames: boolean
}

const DOT: Record<NightStatus, string> = { free: 'bg-green-600', busy: 'bg-red-600', unknown: 'bg-slate-400' }

/** The selected night: chapter counts, your own status with the "can't make it" toggle, and (admins) who's who. */
export function NightPanel({ night, window, summary, mine, past, showChapter, showNames }: NightPanelProps) {
  return (
    <section aria-labelledby="night-title" className="flex flex-col gap-4 px-4 py-4">
      <h2 id="night-title" className="text-lg font-bold">
        {formatLongDay(fromDayKey(night))}
        <span className="font-semibold text-slate-600"> · {clockRange(window.start, window.end)}</span>
      </h2>

      {showChapter && summary && (
        <dl className="grid grid-cols-3 gap-2 text-center" aria-label="Chapter availability">
          {(['free', 'busy', 'unknown'] as const).map((s) => (
            <div key={s} className="rounded-xl bg-white p-2 ring-1 ring-slate-200">
              <dt className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700">
                <span aria-hidden className={cx('size-2.5 rounded-full', DOT[s])} />
                {STATUS_LABELS[s]}
              </dt>
              <dd className="text-2xl font-bold tabular-nums">{summary[s]}</dd>
            </div>
          ))}
        </dl>
      )}

      <YourNight key={night} night={night} mine={mine} past={past} />

      {showNames && summary && <WhoIsFree night={night} />}
    </section>
  )
}

function YourNight({ night, mine, past }: { night: string; mine: MemberNight | undefined; past: boolean }) {
  const toast = useToast()
  const setMark = useSetNightMark()
  const [reason, setReason] = useState('')

  if (!mine) return null

  const save = (unavailable: boolean) =>
    setMark.mutate(
      { night, unavailable, reason },
      {
        onSuccess: () => {
          toast(unavailable ? 'Marked unavailable' : 'Marked free')
          setReason('')
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  const scheduleReasons = mine.reasons.filter((r) => r.kind !== 'mark')

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="font-bold">You</h3>
      <p className="flex items-center gap-2 text-slate-800">
        <span aria-hidden className={cx('size-3 rounded-full', DOT[mine.status])} />
        {mine.status === 'free' && 'You’re free this night.'}
        {mine.status === 'busy' && (mine.marked ? 'You marked yourself unavailable.' : 'Your schedule has you busy.')}
        {mine.status === 'unknown' && 'Unknown: finish your schedule so the chapter knows when you’re free.'}
      </p>
      {(mine.mark_reason || scheduleReasons.length > 0) && (
        <ul className="ml-5 list-disc text-sm text-slate-700">
          {mine.mark_reason && <li>{mine.mark_reason}</li>}
          {scheduleReasons.map((r, i) => (
            <li key={i}>{reasonText(r)}</li>
          ))}
        </ul>
      )}

      {mine.required_event_id ? (
        <Alert kind="info">
          <p>
            <strong>{mine.required_event_title}</strong> is a required chapter event. You can&rsquo;t mark yourself out of it.
          </p>
          <Link
            to={`/excuse?event=${mine.required_event_id}`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 font-semibold text-brand-700 ring-1 ring-brand-100"
          >
            <FileText aria-hidden className="size-4" /> Request an excuse
          </Link>
        </Alert>
      ) : past ? (
        <p className="text-sm text-slate-600">This night has passed.</p>
      ) : mine.marked ? (
        <Button variant="secondary" busy={setMark.isPending} onClick={() => save(false)}>
          I&rsquo;m free after all
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            save(true)
          }}
        >
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="e.g. Family dinner" />
          <Button type="submit" variant="secondary" busy={setMark.isPending} className="text-red-700">
            <CircleSlash aria-hidden className="size-5" /> I can&rsquo;t make it this night
          </Button>
        </form>
      )}
    </div>
  )
}

function WhoIsFree({ night }: { night: string }) {
  const detail = useNightDetail(night, true)
  if (detail.isPending) return <p className="text-slate-600">Loading names…</p>
  if (detail.isError) return <Alert>{detail.error.message}</Alert>
  const groups: Record<NightStatus, NightDetailRow[]> = { busy: [], free: [], unknown: [] }
  for (const row of detail.data) groups[row.status].push(row)
  return (
    <div role="group" className="flex flex-col gap-2" aria-label="Who's free">
      {(['busy', 'free', 'unknown'] as const).map((s) =>
        groups[s].length === 0 ? null : (
          <details key={s} open={s === 'busy'} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <summary className="flex min-h-8 cursor-pointer items-center gap-2 font-semibold">
              <span aria-hidden className={cx('size-2.5 rounded-full', DOT[s])} />
              {STATUS_LABELS[s]} ({groups[s].length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {groups[s].map((row) => (
                <li key={row.member_id}>
                  <Link to={`/members/${row.member_id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
                    {row.name}
                  </Link>
                  {row.member_type === 'associate' && <span className="text-slate-600"> (pledge)</span>}
                  {s === 'busy' && row.reasons.length > 0 && <span className="text-slate-700"> — {row.reasons.map(reasonText).join('; ')}</span>}
                </li>
              ))}
            </ul>
          </details>
        ),
      )}
    </div>
  )
}
