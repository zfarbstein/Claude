import { addMonths, addWeeks, format, isSameMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useMemberNights, useNightSummary } from '../availability/api'
import { clockRange, heatStyle, statusStyle, STATUS_LABELS } from '../availability/heat'
import { NightPanel } from '../availability/NightPanel'
import { fetchEvent, useCategories, useEvents, useMyRsvps } from '../calendar/api'
import { CategoryFilter } from '../calendar/CategoryFilter'
import { EventDetail } from '../calendar/EventDetail'
import { EventForm, type EventFormMode } from '../calendar/EventForm'
import { EventRow } from '../calendar/EventRow'
import { MonthGrid, type NightCell } from '../calendar/MonthGrid'
import { WeekGrid } from '../calendar/WeekGrid'
import { HeaderActions } from '../components/HeaderActions'
import { useMyCalendarItems, useSubmissionCounts } from '../schedule/api'
import { Alert, Button } from '../components/ui'
import { cx } from '../lib/cx'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { canManageEvents, canSeeChapter, isAdmin, isBrother } from '../lib/permissions'
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
import { useSettings } from '../lib/useSettings'
import { useStoredState } from '../lib/useStoredState'

type View = 'month' | 'week' | 'nights'
const VIEW_LABELS: Record<View, string> = { month: 'Month', week: 'Week', nights: 'Availability' }

