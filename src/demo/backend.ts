// In-browser stand-in for Supabase, used only by the demo build (npm run build:demo).
//
// It answers the same HTTP calls supabase-js makes (PostgREST under /rest/v1, Auth under
// /auth/v1) from data kept in this browser, and applies the same permission rules as the
// RLS policies in supabase/migrations. The real rules are tested against Postgres in
// supabase/tests; keep this file in step with them when the schema changes.
import { TZDate } from '@date-fns/tz'
import seedSql from '../../supabase/seed.sql?raw'
import { parseIcs, scheduleFromCanvas, scheduleFromIcs } from '../../supabase/functions/_shared/ical'
import { buildSchedulePrompt, normalizeAiSchedule } from '../../supabase/functions/_shared/schedule-ai'
import type { ParsedSchedule, ScheduleStep } from '../../supabase/functions/_shared/schedule-types'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { CHAPTER_TZ, dayKey } from '../lib/time'
import type { CalendarEvent, Category, DatedItemRow, Member, Semester, Submission, WeeklyBlockRow } from '../lib/types'

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> }
  }
}

export const DEMO_URL = 'https://demo.chapter-calendar.invalid'
export const DEMO_ANON_KEY = 'demo-anon-key'
export const DEMO_PASSWORD = 'Password123'
const STORAGE_KEY = 'chapter-calendar-demo-v2'
const HOUR = 3600_000

type Row = Record<string, unknown>

interface AuthUser {
  id: string
  email: string
  password_hash: string
  email_confirmed_at: string | null
  user_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  confirmation: { hash: string; sent_at: number } | null
  recovery: { hash: string; sent_at: number } | null
}

export interface DemoEmail {
  id: string
  to: string
  subject: string
  heading: string
  body: string
  action: string
  path: string
  sent_at: string
  read: boolean
}

interface Series {
  id: string
  freq: string
  interval: number
  by_weekday: number[] | null
  until_date: string | null
  occurrence_count: number | null
  created_by: string | null
  created_at: string
}

interface State {
  users: AuthUser[]
  refresh: Record<string, string>
  members: Member[]
  categories: Category[]
  settings: { id: boolean; timezone: string; night_start: string; night_end: string; secretary_email: string | null; updated_at: string }
  event_series: Series[]
  events: CalendarEvent[]
  rsvps: { event_id: string; member_id: string; status: string; updated_at: string }[]
  feed_tokens: { member_id: string; token: string; created_at: string }[]
  outbox: DemoEmail[]
  semesters: Semester[]
  schedule_submissions: Submission[]
  weekly_blocks: WeeklyBlockRow[]
  dated_items: DatedItemRow[]
  schedule_uploads: { id: string; member_id: string; semester_id: string; step: string; kind: string; text_content: string | null; storage_paths: string[]; source_url: string | null; parsed: unknown; created_at: string }[]
}

interface SeedPerson {
  email: string
  name: string
  role: Member['role']
  type: Member['member_type']
  class: string | null
  status: Member['status']
}

export const DEMO_PEOPLE: SeedPerson[] = JSON.parse(
  seedSql.match(/v_people jsonb := '(\[[\s\S]*?\])';/)![1].replaceAll("''", "'"),
)

class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const denied = (table: string) => new ApiError(403, '42501', `new row violates row-level security policy for table "${table}"`)
const invalid = (message: string) => new ApiError(400, '22023', message)

// ---------------------------------------------------------------------------
// State, persistence, change notifications
// ---------------------------------------------------------------------------
let state: State
const listeners = new Set<() => void>()
let version = 0

export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export const getVersion = () => version
export const getOutbox = () => state.outbox

function changed() {
  version++
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // private mode or blocked storage: the demo still works for this visit
  }
  listeners.forEach((l) => l())
}

const nowIso = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

