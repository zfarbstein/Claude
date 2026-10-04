import type { TZDate } from '@date-fns/tz'
import { format, isSameMonth } from 'date-fns'
import type { CSSProperties } from 'react'
import { cx } from '../lib/cx'
import type { Category, DisplayEvent } from '../lib/types'
import { EventChip } from './EventChip'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** What a day shows in the availability view instead of its events. */
export interface NightCell {
  style: CSSProperties | null
  primary: string
  secondary?: string
  aria: string
  flags: string[]
}

interface MonthGridProps {
  days: TZDate[]
  cursor: Date
  todayKey: string
  selectedKey: string
  byDay: Map<string, DisplayEvent[]>
  categories: Map<string, Category>
  onSelect: (key: string) => void
  /** Availability view: shade each night instead of listing events. */
  nights?: Map<string, NightCell>
}

/** Month grid with event names right in each day. Tap a day for the full details below. */
export function MonthGrid({ days, cursor, todayKey, selectedKey, byDay, categories, onSelect, nights }: MonthGridProps) {
  return (
    <div className="sm:px-2">
      <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-[11px] font-bold tracking-wide text-slate-600 uppercase">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden bg-slate-200 ring-1 ring-slate-200 sm:rounded-xl">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const events = byDay.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = key === todayKey
          const selected = key === selectedKey
          const shown = events.slice(0, 3)
          const night = nights?.get(key)
          const label = nights
            ? `${format(day, 'EEEE, MMMM d')}: ${night?.aria ?? 'no data'}${night?.flags.length ? `. ${night.flags.join('. ')}` : ''}`
            : `${format(day, 'EEEE, MMMM d')}${events.length ? `: ${events.map((e) => e.title).join(', ')}` : ', nothing scheduled'}`
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={label}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              data-day={key}
              style={nights ? (night?.style ?? undefined) : undefined}
              className={cx(
                'flex min-h-[6.75rem] min-w-0 flex-col gap-0.5 p-px text-left align-top sm:min-h-32 sm:gap-1 sm:p-1',
                nights ? (night?.style ? '' : 'bg-slate-100 text-slate-600') : inMonth ? 'bg-white' : 'bg-slate-50',
                nights && !inMonth && 'opacity-55',
                selected && 'relative z-10 outline-3 -outline-offset-3 outline-brand-700',
              )}
            >
              <span
                className={cx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:size-7 sm:text-sm',
                  isToday ? 'bg-brand-700 text-white' : inMonth ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {day.getDate()}
              </span>
              {nights ? (
                <>
                  <span className="mt-auto text-center leading-tight tabular-nums">
                    {night?.primary.includes('/') ? (
                      <>
                        <span className="text-base font-extrabold sm:text-xl">{night.primary.split('/')[0]}</span>
                        <span className="text-[10px] font-bold sm:text-sm">/{night.primary.split('/')[1]}</span>
                      </>
                    ) : (
                      <span className="text-xs font-extrabold sm:text-base">{night?.primary ?? '–'}</span>
                    )}
                  </span>
                  {night?.secondary && <span className="text-center text-[10px] leading-tight font-semibold sm:text-xs">{night.secondary}</span>}
                  <span className="mb-0.5 flex min-h-3.5 flex-wrap justify-center gap-0.5">
                    {night?.flags.map((f) => (
                      <span key={f} className="rounded bg-white/85 px-0.5 text-[9px] leading-tight font-bold text-slate-800 sm:text-[10px]">
                        {f}
                      </span>
                    ))}
                  </span>
                </>
              ) : null}
              {!nights && shown.map((e) => (
                <EventChip key={e.id} event={e} color={categories.get(e.category)?.color} lines={2} />
              ))}
              {!nights && events.length > shown.length && (
                <span className="px-0.5 text-[10px] leading-tight font-bold text-slate-700 sm:text-xs">+{events.length - shown.length} more</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
