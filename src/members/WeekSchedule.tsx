import { cx } from '../lib/cx'
import type { MemberScheduleView } from '../lib/types'
import { clockRange } from '../availability/heat'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_PX = 36

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Weekly time grid (Sun–Sat). Without details every block just says "Busy". The night window is shaded. */
export function WeekSchedule({ blocks, night }: { blocks: MemberScheduleView['blocks']; night: { start: string; end: string } }) {
  const starts = blocks.map((b) => minutes(b.start))
  const ends = blocks.map((b) => minutes(b.end))
  const nightStart = minutes(night.start)
  const nightEnd = minutes(night.end) > nightStart ? minutes(night.end) : 24 * 60
  const firstHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)))
  const lastHour = Math.max(Math.ceil(nightEnd / 60), ...ends.map((m) => Math.ceil(m / 60)))
  const height = (lastHour - firstHour) * HOUR_PX
  const y = (m: number) => ((m - firstHour * 60) / 60) * HOUR_PX
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] border-b border-slate-200 text-center text-[11px] font-bold text-slate-600 uppercase">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="py-1.5">
            {d}
          </span>
        ))}
      </div>
      <div className="relative grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]" style={{ height }}>
        <div className="relative">
          {hours.map((h) => (
            <span key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-500 tabular-nums" style={{ top: y(h * 60) }}>
              {h === firstHour ? '' : `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`}
            </span>
          ))}
        </div>
        {DAYS.map((d, weekday) => (
          <div key={d} role="group" aria-label={DAYS[weekday]} className="relative border-l border-slate-100">
            {hours.map((h) => (
              <span key={h} aria-hidden className="absolute inset-x-0 border-t border-slate-100" style={{ top: y(h * 60) }} />
            ))}
            <span aria-hidden className="absolute inset-x-0 bg-indigo-50" style={{ top: y(nightStart), height: y(nightEnd) - y(nightStart) }} />
            {blocks
              .filter((b) => b.weekday === weekday)
              .map((b, i) => (
                <div
                  key={i}
                  title={`${b.label ?? 'Busy'} ${clockRange(b.start, b.end)}`}
                  className={cx(
                    'absolute inset-x-px overflow-hidden rounded px-0.5 text-[9px] leading-tight font-semibold text-white sm:text-[11px]',
                    b.kind === 'class' ? 'bg-teal-700' : b.kind === 'obligation' ? 'bg-slate-600' : 'bg-slate-500',
                  )}
                  style={{ top: y(minutes(b.start)), height: Math.max(12, y(minutes(b.end)) - y(minutes(b.start))) }}
                >
                  <span className="sr-only">
                    {DAYS[weekday]} {clockRange(b.start, b.end)}:{' '}
                  </span>
                  {b.label ?? 'Busy'}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