async function hashPassword(password: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`demo:${password}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Permission helpers (mirror public.is_* and calendar.can_manage_category)
// ---------------------------------------------------------------------------
interface Ctx {
  uid: string | null
  service?: boolean
}

const me = (ctx: Ctx) => state.members.find((m) => m.id === ctx.uid)
const isMember = (ctx: Ctx) => {
  const m = me(ctx)
  return !!m && m.status === 'approved' && m.active
}
const isBrother = (ctx: Ctx) => isMember(ctx) && me(ctx)!.member_type === 'brother'
const isAdmin = (ctx: Ctx) => isMember(ctx) && me(ctx)!.role === 'admin'
const eventVisible = (ctx: Ctx, e: Row) => isMember(ctx) && (!e.hidden_from_associates || isBrother(ctx))
const ownOrAdmin = (ctx: Ctx, r: Row) => r.member_id === ctx.uid || isAdmin(ctx)

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
interface TableDef {
  rows: () => Row[]
  key: string[]
  select: (ctx: Ctx, row: Row) => boolean
  insert?: (ctx: Ctx, row: Row) => boolean
  update?: { using: (ctx: Ctx, row: Row) => boolean; check: (ctx: Ctx, row: Row) => boolean; columns?: string[] }
  delete?: (ctx: Ctx, row: Row) => boolean
  defaults?: (ctx: Ctx) => Row
  normalize?: (row: Row) => void
}

const rsvpAllowed = (ctx: Ctx, row: Row) => {
  const e = state.events.find((x) => x.id === row.event_id)
  return (
    row.member_id === ctx.uid &&
    isMember(ctx) &&
    !!e &&
    eventVisible(ctx, e as unknown as Row) &&
    !e.required &&
    e.rsvp_enabled &&
    Date.parse(e.ends_at) > Date.now()
  )
}

function normalizeEvent(row: Row) {
  row.title = String(row.title ?? '').trim()
  row.location = typeof row.location === 'string' && row.location.trim() ? row.location.trim() : null
  row.description = typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null
  if (row.category === 'required') row.required = true
  if (row.required) row.rsvp_enabled = false
  const title = row.title as string
  if (title.length < 1 || title.length > 120) throw new ApiError(400, '23514', 'Add a title (up to 120 characters).')
  const span = Date.parse(row.ends_at as string) - Date.parse(row.starts_at as string)
  if (!(span > 0)) throw new ApiError(400, '23514', 'The event must end after it starts.')
  if (span > 14 * 24 * HOUR) throw new ApiError(400, '23514', 'Events can last at most 14 days.')
}

const TABLES: Record<string, TableDef> = {
  'public.members': {
    rows: () => state.members as unknown as Row[],
    key: ['id'],
    select: (ctx, r) => r.id === ctx.uid || isAdmin(ctx) || (isBrother(ctx) && r.status === 'approved'),
    update: { using: (ctx, r) => r.id === ctx.uid, check: (ctx, r) => r.id === ctx.uid, columns: ['name'] },
  },
  'calendar.categories': {
    rows: () => state.categories as unknown as Row[],
    key: ['key'],
    select: () => true,
    update: { using: isAdmin, check: isAdmin },
  },
  'calendar.settings': {
    rows: () => [state.settings as unknown as Row],
    key: ['id'],
    select: isMember,
    update: { using: isAdmin, check: isAdmin },
  },
  'calendar.event_series': {
    rows: () => state.event_series as unknown as Row[],
    key: ['id'],
    select: isMember,
    insert: isAdmin,
    delete: isAdmin,
  },
  'calendar.events': {
    rows: () => state.events as unknown as Row[],
    key: ['id'],
    select: eventVisible,
    insert: isAdmin,
    update: { using: isAdmin, check: isAdmin },
    delete: isAdmin,
    defaults: (ctx) => ({
      id: uuid(),
      series_id: null,
      all_day: false,
      location: null,
      description: null,
      required: false,
      hidden_from_associates: false,
      rsvp_enabled: true,
      created_by: ctx.uid,
      created_at: nowIso(),
      updated_at: nowIso(),
    }),
    normalize: normalizeEvent,
  },
  'calendar.rsvps': {
    rows: () => state.rsvps as unknown as Row[],
    key: ['event_id', 'member_id'],
    select: (ctx, r) => r.member_id === ctx.uid || isBrother(ctx),
    insert: rsvpAllowed,
    update: { using: (ctx, r) => r.member_id === ctx.uid, check: rsvpAllowed },
    delete: (ctx, r) => r.member_id === ctx.uid,
    defaults: (ctx) => ({ member_id: ctx.uid, updated_at: nowIso() }),
    normalize: (r) => {
      if (!['going', 'maybe', 'not_going'].includes(r.status as string)) throw new ApiError(400, '23514', 'Invalid RSVP status.')
    },
  },
  'calendar.feed_tokens': {
    rows: () => state.feed_tokens as unknown as Row[],
    key: ['member_id'],
    select: () => false,
  },
  'calendar.semesters': { rows: () => state.semesters as unknown as Row[], key: ['id'], select: isMember },
  'calendar.schedule_submissions': { rows: () => state.schedule_submissions as unknown as Row[], key: ['member_id', 'semester_id'], select: ownOrAdmin },
  'calendar.weekly_blocks': { rows: () => state.weekly_blocks as unknown as Row[], key: ['id'], select: ownOrAdmin },
  'calendar.dated_items': { rows: () => state.dated_items as unknown as Row[], key: ['id'], select: ownOrAdmin },
  'calendar.schedule_uploads': { rows: () => state.schedule_uploads as unknown as Row[], key: ['id'], select: ownOrAdmin },
}

function tableFor(schema: string, name: string, ctx: Ctx): TableDef {
  const def = TABLES[`${schema}.${name}`]
  if (!def) throw new ApiError(404, '42P01', `relation "${schema}.${name}" does not exist`)
  if (!ctx.uid && !ctx.service) throw new ApiError(401, '42501', `permission denied for table ${name}`)
  if (name === 'feed_tokens' && !ctx.service) throw new ApiError(403, '42501', 'permission denied for table feed_tokens')
  return def
}

const sameKey = (def: TableDef, a: Row, b: Row) => def.key.every((k) => a[k] === b[k])

function insertRows(ctx: Ctx, schema: string, name: string, input: Row[], upsert: boolean): Row[] {
  const def = tableFor(schema, name, ctx)
  const rows = def.rows()
  const out: Row[] = []
  const pending: (() => void)[] = []
  for (const raw of input) {
    const row: Row = { ...def.defaults?.(ctx), ...raw }
    def.normalize?.(row)
    const existing = rows.find((r) => sameKey(def, r, row))
    if (existing) {
      if (!upsert) throw new ApiError(409, '23505', `duplicate key value violates unique constraint "${name}_pkey"`)
      if (!ctx.service && (!def.update || !def.update.using(ctx, existing) || !def.update.check(ctx, { ...existing, ...raw })))
        throw denied(name)
      const next = { ...existing, ...raw, updated_at: nowIso() }
      def.normalize?.(next)
      pending.push(() => Object.assign(existing, next))
      out.push(next)
    } else {
      if (!ctx.service && (!def.insert || !def.insert(ctx, row))) throw denied(name)
      pending.push(() => rows.push(row))
      out.push(row)
    }
  }
  pending.forEach((apply) => apply())
  return out
}

// ---------------------------------------------------------------------------
// PostgREST query parsing (the subset supabase-js produces for this app)
// ---------------------------------------------------------------------------
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function compare(a: unknown, b: string): number {
  if (typeof a === 'number') return a - Number(b)
  const sa = String(a)
  const da = Date.parse(sa)
  const db = Date.parse(b)
  if (/^\d{4}-\d{2}-\d{2}/.test(sa) && !Number.isNaN(da) && !Number.isNaN(db)) return da - db
  return sa < b ? -1 : sa > b ? 1 : 0
}

function likeToRegex(pattern: string, flags: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${escaped}$`, flags)
}

function parseList(value: string): string[] {
  const inner = value.replace(/^\(/, '').replace(/\)$/, '')
  return inner.match(/("([^"]|\\")*"|[^,]+)/g)?.map((v) => v.replace(/^"|"$/g, '')) ?? []
}

function filterFor(column: string, raw: string): (row: Row) => boolean {
  const negate = raw.startsWith('not.')
  const expr = negate ? raw.slice(4) : raw
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot)
  const value = expr.slice(dot + 1)
  let test: (v: unknown) => boolean
  switch (op) {
    case 'eq':
      test = (v) => v !== null && v !== undefined && String(v) === value
      break
    case 'neq':
      test = (v) => v !== null && v !== undefined && String(v) !== value
      break
    case 'lt':
      test = (v) => v !== null && v !== undefined && compare(v, value) < 0
      break
    case 'lte':
      test = (v) => v !== null && v !== undefined && compare(v, value) <= 0
      break
    case 'gt':
      test = (v) => v !== null && v !== undefined && compare(v, value) > 0
      break
    case 'gte':
      test = (v) => v !== null && v !== undefined && compare(v, value) >= 0
      break
    case 'like':
      test = (v) => typeof v === 'string' && likeToRegex(value, '').test(v)
      break
    case 'ilike':
      test = (v) => typeof v === 'string' && likeToRegex(value, 'i').test(v)
      break
    case 'in': {
      const list = parseList(value)
      test = (v) => v !== null && v !== undefined && list.includes(String(v))
      break
    }
    case 'is':
      test = (v) => (value === 'null' ? v === null || v === undefined : String(v) === value)
      break
    default:
      throw new ApiError(400, 'PGRST100', `Unsupported filter operator "${op}" in the demo.`)
  }
  return (row) => (negate ? !test(row[column]) : test(row[column]))
}

function applyQuery(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows
  for (const [key, value] of params) {
    if (!RESERVED.has(key)) out = out.filter(filterFor(key, value))
  }
  const order = params.get('order')
  if (order) {
    const terms = order.split(',').map((t) => {
      const [col, dir] = t.split('.')
      return { col, desc: dir === 'desc' }
    })
    out = [...out].sort((a, b) => {
      for (const { col, desc } of terms) {
        const av = a[col]
        const bv = b[col]
        if (av === bv) continue
        if (av === null || av === undefined) return 1
        if (bv === null || bv === undefined) return -1
        const c = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv)
        if (c !== 0) return desc ? -c : c
      }
      return 0
    })
  }
  const offset = Number(params.get('offset') ?? 0)
  const limit = params.get('limit')
  return out.slice(offset, limit ? offset + Number(limit) : undefined)
}

