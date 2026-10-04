// Reads .ics calendars (Canvas feeds, Google Calendar exports) into schedule rows.
// No imports beyond shared types: runs in Deno and Vite.
import { addDaysToDate, type ParsedSchedule, type ScheduleBlock, type ScheduleItem, type ScheduleStep, type SemesterRange } from './schedule-types.ts'

export const CHAPTER_TZ = 'America/New_York'

const WINDOWS_ZONES: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'UTC': 'UTC',
}

export interface LocalTime {
  date: string
  time: string | null
}

export interface IcsEvent {
  uid: string
  summary: string
  location: string
  start: LocalTime
  end: LocalTime | null
  rrule: Record<string, string> | null
  cancelled: boolean
  recurrenceId: boolean
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

function parseProp(line: string): Prop | null {
  let inQuotes = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes
    else if (line[i] === ':' && !inQuotes) {
      colon = i
      break
    }
  }
  if (colon < 1) return null
  const [name, ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) }
}

const unescapeText = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()
const pad = (n: number) => String(n).padStart(2, '0')

function zoneParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

function offsetMs(instant: number, timeZone: string) {
  const p = zoneParts(instant, timeZone)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - instant
}

/** Wall-clock time in a zone -> UTC instant (handles DST). */
export function zonedToInstant(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let instant = guess - offsetMs(guess, timeZone)
  const second = offsetMs(instant, timeZone)
  if (guess - second !== instant) instant = guess - second
  return instant
}

