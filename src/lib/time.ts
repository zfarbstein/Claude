import { TZDate } from '@date-fns/tz'
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

/** Every date in the app is shown in chapter time, regardless of the phone's time zone. */
export const CHAPTER_TZ = 'America/New_York'

export interface TimedRange {
  starts_at: string
  ends_at: string
  all_day: boolean
}

export const inChapterTz = (value: Date | string | number): TZDate =>
  new TZDate(new Date(value).getTime(), CHAPTER_TZ)

export const nowInChapterTz = (): TZDate => TZDate.tz(CHAPTER_TZ)

/** 'yyyy-MM-dd' in chapter time. */
export const dayKey = (value: Date | string | number): string => format(inChapterTz(value), 'yyyy-MM-dd')

/** Midnight (chapter time) of a 'yyyy-MM-dd' key. */
export function fromDayKey(key: string): TZDate {
  const [y, m, d] = key.split('-').map(Number)
  return new TZDate(y, m - 1, d, CHAPTER_TZ)
}

/** Full weeks (Sun-Sat) covering the month that contains `cursor`. */
export function monthGridDays(cursor: Date): TZDate[] {
  const c = inChapterTz(cursor)
  return eachDayOfInterval({ start: startOfWeek(startOfMonth(c)), end: endOfWeek(endOfMonth(c)) }).map((d) =>
    inChapterTz(d),
  )
}

export function weekDays(cursor: Date): TZDate[] {
  const start = startOfWeek(inChapterTz(cursor))
  return Array.from({ length: 7 }, (_, i) => inChapterTz(addDays(start, i)))
}

/** [start, end) instants covering a list of consecutive days. */
export function rangeOfDays(days: Date[]): { start: Date; end: Date } {
  return { start: startOfDay(days[0]), end: addDays(startOfDay(days[days.length - 1]), 1) }
}

/** Groups events by every chapter-time day they overlap (multi-day events appear on each day). */
export function eventsByDay<T extends TimedRange>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const e of events) {
    const start = inChapterTz(e.starts_at)
    const end = new Date(e.ends_at).getTime()
    let day = startOfDay(start)
    for (let i = 0; i < 15 && day.getTime() < end; i++) {
      const key = format(day, 'yyyy-MM-dd')
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
      day = addDays(day, 1)
    }
  }
  for (const list of map.values()) list.sort(compareEvents)
  return map
}

/** All-day first, then by start time, then longest first. */
export function compareEvents(a: TimedRange, b: TimedRange): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
  const byStart = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  if (byStart !== 0) return byStart
  return new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime()
}

const DAY_MS = 24 * 3600_000

/** All-day or 24h+ events go in the week view's all-day row instead of the time grid. */
export function isMultiDayOrAllDay(e: TimedRange): boolean {
  return e.all_day || new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() >= DAY_MS
}

const timeFmt = (d: Date) => (d.getMinutes() === 0 ? format(d, 'h a') : format(d, 'h:mm a'))

/** Compact time for calendar chips: "7p", "7:30p", "11a". */
export function shortTime(value: Date | string): string {
  const d = inChapterTz(value)
  return format(d, d.getMinutes() === 0 ? 'h' : 'h:mm') + (d.getHours() < 12 ? 'a' : 'p')
}

/** "7–8:30p", "11a–1p" or "" for all-day events. */
export function shortRange(e: TimedRange): string {
  if (e.all_day) return ''
  const start = shortTime(e.starts_at)
  const end = shortTime(e.ends_at)
  return start.slice(-1) === end.slice(-1) ? `${start.slice(0, -1)}–${end}` : `${start}–${end}`
}

/** e.g. "7 – 8:30 PM", "9 PM – 1 AM", "All day", "Fri 8 PM – Sun 2 PM" */
export function formatTimeRange(e: TimedRange): string {
  const start = inChapterTz(e.starts_at)
  const end = inChapterTz(e.ends_at)
  if (e.all_day) {
    const lastDay = addDays(end, -1)
    return isSameDay(start, lastDay) ? 'All day' : `${format(start, 'EEE MMM d')} – ${format(lastDay, 'EEE MMM d')}`
  }
  const spanMs = end.getTime() - start.getTime()
  // "9 PM – 1 AM" reads fine without dates; anything longer that crosses midnight needs them.
  const overnight = differenceInCalendarDays(end, start) === 1 && spanMs < 12 * 3600_000
  if (!isSameDay(start, end) && !overnight) {
    return `${format(start, 'EEE MMM d')}, ${timeFmt(start)} – ${format(end, 'EEE MMM d')}, ${timeFmt(end)}`
  }
  const samePeriod = format(start, 'a') === format(end, 'a')
  const startText = samePeriod ? timeFmt(start).replace(/ [AP]M$/, '') : timeFmt(start)
  return `${startText} – ${timeFmt(end)}`
}

/** e.g. "Sunday, October 4" */
export const formatLongDay = (value: Date | string) => format(inChapterTz(value), 'EEEE, MMMM d')

/** Local date/time strings for the event form. */
export function toFormParts(e: TimedRange): { start_date: string; end_date: string; start_time: string; end_time: string } {
  const start = inChapterTz(e.starts_at)
  const end = inChapterTz(e.ends_at)
  const lastDay = e.all_day ? addDays(end, -1) : end
  const overnightSameEvent =
    !e.all_day && !isSameDay(start, end) && end.getTime() - start.getTime() < DAY_MS
  return {
    start_date: format(start, 'yyyy-MM-dd'),
    // Overnight events ("9 PM - 1 AM") are entered as a single date; the server rolls the end over.
    end_date: format(overnightSameEvent ? start : lastDay, 'yyyy-MM-dd'),
    start_time: format(start, 'HH:mm'),
    end_time: format(end, 'HH:mm'),
  }
}