function project(rows: Row[], select: string | null): Row[] {
  if (!select || select === '*') return rows.map((r) => ({ ...r }))
  const cols = select.split(',').map((c) => c.trim())
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])))
}

// ---------------------------------------------------------------------------
// Event RPCs (ports of calendar.create_event / update_event / expand_recurrence)
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`)
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (date: string, days: number) => fromUtc(toUtc(date) + days * 24 * HOUR)
const weekday = (date: string) => new Date(toUtc(date)).getUTCDay()

export function expandRecurrence(
  start: string,
  freq: string,
  interval: number,
  byWeekday: number[] | null,
  until: string | null,
  count: number | null,
): string[] {
  if (!['daily', 'weekly', 'monthly'].includes(freq)) throw invalid('Repeat must be daily, weekly or monthly')
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) throw invalid('Repeat interval must be between 1 and 12')
  if (!until && !count) throw invalid('A repeating event needs an end date or a number of times')
  if (until && until < start) throw invalid('The repeat end date is before the first event')
  if (count !== null && (count < 1 || count > 200)) throw invalid('A repeating event can happen at most 200 times')
  const limit = until && until < addDays(start, 730) ? until : addDays(start, 730)
  const max = Math.min(count ?? 200, 200)
  const out: string[] = []
  if (freq === 'daily') {
    for (let d = start; d <= limit && out.length < max; d = addDays(d, interval)) out.push(d)
  } else if (freq === 'weekly') {
    const days = [...new Set((byWeekday ?? []).filter((x) => x >= 0 && x <= 6))].sort()
    if (days.length === 0) days.push(weekday(start))
    let weekStart = addDays(start, -weekday(start))
    outer: for (;;) {
      for (const wd of days) {
        const d = addDays(weekStart, wd)
        if (d > limit || out.length >= max) break outer
        if (d >= start) out.push(d)
      }
      weekStart = addDays(weekStart, 7 * interval)
    }
  } else {
    const [y, m, day] = start.split('-').map(Number)
    for (let k = 0; ; k++) {
      const ms = Date.UTC(y, m - 1 + k * interval, day)
      const d = fromUtc(ms)
      if (d > limit || out.length >= max) break
      if (new Date(ms).getUTCDate() === day) out.push(d)
    }
  }
  return out
}

/** Gainesville wall-clock time -> UTC Date (plain Date, so toISOString() ends in Z). */
function localInstant(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(new TZDate(y, m - 1, d, hh, mm, CHAPTER_TZ).getTime())
}

function localRange(date: string, span: number, start: string, end: string, allDay: boolean) {
  if (allDay) {
    return { starts_at: localInstant(date, '00:00').toISOString(), ends_at: localInstant(addDays(date, span + 1), '00:00').toISOString() }
  }
  const s = localInstant(date, start)
  let e = localInstant(addDays(date, span), end)
  if (e.getTime() <= s.getTime()) e = localInstant(addDays(date, span + 1), end)
  return { starts_at: s.toISOString(), ends_at: e.toISOString() }
}

function readEventPayload(p: Row) {
  const start = typeof p.start_date === 'string' && DATE_RE.test(p.start_date) ? p.start_date : null
  if (!start) throw invalid('Pick a date')
  const end = typeof p.end_date === 'string' && DATE_RE.test(p.end_date) ? p.end_date : start
  if (end < start) throw invalid('The end date is before the start date')
  const span = Math.round((toUtc(end) - toUtc(start)) / (24 * HOUR))
  const allDay = p.all_day === true
  const startTime = typeof p.start_time === 'string' && p.start_time ? p.start_time.slice(0, 5) : '00:00'
  const endTime = typeof p.end_time === 'string' && p.end_time ? p.end_time.slice(0, 5) : '00:00'
  const fields = {
    title: p.title,
    category: p.category,
    location: p.location ?? null,
    description: p.description ?? null,
    required: p.required === true,
    hidden_from_associates: p.hidden_from_associates === true,
    rsvp_enabled: p.rsvp_enabled !== false,
    all_day: allDay,
  }
  return { start, span, allDay, startTime, endTime, fields }
}

function createEvent(ctx: Ctx, p: Row): Row[] {
  const { start, span, allDay, startTime, endTime, fields } = readEventPayload(p)
  const rec = p.recurrence && typeof p.recurrence === 'object' ? (p.recurrence as Row) : null
  let dates = [start]
  let seriesId: string | null = null
  if (rec) {
    const byWeekday = Array.isArray(rec.by_weekday) ? (rec.by_weekday as number[]).map(Number) : null
    const until = typeof rec.until === 'string' && rec.until ? rec.until : null
    const count = rec.count === null || rec.count === undefined || rec.count === '' ? null : Number(rec.count)
    const interval = rec.interval === undefined || rec.interval === null || rec.interval === '' ? 1 : Number(rec.interval)
    dates = expandRecurrence(start, String(rec.freq), interval, byWeekday, until, count)
    if (dates.length === 0) throw invalid('That repeat rule does not produce any dates')
    if (!ctx.service && !isAdmin(ctx)) throw denied('event_series')
    seriesId = uuid()
    state.event_series.push({
      id: seriesId,
      freq: String(rec.freq),
      interval,
      by_weekday: byWeekday,
      until_date: until,
      occurrence_count: count,
      created_by: ctx.uid,
      created_at: nowIso(),
    })
  }
  try {
    return insertRows(
      ctx,
      'calendar',
      'events',
      dates.map((d) => ({ ...fields, series_id: seriesId, ...localRange(d, span, startTime, endTime, allDay) })),
      false,
    )
  } catch (e) {
    if (seriesId) state.event_series = state.event_series.filter((s) => s.id !== seriesId)
    throw e
  }
}

function updateEvent(ctx: Ctx, id: string, p: Row, scope: string): Row[] {
  if (scope !== 'single' && scope !== 'following') throw invalid('Unknown edit scope')
  const { start, span, allDay, startTime, endTime, fields } = readEventPayload(p)
  const target = state.events.find((e) => e.id === id && eventVisible(ctx, e as unknown as Row))
  if (!target) throw new ApiError(404, 'P0002', 'Event not found')
  const shift = Math.round((toUtc(start) - toUtc(dayKey(target.starts_at))) / (24 * HOUR))
  const def = TABLES['calendar.events']
  const targets = state.events.filter(
    (e) =>
      (e.id === id || (scope === 'following' && target.series_id && e.series_id === target.series_id && e.starts_at >= target.starts_at)) &&
      def.update!.using(ctx, e as unknown as Row),
  )
  if (targets.length === 0) throw new ApiError(403, '42501', 'You can\u2019t edit this event')
  const updates = targets.map((e) => {
    const next: Row = { ...e, ...fields, ...localRange(addDays(dayKey(e.starts_at), shift), span, startTime, endTime, allDay), updated_at: nowIso() }
    normalizeEvent(next)
    if (!def.update!.check(ctx, next)) throw denied('events')
    return { e, next }
  })
  updates.forEach(({ e, next }) => Object.assign(e, next))
  return updates.map(({ next }) => next)
}

// ---------------------------------------------------------------------------
// Schedules (ports of calendar.start_semester / save_schedule_step / submission_counts)
// ---------------------------------------------------------------------------
const currentSemester = () => state.semesters.find((s) => s.is_current) ?? null

function startSemester(ctx: Ctx, a: Row): Semester {
  if (!isAdmin(ctx)) throw new ApiError(403, '42501', 'Only admins can start a semester')
  const name = String(a.p_name ?? '').trim()
  const startsOn = String(a.p_starts_on ?? '')
  const endsOn = String(a.p_ends_on ?? '')
  if (!name) throw invalid('Name the semester')
  if (!DATE_RE.test(startsOn) || !DATE_RE.test(endsOn) || endsOn <= startsOn) throw invalid('The semester must end after it starts')
  state.semesters.forEach((s) => (s.is_current = false))
  const row: Semester = { id: uuid(), name, starts_on: startsOn, ends_on: endsOn, is_current: true, created_by: ctx.uid, created_at: nowIso() }
  state.semesters.push(row)
  return row
}

function submissionCounts(ctx: Ctx) {
  if (!isMember(ctx)) return []
  const sem = currentSemester()
  const active = state.members.filter((m) => m.status === 'approved' && m.active)
  const submitted = active.filter((m) => state.schedule_submissions.some((s) => s.member_id === m.id && s.semester_id === sem?.id && s.completed)).length
  return [{ submitted, total: active.length }]
}

const plusMinute = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const total = (h * 60 + m + 1) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function insertItems(memberId: string, semesterId: string, items: Row[], kinds: string[]) {
  for (const i of items) {
    if (!kinds.includes(String(i.kind))) continue
    const date = String(i.date ?? '')
    if (!DATE_RE.test(date)) throw invalid('Pick a date for every item')
    const title = String(i.title ?? '').trim().slice(0, 160)
    if (!title) throw new ApiError(400, '23514', 'Every item needs a name')
    const start = typeof i.start === 'string' && i.start ? i.start.slice(0, 5) : null
    const end = typeof i.end === 'string' && i.end ? i.end.slice(0, 5) : null
    const allDay = i.all_day === true || !start
    const r = localRange(date, 0, start ?? '00:00', end ?? (start ? plusMinute(start) : '00:00'), allDay)
    const ends_at =
      i.kind === 'deadline' && !end ? r.starts_at : i.kind === 'exam' && !end && !allDay ? new Date(Date.parse(r.starts_at) + 2 * HOUR).toISOString() : r.ends_at
    state.dated_items.push({
      id: uuid(),
      member_id: memberId,
      semester_id: semesterId,
      kind: String(i.kind),
      category: i.kind === 'exam' ? 'exam' : i.category === 'school' || i.category === 'personal' ? String(i.category) : i.kind === 'deadline' ? 'school' : 'personal',
      title,
      course: typeof i.course === 'string' && i.course.trim() ? i.course.trim().slice(0, 60) : null,
      starts_at: r.starts_at,
      ends_at,
      all_day: allDay,
      blocks_availability: i.kind !== 'deadline',
      source: typeof i.source === 'string' && i.source ? i.source : 'manual',
      external_uid: typeof i.external_uid === 'string' && i.external_uid ? i.external_uid : null,
      dismissed: i.dismissed === true,
      created_at: nowIso(),
    })
  }
}

function saveScheduleStep(ctx: Ctx, a: Row): Submission {
  if (!isMember(ctx)) throw new ApiError(403, '42501', 'Not allowed')
  const sem = currentSemester()
  if (!sem) throw new ApiError(404, 'P0002', 'There is no current semester yet. Ask an admin to start one.')
  const step = String(a.p_step)
  if (!['classes', 'exams', 'obligations'].includes(step)) throw invalid('Unknown step')
  const blocks = Array.isArray(a.p_blocks) ? (a.p_blocks as Row[]) : []
  const items = Array.isArray(a.p_items) ? (a.p_items as Row[]) : []
  const canvas = typeof a.p_canvas_url === 'string' ? a.p_canvas_url.trim() : ''
  if (canvas && !/^https:\/\/[^/\s]+\/feeds\/calendars\/\S+$/.test(canvas)) throw invalid('That doesn\u2019t look like a Canvas calendar feed link')
  const uid = ctx.uid!
  const kind = step === 'classes' ? 'class' : step === 'obligations' ? 'obligation' : null
  const itemKinds = step === 'exams' ? ['exam', 'deadline'] : step === 'obligations' ? ['obligation'] : []

  const keepBlocks = state.weekly_blocks.filter((b) => !(b.member_id === uid && b.semester_id === sem.id && b.kind === kind))
  const keepItems = state.dated_items.filter((i) => !(i.member_id === uid && i.semester_id === sem.id && itemKinds.includes(i.kind)))
  const previous = { blocks: state.weekly_blocks, items: state.dated_items }
  state.weekly_blocks = keepBlocks
  state.dated_items = keepItems
  try {
    if (kind) {
      for (const b of blocks) {
        const start = String(b.start ?? '').slice(0, 5)
        const end = String(b.end ?? '').slice(0, 5)
        const label = String(b.label ?? '').trim().slice(0, 120)
        const weekday = Number(b.weekday)
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start || !label) {
          throw new ApiError(400, '23514', 'Every row needs a day, a name, and an end time after its start time')
        }
        state.weekly_blocks.push({
          id: uuid(),
          member_id: uid,
          semester_id: sem.id,
          kind,
          category: kind === 'class' ? 'school' : b.category === 'school' ? 'school' : 'personal',
          weekday,
          start_time: `${start}:00`,
          end_time: `${end}:00`,
          label,
          location: typeof b.location === 'string' && b.location.trim() ? b.location.trim().slice(0, 120) : null,
          created_at: nowIso(),
        })
      }
    }
    insertItems(uid, sem.id, items, itemKinds)
  } catch (e) {
    state.weekly_blocks = previous.blocks
    state.dated_items = previous.items
    throw e
  }

  let sub = state.schedule_submissions.find((s) => s.member_id === uid && s.semester_id === sem.id)
  if (!sub) {
    sub = { member_id: uid, semester_id: sem.id, classes_done_at: null, exams_done_at: null, obligations_done_at: null, completed: false, canvas_feed_url: null, canvas_synced_at: null, canvas_sync_error: null, updated_at: nowIso() }
    state.schedule_submissions.push(sub)
  }
  if (step === 'classes') sub.classes_done_at = nowIso()
  if (step === 'exams') {
    sub.exams_done_at = nowIso()
    sub.canvas_feed_url = canvas || null
    sub.canvas_synced_at = canvas ? nowIso() : sub.canvas_synced_at
  }
  if (step === 'obligations') sub.obligations_done_at = nowIso()
  sub.completed = !!(sub.classes_done_at && sub.exams_done_at && sub.obligations_done_at)
  sub.updated_at = nowIso()
  return { ...sub }
}

function adminUpdateMember(ctx: Ctx, a: Row): Member {
  if (!isAdmin(ctx)) throw new ApiError(403, '42501', 'Only admins can change members')
  const m = state.members.find((x) => x.id === a.p_member_id)
  if (!m) throw new ApiError(404, 'P0002', 'Member not found')
  const next: Member = { ...m }
  if (a.p_member_type) next.member_type = a.p_member_type as Member['member_type']
  next.role = next.member_type === 'associate' ? 'member' : ((a.p_role as Member['role']) ?? m.role)
  if (a.p_status) next.status = a.p_status as Member['status']
  if (typeof a.p_active === 'boolean') next.active = a.p_active
  if (typeof a.p_pledge_class === 'string') next.pledge_class = a.p_pledge_class.trim() || null
  if (typeof a.p_name === 'string' && a.p_name.trim()) next.name = a.p_name.trim()
  if (a.p_status === 'approved' && m.status !== 'approved') {
    next.approved_at = nowIso()
    next.approved_by = ctx.uid
  }
  next.updated_at = nowIso()
  const others = state.members.filter((x) => x.id !== m.id)
  if (![...others, next].some((x) => x.role === 'admin' && x.status === 'approved' && x.active)) {
    throw new ApiError(400, 'P0001', 'The chapter must keep at least one active admin')
  }
  Object.assign(m, next)
  return { ...m }
}

function feedToken(ctx: Ctx, rotate: boolean): string {
  if (!isMember(ctx)) throw new ApiError(403, '42501', 'Not allowed')
  if (rotate) state.feed_tokens = state.feed_tokens.filter((t) => t.member_id !== ctx.uid)
  let row = state.feed_tokens.find((t) => t.member_id === ctx.uid)
  if (!row) {
    row = { member_id: ctx.uid!, token: randomHex(24), created_at: nowIso() }
    state.feed_tokens.push(row)
  }
  return row.token
}

function rpc(ctx: Ctx, schema: string, fn: string, args: Row): unknown {
  if (!ctx.uid && !ctx.service) throw new ApiError(401, '42501', `permission denied for function ${fn}`)
  switch (`${schema}.${fn}`) {
    case 'calendar.create_event':
      return createEvent(ctx, (args.p ?? {}) as Row)
    case 'calendar.update_event':
      return updateEvent(ctx, String(args.p_id), (args.p ?? {}) as Row, String(args.p_scope ?? 'single'))
    case 'calendar.feed_token':
      return feedToken(ctx, args.p_rotate === true)
    case 'public.admin_update_member':
      return adminUpdateMember(ctx, args)
    case 'calendar.start_semester':
      return startSemester(ctx, args)
    case 'calendar.submission_counts':
      return submissionCounts(ctx)
    case 'calendar.save_schedule_step':
      return saveScheduleStep(ctx, args)
    default:
      throw new ApiError(404, 'PGRST202', `Could not find the function ${schema}.${fn} in the demo`)
  }
}

// ---------------------------------------------------------------------------
// REST handler
// ---------------------------------------------------------------------------
async function handleRest(req: Request, url: URL, ctx: Ctx): Promise<Response> {
  const path = url.pathname.replace(/^\/rest\/v1\//, '')
  const reading = req.method === 'GET' || req.method === 'HEAD'
  const schema = (reading ? req.headers.get('accept-profile') : req.headers.get('content-profile')) ?? 'public'
  const prefer = req.headers.get('prefer') ?? ''
  const wantsObject = (req.headers.get('accept') ?? '').includes('application/vnd.pgrst.object+json')
  const bodyText = reading ? '' : await req.text()
  const body = bodyText ? JSON.parse(bodyText) : undefined

  if (path.startsWith('rpc/')) {
    const result = rpc(ctx, schema, path.slice(4), (body ?? {}) as Row)
    changed()
    return json(200, result)
  }

  const def = tableFor(schema, path, ctx)
  const visible = (r: Row) => ctx.service || def.select(ctx, r)
  let result: Row[]
  let status = 200

  if (reading) {
    result = applyQuery(def.rows().filter(visible), url.searchParams)
  } else if (req.method === 'POST') {
    const input = (Array.isArray(body) ? body : [body]) as Row[]
    result = insertRows(ctx, schema, path, input, prefer.includes('resolution=merge-duplicates'))
    status = 201
    changed()
  } else if (req.method === 'PATCH') {
    const patch = (body ?? {}) as Row
    if (!ctx.service) {
      if (!def.update) throw denied(path)
      const allowed = def.update.columns
      if (allowed && Object.keys(patch).some((k) => !allowed.includes(k))) {
        throw new ApiError(403, '42501', `permission denied for table ${path}`)
      }
    }
    const targets = applyQuery(def.rows().filter(visible), url.searchParams).filter((r) => ctx.service || def.update!.using(ctx, r))
    const updates = targets.map((r) => {
      const next = { ...r, ...patch, ...('updated_at' in r ? { updated_at: nowIso() } : {}) }
      def.normalize?.(next)
      if (!ctx.service && !def.update!.check(ctx, next)) throw denied(path)
      return { r, next }
    })
    updates.forEach(({ r, next }) => Object.assign(r, next))
    result = updates.map(({ next }) => next)
    changed()
  } else if (req.method === 'DELETE') {
    const rows = def.rows()
    const targets = applyQuery(rows.filter(visible), url.searchParams).filter((r) => ctx.service || (def.delete?.(ctx, r) ?? false))
    for (const t of targets) rows.splice(rows.indexOf(t), 1)
    if (path === 'events') {
      const ids = new Set(targets.map((t) => t.id))
      state.rsvps = state.rsvps.filter((r) => !ids.has(r.event_id))
    }
    result = targets
    changed()
  } else {
    throw new ApiError(405, 'PGRST000', 'Method not allowed')
  }

  const shaped = project(result, url.searchParams.get('select'))
  if (wantsObject) {
    if (shaped.length !== 1) throw new ApiError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned')
    return json(status, shaped[0])
  }
  if (!reading && !prefer.includes('return=representation')) return new Response(null, { status: status === 201 ? 201 : 204 })
  return json(status, shaped)
}

// ---------------------------------------------------------------------------
// Auth handler (the GoTrue endpoints supabase-js calls)
// ---------------------------------------------------------------------------
const b64url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function publicUser(u: AuthUser) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    confirmed_at: u.email_confirmed_at,
    user_metadata: u.user_metadata,
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [],
    created_at: u.created_at,
    updated_at: u.updated_at,
  }
}

function issueSession(u: AuthUser) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { aud: 'authenticated', exp: now + 3600, iat: now, sub: u.id, email: u.email, role: 'authenticated', session_id: uuid() }
  const accessToken = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.demo`
  const refreshToken = randomHex(16)
  state.refresh[refreshToken] = u.id
  return { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refreshToken, user: publicUser(u) }
}

