// Shapes shared by the parsers, the Edge Functions and the app. No imports: runs in Deno and Vite.

export type ScheduleStep = 'classes' | 'exams' | 'obligations'

/** One weekly meeting. weekday: 0 = Sunday ... 6 = Saturday. Times are 'HH:MM' Gainesville time. */
export interface ScheduleBlock {
  weekday: number
  start: string
  end: string
  label: string
  location: string | null
  category: 'school' | 'personal'
}

/** A dated item. date is 'YYYY-MM-DD'; start/end are 'HH:MM' or null (all day / unknown). */
export interface ScheduleItem {
  kind: 'exam' | 'deadline' | 'obligation'
  title: string
  course: string | null
  date: string
  start: string | null
  end: string | null
  all_day: boolean
  category?: 'school' | 'personal'
  source: 'manual' | 'ai' | 'canvas' | 'ics'
  external_uid?: string | null
  dismissed?: boolean
}

export interface ParsedSchedule {
  blocks: ScheduleBlock[]
  items: ScheduleItem[]
  notes: string[]
}

export interface SemesterRange {
  name: string
  starts_on: string
  ends_on: string
}

const TIME_RE = /^(\d{1,2}):?(\d{2})?(?::\d{2})?\s*([ap])?\.?m?\.?$/i

/** '9:35', '09:35:00', '9:35 PM', '9pm' -> 'HH:MM' (24h), or null. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(TIME_RE)
  if (!m) return null
  let hour = Number(m[1])
  const minute = Number(m[2] ?? '0')
  const ampm = m[3]?.toLowerCase()
  if (ampm === 'p' && hour < 12) hour += 12
  if (ampm === 'a' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function addDaysToDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Problems the member must fix before a block can be saved, or null. */
export function blockProblem(b: ScheduleBlock): string | null {
  if (!Number.isInteger(b.weekday) || b.weekday < 0 || b.weekday > 6) return 'Pick a day.'
  if (!normalizeTime(b.start) || !normalizeTime(b.end)) return 'Add a start and end time.'
  if (normalizeTime(b.end)! <= normalizeTime(b.start)!) return 'The end time must be after the start time.'
  if (!b.label.trim()) return 'Add a name.'
  return null
}

export function itemProblem(i: ScheduleItem): string | null {
  if (!i.title.trim()) return 'Add a name.'
  if (!isValidDate(i.date)) return 'Pick a date.'
  if (i.start && !normalizeTime(i.start)) return 'Fix the start time.'
  if (i.end && !normalizeTime(i.end)) return 'Fix the end time.'
  return null
}
