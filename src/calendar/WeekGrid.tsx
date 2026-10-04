import type { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { cx } from '../lib/cx'
import { formatTimeRange } from '../lib/time'
import type { Category, DisplayEvent } from '../lib/types'
import { EventChip } from './EventChip'

interface WeekGridProps {
  days: TZDate[]
  todayKey: string
  byDay: Map<string, DisplayEvent[]>
  categories: Map<string, Category>
  onOpen: (event: DisplayEvent) => void
}

/** One week on one screen: the month layout with tall days. Tap an event for details. */
export function WeekGrid({ days, todayKey, byDay, categories, onOpen }: WeekGridProps) {
  return (
    <div className="sm:px-2">
      <div className="grid grid-cols-7 gap-px overflow-hidden bg-slate-200 ring-1 ring-slate-200 sm:rounded-xl">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const events = byDay.get(key) ?? []
          const isToday = key === todayKey
          return (
            <section
              key={key}
              aria-label={format(day, 'EEEE, MMMM d')}
              data-day={key}
              className="flex min-h-[calc(100dvh-17.5rem)] min-w-0 flex-col gap-1 bg-white p-px sm:p-1"
            >
              <header className="flex flex-col items-center pb-1">
                <span className="text-[10px] font-bold tracking-wide text-slate-600 uppercase sm:text-xs">{format(day, 'EEE')}</span>
                <span
                  aria-current={isToday ? 'date' : undefined}
                  className={cx(
                    'flex size-7 items-center justify-center rounded-full text-sm font-bold',
                    isToday ? 'bg-brand-700 text-white' : 'text-slate-900',
                  )}
                >
                  {day.getDate()}
                </span>
              </header>
              {events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e)}
                  aria-label={`${e.title}, ${formatTimeRange(e)}`}
                  className="w-full text-left"
                >
                  <EventChip event={e} color={categories.get(e.category)?.color} lines={4} showTime="always" />
                </button>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