function userIdFromAuthHeader(header: string | null): string | null {
  const token = header?.replace(/^Bearer\s+/i, '') ?? ''
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return state.users.some((u) => u.id === payload.sub) ? (payload.sub as string) : null
  } catch {
    return null
  }
}

const authError = (status: number, code: string, msg: string, extra: Row = {}) =>
  json(status, { code: status, error_code: code, msg, ...extra })

function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password should be at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password should contain at least one letter and one number.'
  return null
}

function sendEmail(to: string, kind: 'confirm' | 'recovery', tokenHash: string) {
  const email: DemoEmail =
    kind === 'confirm'
      ? {
          id: uuid(),
          to,
          subject: 'Confirm your email',
          heading: 'Confirm your email',
          body: 'Tap the button below to confirm your email for the chapter calendar. After that, an officer will approve your account.',
          action: 'Confirm email',
          path: `/auth/confirm?token_hash=${tokenHash}&type=email`,
          sent_at: nowIso(),
          read: false,
        }
      : {
          id: uuid(),
          to,
          subject: 'Reset your password',
          heading: 'Reset your password',
          body: `We got a request to reset the password for ${to}. Tap the button below to choose a new one. The link expires in 1 hour.`,
          action: 'Choose a new password',
          path: `/reset-password?token_hash=${tokenHash}&type=recovery`,
          sent_at: nowIso(),
          read: false,
        }
  state.outbox.unshift(email)
}