export function instantToChapter(instant: number): LocalTime {
  const p = zoneParts(instant, CHAPTER_TZ)
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` }
}

function knownZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** An iCalendar DATE or DATE-TIME converted to Gainesville local date/time. Canvas sends UTC ("Z"). */
export function toChapterTime(value: string, params: Record<string, string>): LocalTime | null {
  const v = value.trim()
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? v.match(/^(\d{4})(\d{2})(\d{2})/)
    return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: null } : null
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (z) return instantToChapter(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)))
  const tzid = params.TZID ? (WINDOWS_ZONES[params.TZID] ?? params.TZID.replace(/^\//, '')) : CHAPTER_TZ
  if (tzid === CHAPTER_TZ || !knownZone(tzid)) return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
  return instantToChapter(zonedToInstant(+y, +mo, +d, +h, +mi, tzid))
}

function addDuration(start: LocalTime, duration: string): LocalTime | null {
  const m = duration.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return null
  const minutes = (+(m[1] ?? 0) * 7 + +(m[2] ?? 0)) * 1440 + +(m[3] ?? 0) * 60 + +(m[4] ?? 0)
  if (!start.time) return { date: addDaysToDate(start.date, Math.max(1, Math.round(minutes / 1440))), time: null }
  const [h, mi] = start.time.split(':').map(Number)
  const total = h * 60 + mi + minutes
  return { date: addDaysToDate(start.date, Math.floor(total / 1440)), time: `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}` }
}

/** Parses every VEVENT. Skips malformed events instead of failing the whole file. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events: IcsEvent[] = []
  let current: Prop[] | null = null
  let depth = 0
  for (const line of lines) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      current = []
      depth = 0
      continue
    }
    if (!current) continue
    if (upper.startsWith('BEGIN:')) depth++
    else if (upper.startsWith('END:') && upper !== 'END:VEVENT') depth--
    else if (upper === 'END:VEVENT') {
      const get = (name: string) => current!.find((p) => p.name === name)
      const dtstart = get('DTSTART')
      const start = dtstart ? toChapterTime(dtstart.value, dtstart.params) : null
      if (start) {
        const dtend = get('DTEND')
        const duration = get('DURATION')
        const end = dtend ? toChapterTime(dtend.value, dtend.params) : duration ? addDuration(start, duration.value) : null
        const rrule = get('RRULE')
        events.push({
          uid: get('UID')?.value.trim() || `${start.date}-${get('SUMMARY')?.value ?? ''}`,
          summary: unescapeText(get('SUMMARY')?.value ?? '') || 'Untitled',
          location: unescapeText(get('LOCATION')?.value ?? ''),
          start,
          end,
          rrule: rrule ? Object.fromEntries(rrule.value.split(';').map((kv) => kv.split('=') as [string, string]).map(([k, v]) => [k.toUpperCase(), v ?? ''])) : null,
          cancelled: (get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED',
          recurrenceId: !!get('RECURRENCE-ID'),
        })
      }
      current = null
      continue
    }
    if (depth === 0) {
      const prop = parseProp(line)
      if (prop) current.push(prop)
    }
  }
  return events
}

const EXAM_WORDS = /\b(exams?|midterms?|finals?|tests?|practicals?)\b/i
const NOT_EXAM_WORDS = /\b(project|paper|essay|report|presentation|proposal|draft|reflection|portfolio|homework|assignment|quiz|practice|review|study|corrections?|prep|registration|sign[- ]?up|grades?|survey)\b/i

/** Exam keywords (Exam, Midterm, Final, Test, Practical) minus look-alikes like "Final Project". */
export function isExamTitle(title: string): boolean {
  return EXAM_WORDS.test(title) && !NOT_EXAM_WORDS.test(title)
}

const COURSE_RE = /\b([A-Z]{3})\s?(\d{4}[A-Z]?)\b/

/** Canvas titles look like "Exam 2 [COP3502-Fall2026]". */
export function splitCourse(summary: string): { title: string; course: string | null } {
  const bracket = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/)
  const title = (bracket ? bracket[1] : summary).trim() || summary.trim()
  const code = (bracket ? bracket[2] : summary).match(COURSE_RE)
  return { title, course: code ? `${code[1]}${code[2]}` : bracket ? bracket[2].slice(0, 60) : null }
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function inRange(e: IcsEvent, range: SemesterRange) {
  const last = addDaysToDate(range.ends_on, 21)
  if (e.rrule) {
    const until = e.rrule.UNTIL ? toChapterTime(e.rrule.UNTIL, {})?.date : null
    return e.start.date <= last && (!until || until >= range.starts_on)
  }
  return e.start.date >= addDaysToDate(range.starts_on, -7) && e.start.date <= last
}

function toItem(e: IcsEvent, kind: ScheduleItem['kind'], source: ScheduleItem['source']): ScheduleItem {
  const { title, course } = splitCourse(e.summary)
  const sameMoment = !e.end || (e.end.date === e.start.date && e.end.time === e.start.time)
  const end = !sameMoment && e.end && e.end.date === e.start.date && e.start.time ? e.end.time : null
  return {
    kind,
    title: title.slice(0, 160),
    course,
    date: e.start.date,
    start: e.start.time,
    end,
    all_day: !e.start.time,
    source,
    external_uid: e.uid.slice(0, 300),
    ...(kind === 'obligation' ? { category: 'personal' as const } : {}),
  }
}

/** Canvas feed: exam-keyword items block availability; everything else is a non-blocking deadline. */
export function scheduleFromCanvas(events: IcsEvent[], range: SemesterRange): ParsedSchedule {
  const items = events
    .filter((e) => !e.cancelled && !e.rrule && inRange(e, range))
    .map((e) => toItem(e, isExamTitle(splitCourse(e.summary).title) ? 'exam' : 'deadline', 'canvas'))
    .sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')))
  const exams = items.filter((i) => i.kind === 'exam').length
  return {
    blocks: [],
    items,
    notes: [`Found ${exams} exam${exams === 1 ? '' : 's'} and ${items.length - exams} other item${items.length - exams === 1 ? '' : 's'} this semester. Only exams block your availability.`],
  }
}

/** A calendar file or link (e.g. Google Calendar export) for the exams or obligations step. */
export function scheduleFromIcs(events: IcsEvent[], step: ScheduleStep, range: SemesterRange): ParsedSchedule {
  const usable = events.filter((e) => !e.cancelled && inRange(e, range))
  const blocks: ScheduleBlock[] = []
  const items: ScheduleItem[] = []
  for (const e of usable) {
    if (step === 'exams') {
      if (e.rrule) continue
      items.push(toItem(e, isExamTitle(e.summary) ? 'exam' : 'deadline', 'ics'))
      continue
    }
    const weekly = e.rrule && (e.rrule.FREQ === 'WEEKLY' || e.rrule.FREQ === 'DAILY')
    if (weekly && e.start.time && e.end?.time && e.end.time > e.start.time && !e.recurrenceId) {
      const days = e.rrule!.BYDAY
        ? e.rrule!.BYDAY.split(',').map((d) => BYDAY[d.slice(-2).toUpperCase()]).filter((d) => d !== undefined)
        : e.rrule!.FREQ === 'DAILY'
          ? [0, 1, 2, 3, 4, 5, 6]
          : [new Date(`${e.start.date}T12:00:00Z`).getUTCDay()]
      for (const weekday of [...new Set(days)]) {
        blocks.push({ weekday, start: e.start.time, end: e.end.time, label: e.summary.slice(0, 120), location: e.location.slice(0, 120) || null, category: 'personal' })
      }
    } else if (!e.rrule) {
      items.push(toItem(e, 'obligation', 'ics'))
    }
  }
  blocks.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
  items.sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')))
  const notes = step === 'exams' && items.length === 0 ? ['No exams or deadlines this semester were found in that calendar.'] : []
  return { blocks, items, notes }
}
