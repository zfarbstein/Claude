import type { TZDate } from '@date-fns/tz'
import { format, isSameMonth } from 'date-fns'
import { cx } from '../lib/cx'
import { textColorOn } from '../lib/categories'
import type { CalendarEvent, Category } from '../lib/types'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface MonthGridProps {
  days: TZDate[]
  cursor: Date
  todayKey: string
  selectedKey: string
  byDay: Map<string, CalendarEvent[]>
  categories: Map<string, Category>
  onSelect: (key: string) => void
}

export function MonthGrid({ days, cursor, todayKey, selectedKey, byDay, categories, onSelect }: MonthGridProps) {
  return (
    <div className="px-2">
      <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-xs font-bold text-slate-600">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const events = byDay.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = key === todayKey
          const selected = key === selectedKey
          const label = `${format(day, 'EEEE, MMMM d')}, ${events.length === 0 ? 'no events' : `${events.length} event${events.length === 1 ? '' : 's'}`}`
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={label}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              data-day={key}
              className={cx(
                'flex min-h-16 flex-col gap-1 p-1 text-left sm:min-h-24',
                inMonth ? 'bg-white' : 'bg-slate-50',
                selected && 'relative z-10 outline-3 -outline-offset-3 outline-brand-700',
              )}
            >
              <span
                className={cx(
                  'mx-auto flex size-7 items-center justify-center rounded-full text-sm font-semibold sm:mx-0',
                  isToday ? 'bg-brand-700 text-white' : inMonth ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                {day.getDate()}
              </span>
              <span className="flex w-full flex-col gap-0.5">
                {events.slice(0, 3).map((e) => {
                  const color = categories.get(e.category)?.color ?? '#4B5563'
                  return (
                    <span key={e.id} className="w-full">
                      <span className="block h-1.5 rounded-full sm:hidden" style={{ backgroundColor: color }} />
                      <span
                        className="hidden truncate rounded px-1 text-xs leading-5 font-medium sm:block"
                        style={{ backgroundColor: color, color: textColorOn(color) }}
                      >
                        {e.title}
                      </span>
                    </span>
                  )
                })}
                {events.length > 3 && (
                  <span className="text-center text-[11px] leading-none font-bold text-slate-700 sm:text-left">
                    +{events.length - 3}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