async function handleAuth(req: Request, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/auth\/v1\//, '')
  const body = req.method === 'GET' ? {} : ((await req.json().catch(() => ({}))) as Row)
  const findUser = (email: unknown) => state.users.find((u) => u.email === String(email ?? '').trim().toLowerCase())

  if (path === 'token' && url.searchParams.get('grant_type') === 'password') {
    const u = findUser(body.email)
    if (!u || u.password_hash !== (await hashPassword(String(body.password ?? '')))) {
      return authError(400, 'invalid_credentials', 'Invalid login credentials')
    }
    if (!u.email_confirmed_at) return authError(400, 'email_not_confirmed', 'Email not confirmed')
    const session = issueSession(u)
    changed()
    return json(200, session)
  }

  if (path === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const id = state.refresh[String(body.refresh_token)]
    const u = state.users.find((x) => x.id === id)
    if (!u) return authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
    delete state.refresh[String(body.refresh_token)]
    const session = issueSession(u)
    changed()
    return json(200, session)
  }

  if (path === 'signup') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const problem = passwordProblem(password)
    if (problem) return authError(422, 'weak_password', problem, { weak_password: { reasons: ['length', 'characters'] } })
    const existing = findUser(email)
    if (existing?.email_confirmed_at) return json(200, { ...publicUser(existing), identities: [] })
    const u: AuthUser = existing ?? {
      id: uuid(),
      email,
      password_hash: await hashPassword(password),
      email_confirmed_at: null,
      user_metadata: (body.data as Record<string, unknown>) ?? {},
      created_at: nowIso(),
      updated_at: nowIso(),
      confirmation: null,
      recovery: null,
    }
    if (!existing) {
      state.users.push(u)
      addMemberRow(u)
    }
    u.confirmation = { hash: randomHex(28), sent_at: Date.now() }
    sendEmail(email, 'confirm', u.confirmation.hash)
    changed()
    return json(200, publicUser(u))
  }

  if (path === 'verify' && req.method === 'POST') {
    const hash = String(body.token_hash ?? '')
    const type = String(body.type ?? '')
    const field = type === 'recovery' ? 'recovery' : 'confirmation'
    const u = state.users.find((x) => x[field]?.hash === hash)
    if (!u || Date.now() - u[field]!.sent_at > HOUR) return authError(403, 'otp_expired', 'Email link is invalid or has expired')
    u[field] = null
    if (field === 'confirmation') u.email_confirmed_at = u.email_confirmed_at ?? nowIso()
    const session = issueSession(u)
    changed()
    return json(200, session)
  }

  if (path === 'recover') {
    const u = findUser(body.email)
    if (u) {
      u.recovery = { hash: randomHex(28), sent_at: Date.now() }
      sendEmail(u.email, 'recovery', u.recovery.hash)
      changed()
    }
    return json(200, {})
  }

  if (path === 'user') {
    const id = userIdFromAuthHeader(req.headers.get('authorization'))
    const u = state.users.find((x) => x.id === id)
    if (!u) return authError(403, 'bad_jwt', 'invalid JWT')
    if (req.method === 'PUT' && typeof body.password === 'string') {
      const problem = passwordProblem(body.password)
      if (problem) return authError(422, 'weak_password', problem, { weak_password: { reasons: ['length'] } })
      const hash = await hashPassword(body.password)
      if (hash === u.password_hash) return authError(422, 'same_password', 'New password should be different from the old password.')
      u.password_hash = hash
      u.updated_at = nowIso()
      changed()
    }
    return json(200, publicUser(u))
  }

  if (path === 'logout') return new Response(null, { status: 204 })

  return authError(404, 'not_found', `The demo doesn't support ${path}`)
}