export default function CalendarPage() {
  const { member } = useAuth()
  const [view, setView] = useStoredState<View>('calendar.view', 'month')
  const [params, setParams] = useSearchParams()
  const [hidden, setHidden] = useStoredState<string[]>('calendar.hiddenCategories', [])
  const [cursor, setCursor] = useState<Date>(() => nowInChapterTz())
  const [selectedKey, setSelectedKey] = useState(() => dayKey(Date.now()))
  const [openEvent, setOpenEvent] = useState<DisplayEvent | null>(null)
  const [formMode, setFormMode] = useState<EventFormMode | null>(null)
  const touchX = useRef<number | null>(null)

  const now = useNow()
  const todayKey = dayKey(now)
  const days = view === 'week' ? weekDays(cursor) : monthGridDays(cursor)
  const { start, end } = rangeOfDays(days)
  const firstKey = dayKey(days[0])
  const lastKey = dayKey(days[days.length - 1])
  const chapterView = canSeeChapter(member)
  const nightsView = view === 'nights'

  const categoriesQuery = useCategories()
  const categories = categoriesQuery.data ?? DEFAULT_CATEGORIES
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])
  const eventsQuery = useEvents(start, end)
  const rsvpsQuery = useMyRsvps(member?.id)
  const personalQuery = useMyCalendarItems(start, end)
  const settings = useSettings()
  const summary = useNightSummary(firstKey, lastKey, nightsView && chapterView)
  const myNights = useMemberNights(member?.id, firstKey, lastKey, nightsView)
  const counts = useSubmissionCounts()
  const nightWindow = { start: settings.data?.night_start.slice(0, 5) ?? '19:00', end: settings.data?.night_end.slice(0, 5) ?? '23:00' }

  // Links from notifications: /?event=<id> opens that event, /?view=availability opens the heatmap.
  useEffect(() => {
    const eventId = params.get('event')
    const wanted = params.get('view')
    if (!eventId && !wanted) return
    setParams({}, { replace: true })
    if (wanted === 'availability') setView('nights')
    if (eventId) {
      void fetchEvent(eventId).then((e) => {
        if (!e) return
        setCursor(inChapterTz(e.starts_at))
        setSelectedKey(dayKey(e.starts_at))
        if (view === 'week') setView('month')
        setOpenEvent(e)
      })
    }
  }, [params, setParams, setView, view])

  const nightCells = useMemo(() => {
    if (!nightsView) return undefined
    const cells = new Map<string, NightCell>()
    for (const day of days) {
      const key = dayKey(day)
      const mine = myNights.data?.get(key)
      const flags = [...(mine?.required_event_id ? ['Required'] : []), ...(chapterView && mine?.marked ? ['You: out'] : [])]
      if (chapterView) {
        const n = summary.data?.get(key)
        if (!n) continue
        cells.set(key, {
          style: heatStyle(n),
          primary: `${n.free}/${n.total}`,
          secondary: 'free',
          aria: `${n.free} of ${n.total} free, ${n.busy} busy, ${n.unknown} without a schedule`,
          flags,
        })
      } else if (mine) {
        cells.set(key, { style: statusStyle(mine.status), primary: STATUS_LABELS[mine.status], aria: `you're ${STATUS_LABELS[mine.status].toLowerCase()}`, flags })
      }
    }
    return cells
  }, [nightsView, days, myNights.data, summary.data, chapterView])

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
    const next = view === 'week' ? addWeeks(cursor, delta) : addMonths(cursor, delta)
    setCursor(next)
    if (view !== 'week') {
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
    view !== 'week'
      ? format(inChapterTz(cursor), 'MMMM yyyy')
      : `${format(days[0], 'MMM d')} – ${format(days[6], isSameMonth(days[0], days[6]) ? 'd' : 'MMM d')}, ${format(days[6], 'yyyy')}`
  const navNoun = view === 'week' ? 'week' : 'month'

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 pt-safe backdrop-blur">
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex min-h-14 items-center gap-1">
            <h1 className="min-w-0 flex-1 truncate text-lg font-bold" aria-live="polite">
              {title}
            </h1>
            <button type="button" aria-label={`Previous ${navNoun}`} onClick={() => move(-1)} className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
              <ChevronLeft aria-hidden className="size-6" />
            </button>
            <button type="button" aria-label={`Next ${navNoun}`} onClick={() => move(1)} className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
              <ChevronRight aria-hidden className="size-6" />
            </button>
            <HeaderActions />
          </div>
          <div className="flex items-center justify-between gap-2 pb-2">
            <Button variant="secondary" className="min-h-10 px-3 text-sm" onClick={goToday}>
              Today
            </Button>
            <div role="group" aria-label="View" className="flex rounded-xl bg-slate-100 p-1">
              {(['month', 'week', 'nights'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v)
                    setCursor(fromDayKey(selectedKey))
                  }}
                  className={cx('min-h-10 rounded-lg px-2.5 text-sm font-bold sm:px-4', view === v ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
          {!nightsView && <CategoryFilter categories={categories} hidden={hidden} onChange={setHidden} />}
        </div>
      </header>

      <main
        className="mx-auto max-w-3xl pt-2"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null || view === 'week') return
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

        {nightsView && (
          <p className="px-4 pb-2 text-sm text-slate-700">
            {chapterView ? (
              <>
                Members free each night, {clockRange(nightWindow.start, nightWindow.end)}.{' '}
                {counts.data && (
                  <strong className="tabular-nums" data-testid="submitted-count">
                    {counts.data.submitted}/{counts.data.total} submitted
                  </strong>
                )}
              </>
            ) : (
              'Your nights. Tap one to mark it unavailable.'
            )}
          </p>
        )}
        {view !== 'week' ? (
          <>
            <MonthGrid
              days={days}
              cursor={cursor}
              todayKey={todayKey}
              selectedKey={selectedKey}
              byDay={byDay}
              categories={categoryMap}
              onSelect={setSelectedKey}
              nights={nightCells}
            />
            {nightsView && (
              <>
                <Legend chapter={chapterView} />
                <NightPanel
                  night={selectedKey}
                  window={nightWindow}
                  summary={summary.data?.get(selectedKey)}
                  mine={myNights.data?.get(selectedKey)}
                  past={selectedKey < todayKey}
                  showChapter={chapterView}
                  showNames={isAdmin(member)}
                />
              </>
            )}
            <section aria-labelledby="day-title" className="px-4 py-4">
              <h2 id="day-title" className="text-lg font-bold">
                {nightsView ? 'Events' : formatLongDay(fromDayKey(selectedKey))}
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

      {manageable.length > 0 && !nightsView && (
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

function Legend({ chapter }: { chapter: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-xs font-semibold text-slate-700" aria-hidden>
      {chapter ? (
        <span className="flex items-center gap-2">
          Few free
          <span className="h-3 w-24 rounded-full" style={{ background: 'linear-gradient(to right, hsl(0 70% 80%), hsl(65 70% 80%), hsl(130 70% 80%))' }} />
          Most free
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded" style={{ backgroundColor: 'hsl(130 70% 80%)' }} /> Free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded" style={{ backgroundColor: 'hsl(0 70% 80%)' }} /> Busy
          </span>
        </>
      )}
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-slate-200" /> {chapter ? 'Nobody known' : 'No schedule'}
      </span>
    </div>
  )
}
