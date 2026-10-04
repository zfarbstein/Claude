import type { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { useEffect, useRef } from 'react'
import { cx } from '../lib/cx'
import { textColorOn } from '../lib/categories'
import { formatTimeRange, inChapterTz, isMultiDayOrAllDay, layoutDay } from '../lib/time'
import type { CalendarEvent, Category } from '../lib/types'

const HOUR_PX = 48
const HOURS = Array.from({ length: 24 }, (_, h) => h)

interface WeekGridProps {
  days: TZDate[]
  todayKey: string
  now: Date
  byDay: Map<string, CalendarEvent[]>
  categories: Map<string, Category>
  onOpen: (event: CalendarEvent) => void
  onSelectDay: (key: string) => void
}

export function WeekGrid({ days, todayKey, now: nowInstant, byDay, categories, onOpen, onSelectDay }: WeekGridProps) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Start the day view around 8 AM.
    if (scroller.current) scroller.current.scrollTop = 8 * HOUR_PX
  }, [])

  const now = inChapterTz(nowInstant)
  const nowTop = (now.getHours() * 60 + now.getMinutes()) * (HOUR_PX / 60)
  const colorOf = (e: CalendarEvent) => categories.get(e.category)?.color ?? '#4B5563'

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-white">
        <span />
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              aria-label={format(day, 'EEEE, MMMM d')}
              aria-current={key === todayKey ? 'date' : undefined}
              className="flex min-h-12 flex-col items-center justify-center py-1"
            >
              <span className="text-[11px] font-bold text-slate-600 uppercase">{format(day, 'EEE')}</span>
              <span
                className={cx(
                  'flex size-7 items-center justify-center rounded-full text-sm font-bold',
                  key === todayKey ? 'bg-brand-700 text-white' : 'text-slate-900',
                )}
              >
                {day.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* All-day and multi-day events */}
      <div className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-white">
        <span className="self-center pr-1 text-right text-[10px] font-semibold text-slate-600">all day</span>
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const allDay = (byDay.get(key) ?? []).filter(isMultiDayOrAllDay)
          return (
            <div key={key} className="flex min-h-8 flex-col gap-0.5 border-l border-slate-100 p-0.5">
              {allDay.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e)}
                  className="truncate rounded px-1 text-left text-[11px] leading-5 font-semibold"
                  style={{ backgroundColor: colorOf(e), color: textColorOn(colorOf(e)) }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>

      <div ref={scroller} className="h-[calc(100dvh-17rem)] min-h-80 overflow-y-auto bg-white">
        <div className="relative grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HOUR_PX }}>
          <div className="relative">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] font-semibold text-slate-600"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const timed = (byDay.get(key) ?? []).filter((e) => !isMultiDayOrAllDay(e))
            return (
              <div key={key} className="relative border-l border-slate-100">
                {HOURS.map((h) => (
                  <div key={h} aria-hidden className="absolute inset-x-0 border-t border-slate-100" style={{ top: h * HOUR_PX }} />
                ))}
                {layoutDay(timed, day).map(({ event, top, height, column, columns }) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpen(event)}
                    aria-label={`${event.title}, ${formatTimeRange(event)}`}
                    className="absolute overflow-hidden rounded-md px-0.5 text-left text-[10px] leading-tight font-semibold shadow-sm ring-1 ring-white"
                    style={{
                      top: (top * HOUR_PX) / 60,
                      height: (height * HOUR_PX) / 60,
                      left: `${(column / columns) * 100}%`,
                      width: `${100 / columns}%`,
                      backgroundColor: colorOf(event),
                      color: textColorOn(colorOf(event)),
                    }}
                  >
                    {event.title}
                  </button>
                ))}
                {key === todayKey && (
                  <div aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-red-600" style={{ top: nowTop }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