// ---------------------------------------------------------------------------
// Entry point: the fetch supabase-js uses in the demo build
// ---------------------------------------------------------------------------
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await ready
  const req = new Request(input, init)
  const url = new URL(req.url)
  await new Promise((r) => setTimeout(r, 60)) // feel like a network call
  try {
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, url)
    if (url.pathname.startsWith('/rest/v1/')) {
      const uid = userIdFromAuthHeader(req.headers.get('authorization'))
      return await handleRest(req, url, { uid })
    }
    if (url.pathname.startsWith('/storage/v1/object/')) return await handleStorage(req, url)
    if (url.pathname.startsWith('/functions/v1/')) return await handleFunction(req, url)
    return json(404, { message: 'Not available in the demo' })
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { code: e.code, message: e.message, details: null, hint: null })
    console.error(e)
    return json(500, { code: 'XX000', message: e instanceof Error ? e.message : 'Demo error' })
  }
}

// ---------------------------------------------------------------------------
// Seed data (same people as supabase/seed.sql, events relative to today)
// ---------------------------------------------------------------------------
function addMemberRow(u: AuthUser, person?: SeedPerson) {
  const name = String(u.user_metadata.full_name ?? u.user_metadata.name ?? '').trim() || u.email.split('@')[0]
  state.members.push({
    id: u.id,
    name: name.slice(0, 120),
    email: u.email,
    role: person?.role ?? 'member',
    member_type: person?.type ?? 'associate',
    pledge_class: person?.class ?? null,
    status: person?.status ?? 'pending',
    active: true,
    approved_at: person?.status === 'approved' ? nowIso() : null,
    approved_by: null,
    created_at: u.created_at,
    updated_at: u.created_at,
  })
}

