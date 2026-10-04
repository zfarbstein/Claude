import { addMonths, addWeeks, format, isSameMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useCategories, useEvents, useMyRsvps } from '../calendar/api'
import { CategoryFilter } from '../calendar/CategoryFilter'
import { EventDetail } from '../calendar/EventDetail'
import { EventForm, type EventFormMode } from '../calendar/EventForm'
import { EventRow } from '../calendar/EventRow'
import { MonthGrid } from '../calendar/MonthGrid'
import { WeekGrid } from '../calendar/WeekGrid'
import { useMyCalendarItems } from '../schedule/api'
import { Alert, Button } from '../components/ui'
import { cx } from '../lib/cx'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { canManageEvents, isBrother } from '../lib/permissions'
import {
  dayKey,
  eventsByDay,
  formatLongDay,
  fromDayKey,
  inChapterTz,
  monthGridDays,
  nowInChapterTz,
  rangeOfDays,
  weekDays,
} from '../lib/time'
import type { DisplayEvent } from '../lib/types'
import { useNow } from '../lib/useNow'
import { useStoredState } from '../lib/useStoredState'

type View = 'month' | 'week'

export default function CalendarPage() {
  const { member } = useAuth()
  const [view, setView] = useStoredState<View>('calendar.view', 'month')
  const [hidden, setHidden] = useStoredState<string[]>('calendar.hiddenCategories', [])
  const [cursor, setCursor] = useState<Date>(() => nowInChapterTz())
  const [selectedKey, setSelectedKey] = useState(() => dayKey(Date.now()))
  const [openEvent, setOpenEvent] = useState<DisplayEvent | null>(null)
  const [formMode, setFormMode] = useState<EventFormMode | null>(null)
  const touchX = useRef<number | null>(null)

  const now = useNow()
  const todayKey = dayKey(now)
  const days = view === 'month' ? monthGridDays(cursor) : weekDays(cursor)
  const { start, end } = rangeOfDays(days)

  const categoriesQuery = useCategories()
  const categories = categoriesQuery.data ?? DEFAULT_CATEGORIES
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])
  const eventsQuery = useEvents(start, end)
  const rsvpsQuery = useMyRsvps(member?.id)
  const personalQuery = useMyCalendarItems(start, end)

  const visibleEvents = useMemo(
    () => [...(eventsQuery.data ?? []), ...(personalQuery.data ?? [])].filter((e) => !hidden.includes(e.category)) as DisplayEvent[],
    [eventsQuery.data, personalQuery.data, hidden],
  )
  const byDay = useMemo(() => eventsByDay(visibleEvents), [visibleEvents])
  const manageable = canManageEvents(member) ? categories.map((c) => c.key) : []
  const selectedEvents = byDay.get(selectedKey) ?? []
  // Keep the open sheet in sync after edits/refetches.
  const liveOpenEvent: DisplayEvent | null = openEvent
    ? (eventsQuery.data?.find((e) => e.id === openEvent.id) ?? openEvent)
    : null

  const move = (delta: number) => {
    const next = view === 'month' ? addMonths(cursor, delta) : addWeeks(cursor, delta)
    setCursor(next)
    if (view === 'month') {
      const today = nowInChapterTz()
      setSelectedKey(dayKey(isSameMonth(today, next) ? today : startOfMonth(inChapterTz(next))))
    } else {
      setSelectedKey(dayKey(next))
    }
  }

  const goToday = () => {
    setCursor(nowInChapterTz())
    setSelectedKey(dayKey(Date.now()))
  }

  const title =
    view === 'month'
      ? format(inChapterTz(cursor), 'MMMM yyyy')
      : `${format(days[0], 'MMM d')} – ${format(days[6], isSameMonth(days[0], days[6]) ? 'd' : 'MMM d')}, ${format(days[6], 'yyyy')}`

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex min-h-14 items-center gap-1">
            <button type="button" aria-label={`Previous ${view}`} onClick={() => move(-1)} className="flex size-12 items-center justify-center rounded-full hover:bg-slate-100">
              <ChevronLeft aria-hidden className="size-6" />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center text-lg font-bold" aria-live="polite">
              {title}
            </h1>
            <button type="button" aria-label={`Next ${view}`} onClick={() => move(1)} className="flex size-12 items-center justify-center rounded-full hover:bg-slate-100">
              <ChevronRight aria-hidden className="size-6" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 pb-2">
            <Button variant="secondary" className="min-h-10 px-3 text-sm" onClick={goToday}>
              Today
            </Button>
            <div role="group" aria-label="View" className="flex rounded-xl bg-slate-100 p-1">
              {(['month', 'week'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v)
                    setCursor(fromDayKey(selectedKey))
                  }}
                  className={cx('min-h-10 rounded-lg px-4 text-sm font-bold capitalize', view === v ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <CategoryFilter categories={categories} hidden={hidden} onChange={setHidden} />
        </div>
      </header>

      <main
        className="mx-auto max-w-3xl pt-2"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null || view !== 'month') return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 70) move(dx < 0 ? 1 : -1)
        }}
      >
        {eventsQuery.isError && (
          <div className="px-4 pb-2">
            <Alert>
              Couldn&rsquo;t load events. <button className="font-semibold underline" onClick={() => void eventsQuery.refetch()}>Try again</button>
            </Alert>
          </div>
        )}

        {view === 'month' ? (
          <>
            <MonthGrid
              days={days}
              cursor={cursor}
              todayKey={todayKey}
              selectedKey={selectedKey}
              byDay={byDay}
              categories={categoryMap}
              onSelect={setSelectedKey}
            />
            <section aria-labelledby="day-title" className="px-4 py-4">
              <h2 id="day-title" className="text-lg font-bold">
                {formatLongDay(fromDayKey(selectedKey))}
              </h2>
              {eventsQuery.isPending ? (
                <p className="mt-2 text-slate-600">Loading…</p>
              ) : selectedEvents.length === 0 ? (
                <p className="mt-2 text-slate-600">Nothing scheduled.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {selectedEvents.map((e) => (
                    <li key={e.id}>
                      <EventRow
                        event={e}
                        category={categoryMap.get(e.category)}
                        rsvp={rsvpsQuery.data?.get(e.id)}
                        showHiddenFlag={isBrother(member)}
                        onOpen={() => setOpenEvent(e)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <WeekGrid days={days} todayKey={todayKey} byDay={byDay} categories={categoryMap} onOpen={setOpenEvent} />
        )}
      </main>

      {manageable.length > 0 && (
        <button
          type="button"
          onClick={() => setFormMode({ kind: 'create', date: selectedKey })}
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex min-h-14 items-center gap-2 rounded-full bg-brand-700 px-5 font-bold text-white shadow-lg hover:bg-brand-800"
        >
          <Plus aria-hidden className="size-6" /> New event
        </button>
      )}

      <EventDetail
        event={liveOpenEvent}
        category={liveOpenEvent ? categoryMap.get(liveOpenEvent.category) : undefined}
        myRsvp={liveOpenEvent ? rsvpsQuery.data?.get(liveOpenEvent.id) : undefined}
        onClose={() => setOpenEvent(null)}
        onEdit={(e) => {
          setOpenEvent(null)
          setFormMode({ kind: 'edit', event: e })
        }}
      />
      <EventForm mode={formMode} categories={categories} manageable={manageable} onClose={() => setFormMode(null)} />
    </div>
  )
}