async function seed(): Promise<State> {
  state = {
    users: [],
    refresh: {},
    members: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    settings: { id: true, timezone: CHAPTER_TZ, night_start: '19:00:00', night_end: '23:00:00', secretary_email: null, updated_at: nowIso() },
    event_series: [],
    events: [],
    rsvps: [],
    feed_tokens: [],
    outbox: [],
    semesters: [],
    schedule_submissions: [],
    weekly_blocks: [],
    dated_items: [],
    schedule_uploads: [],
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  for (const p of DEMO_PEOPLE) {
    const u: AuthUser = {
      id: uuid(),
      email: p.email,
      password_hash: passwordHash,
      email_confirmed_at: nowIso(),
      user_metadata: { full_name: p.name },
      created_at: nowIso(),
      updated_at: nowIso(),
      confirmation: null,
      recovery: null,
    }
    state.users.push(u)
    addMemberRow(u, p)
  }

  const today = dayKey(new Date())
  const dow = weekday(today)
  const sunday = addDays(today, (7 - dow) % 7)
  const saturday = addDays(today, (6 - dow + 7) % 7)
  const service: Ctx = { uid: null, service: true }
  const events: Row[] = [
    { title: 'Chapter Meeting', category: 'required', start_date: sunday, start_time: '19:00', end_time: '20:30', location: 'Chapter House', description: 'Business attire.', recurrence: { freq: 'weekly', interval: 1, by_weekday: [0], count: 12 } },
    { title: 'Fall Formal', category: 'social', start_date: addDays(saturday, 14), start_time: '20:00', end_time: '00:30', location: 'Hilton UF Conference Center', description: 'Dates welcome. Buses leave the house at 7:30 PM.' },
    { title: 'Mixer', category: 'social', start_date: saturday, start_time: '21:00', end_time: '23:59', location: 'Chapter House' },
    { title: 'Dance Marathon fundraiser', category: 'philanthropy', start_date: addDays(today, 3), start_time: '11:00', end_time: '15:00', location: 'Turlington Plaza' },
    { title: 'Rush planning (exec + chairs)', category: 'rush', start_date: addDays(today, 2), start_time: '18:00', end_time: '19:00', location: 'Library West, room 211', hidden_from_associates: true },
    { title: 'Big/Little reveal prep', category: 'social', start_date: addDays(today, 5), start_time: '20:00', end_time: '21:00', hidden_from_associates: true },
    { title: 'Career fair', category: 'school', start_date: addDays(today, 8), all_day: true, location: 'Reitz Union' },
    { title: 'Spring kickoff', category: 'required', start_date: '2027-01-10', start_time: '18:00', end_time: '19:30', location: 'Chapter House' },
  ]
  for (const e of events) createEvent(service, e)
  seedSchedules(today)
  return state
}

async function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      state = JSON.parse(saved) as State
      return
    }
  } catch {
    // fall through to a fresh seed
  }
  await seed()
  changed()
}

const ready = load()

/** Restores the sample data and clears the demo inbox. */
export async function resetDemo() {
  await ready
  await seed()
  changed()
}

export function markInboxRead() {
  if (state.outbox.some((m) => !m.read)) {
    state.outbox.forEach((m) => (m.read = true))
    changed()
  }
}

export const whenReady = () => ready

// ---------------------------------------------------------------------------
// Storage and Edge Functions stand-ins (schedule uploads, reading, imports)
// ---------------------------------------------------------------------------
const uploads = new Map<string, Blob>() // kept in memory only: photos are large

async function handleStorage(req: Request, url: URL): Promise<Response> {
  const uid = userIdFromAuthHeader(req.headers.get('authorization'))
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/schedule-uploads\//, ''))
  if (!uid || !path.startsWith(`${uid}/`)) return json(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' })
  if (req.method !== 'POST' && req.method !== 'PUT') return json(405, { message: 'Method not allowed' })
  uploads.set(path, await req.blob())
  return json(200, { Key: `schedule-uploads/${path}`, Id: uuid() })
}

interface SampleFn {
  (input: string, options?: Record<string, unknown>): Promise<{ text: string }>
  json(input: string, options?: Record<string, unknown>): Promise<unknown>
  limits(): Promise<{ images?: { maxCount: number } }>
}

async function askClaude(prompt: string, images: Blob[]): Promise<{ raw: unknown; note?: string } | null> {
  const sample = (await window.claude?.use('sample').catch(() => null)) as SampleFn | null
  if (!sample) return null
  const limits = await sample.limits().catch(() => ({}) as { images?: { maxCount: number } })
  const canSend = images.length > 0 && !!limits.images
  const raw = await sample.json(prompt, { modelTier: 'default', ...(canSend ? { images: images.slice(0, limits.images!.maxCount) } : {}) })
  return { raw, note: images.length > 0 && !canSend ? 'Photos can’t be sent from this preview, so only the typed text was read.' : undefined }
}

async function handleFunction(req: Request, url: URL): Promise<Response> {
  const uid = userIdFromAuthHeader(req.headers.get('authorization'))
  const ctx: Ctx = { uid }
  if (!uid || !isMember(ctx)) return json(403, { error: 'Your account isn’t approved yet.' })
  const sem = currentSemester()
  if (!sem) return json(409, { error: 'There is no current semester yet. Ask an admin to start one.' })
  const body = (await req.json().catch(() => ({}))) as Row
  const step = String(body.step) as ScheduleStep
  const name = url.pathname.replace(/^\/functions\/v1\//, '')

  if (name === 'parse-schedule') {
    const text = typeof body.text === 'string' ? body.text : ''
    const paths = Array.isArray(body.image_paths) ? (body.image_paths as string[]) : []
    const images = paths.map((p) => uploads.get(p)).filter((b): b is Blob => !!b)
    let parsed: ParsedSchedule
    try {
      const answer = await askClaude(buildSchedulePrompt(step, sem, dayKey(new Date()), text, images.length), images)
      if (answer) {
        parsed = normalizeAiSchedule(answer.raw, step, sem)
        if (answer.note) parsed.notes.unshift(answer.note)
      } else {
        parsed = sampleParse(step, sem)
      }
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'not_granted') return json(403, { error: 'Reading needs your OK to use Claude. Allow it when asked, or add rows by hand.' })
      if (code === 'rate_limited') return json(429, { error: 'Too many requests. Wait a minute and try again.' })
      return json(422, { error: 'Couldn’t read that. Try a clearer screenshot or type it instead.' })
    }
    recordUpload(uid, sem.id, step, 'ai', text, paths, parsed)
    return json(200, parsed)
  }

  if (name === 'import-calendar') {
    const source = String(body.source)
    let parsed: ParsedSchedule
    if (source === 'ics_file') {
      const blob = uploads.get(String(body.path ?? ''))
      const text = blob ? await blob.text() : ''
      if (!text.includes('BEGIN:VCALENDAR')) return json(400, { error: 'That file isn’t a calendar (.ics) file.' })
      parsed = scheduleFromIcs(parseIcs(text), step, sem)
    } else {
      if (source === 'canvas' && !/^https:\/\/[^/\s]+\/feeds\/calendars\/\S+$/.test(String(body.url ?? '').trim())) {
        return json(400, { error: 'That doesn’t look like a Canvas feed link. In Canvas, open Calendar, then Calendar Feed, and copy the link.' })
      }
      // The demo can't fetch other websites, so links import a sample Canvas feed.
      parsed = scheduleFromCanvas(parseIcs(sampleCanvasIcs(sem)), sem)
      parsed.notes.unshift('This preview can’t open links, so it imported a sample Canvas feed instead of yours.')
    }
    recordUpload(uid, sem.id, step, source, null, [], parsed)
    return json(200, parsed)
  }

  return json(404, { error: 'Not available in the demo' })
}

function recordUpload(memberId: string, semesterId: string, step: string, kind: string, text: string | null, paths: string[], parsed: unknown) {
  state.schedule_uploads.push({ id: uuid(), member_id: memberId, semester_id: semesterId, step, kind, text_content: text, storage_paths: paths, source_url: null, parsed, created_at: nowIso() })
  changed()
}

/** Used when Claude isn't reachable from the preview. */
function sampleParse(step: ScheduleStep, sem: Semester): ParsedSchedule {
  const today = dayKey(new Date())
  const note = 'Claude couldn’t be reached from this preview, so this is a sample result. Edit it like a real one.'
  if (step === 'classes') {
    return {
      blocks: [
        ...[1, 3, 5].map((weekday) => ({ weekday, start: '10:40', end: '11:30', label: 'COP3502 Lecture', location: 'CSE A101', category: 'school' as const })),
        ...[2, 4].map((weekday) => ({ weekday, start: '09:35', end: '10:25', label: 'MAC2312 Lecture', location: 'LIT 109', category: 'school' as const })),
      ],
      items: [],
      notes: [note],
    }
  }
  if (step === 'exams') {
    return normalizeAiSchedule(
      { dated: [{ kind: 'exam', title: 'Exam 2', course: 'COP3502', date: addDays(today, 5), start: '20:20', end: '22:10' }, { kind: 'exam', title: 'Midterm', course: 'MAC2312', date: addDays(today, 12), start: '20:20', end: '22:10' }], notes: [note] },
      step,
      sem,
    )
  }
  return {
    blocks: [
      { weekday: 4, start: '18:00', end: '22:00', label: 'Shift at Publix', location: null, category: 'personal' },
      { weekday: 2, start: '19:00', end: '20:30', label: 'Club soccer practice', location: 'Graham Field', category: 'personal' },
    ],
    items: [],
    notes: [note],
  }
}

/** A small Canvas-style feed (UTC times, course codes in brackets) relative to today. */
function sampleCanvasIcs(sem: Semester): string {
  const today = dayKey(new Date())
  const utc = (date: string, time: string) => localInstant(date, time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const term = sem.name.replace(/\s+/g, '')
  const events = [
    { uid: 'event-1001', title: `Exam 2 [COP3502-${term}]`, date: addDays(today, 5), start: '20:20', end: '22:10' },
    { uid: 'event-1002', title: `Midterm Exam [MAC2312-${term}]`, date: addDays(today, 12), start: '20:20', end: '22:10' },
    { uid: 'assignment-2001', title: `Project 3 [COP3502-${term}]`, date: addDays(today, 6), start: '23:59', end: '23:59' },
    { uid: 'assignment-2002', title: `Homework 7 [MAC2312-${term}]`, date: addDays(today, 3), start: '23:59', end: '23:59' },
    { uid: 'assignment-2003', title: `Final Project Presentation [ENC1101-${term}]`, date: addDays(today, 20), start: '23:59', end: '23:59' },
  ]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Instructure//Canvas//EN',
    ...events.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTART:${utc(e.date, e.start)}`, `DTEND:${utc(e.date, e.end)}`, `SUMMARY:${e.title}`, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Current semester and finished schedules for most sample members (same shape as seed.sql). */
function seedSchedules(today: string) {
  const month = Number(today.slice(5, 7))
  const year = today.slice(0, 4)
  const sem: Semester = {
    id: uuid(),
    name: `${month >= 8 ? 'Fall' : month <= 5 ? 'Spring' : 'Summer'} ${year}`,
    starts_on: addDays(today, -45),
    ends_on: addDays(today, 75),
    is_current: true,
    created_by: null,
    created_at: nowIso(),
  }
  state.semesters.push(sem)
  const skip = ['brother2@example.com', 'brother9@example.com', 'am5@example.com']
  const classes = [
    { s: '09:35', e: '10:25', label: 'MAC2312 Lecture', loc: 'LIT 109', days: [1, 3, 5] },
    { s: '11:45', e: '12:35', label: 'COP3502 Lecture', loc: 'CSE A101', days: [1, 3, 5] },
    { s: '13:55', e: '14:45', label: 'ECO2023 Lecture', loc: 'MAT 18', days: [2, 4] },
    { s: '15:00', e: '16:55', label: 'CHM2045L Lab', loc: 'JHH 130', days: [3] },
  ]
  const people = state.members.filter((m) => m.status === 'approved' && !skip.includes(m.email)).sort((a, b) => a.email.localeCompare(b.email))
  people.forEach((m, index) => {
    const n = index + 1
    const block = (kind: string, category: string, weekday: number, s: string, e: string, label: string, location: string | null) =>
      state.weekly_blocks.push({ id: uuid(), member_id: m.id, semester_id: sem.id, kind, category, weekday, start_time: `${s}:00`, end_time: `${e}:00`, label, location, created_at: nowIso() })
    classes.forEach((c, k) => {
      if ((n + k + 1) % 3 !== 0) c.days.forEach((d) => block('class', 'school', d, c.s, c.e, c.label, c.loc))
    })
    if (n % 3 === 0) block('obligation', 'personal', 4, '18:00', '22:00', 'Shift at Publix', 'Publix on 13th St')
    else if (n % 3 === 1) block('obligation', 'school', 2, '19:00', '20:30', 'Club soccer practice', 'Graham Field')
    insertItems(m.id, sem.id, [
      { kind: 'exam', title: 'Exam 2', course: 'COP3502', date: addDays(today, 4 + (n % 3)), start: '20:20', end: '22:10' },
      { kind: 'exam', title: 'Midterm', course: 'MAC2312', date: addDays(today, 10 + (n % 4)), start: '20:20', end: '22:10' },
      { kind: 'deadline', title: 'Project 3 due', course: 'COP3502', date: addDays(today, 6), start: '23:59', end: null },
    ], ['exam', 'deadline'])
    state.schedule_submissions.push({ member_id: m.id, semester_id: sem.id, classes_done_at: nowIso(), exams_done_at: nowIso(), obligations_done_at: nowIso(), completed: true, canvas_feed_url: null, canvas_synced_at: null, canvas_sync_error: null, updated_at: nowIso() })
  })
}
