// In-browser stand-in for Supabase, used only by the demo build (npm run build:demo).
//
// It answers the same HTTP calls supabase-js makes (PostgREST under /rest/v1, Auth under
// /auth/v1) from data kept in this browser, and applies the same permission rules as the
// RLS policies in supabase/migrations. The real rules are tested against Postgres in
// supabase/tests; keep this file in step with them when the schema changes.
import { TZDate } from '@date-fns/tz'
import seedSql from '../../supabase/seed.sql?raw'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { CHAPTER_TZ, dayKey } from '../lib/time'
import type { CalendarEvent, Category, Member } from '../lib/types'

export const DEMO_URL = 'https://demo.chapter-calendar.invalid'
export const DEMO_ANON_KEY = 'demo-anon-key'
export const DEMO_PASSWORD = 'Password123'
const STORAGE_KEY = 'chapter-calendar-demo-v1'
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
  chair_categories: { member_id: string; category: string }[]
  settings: { id: boolean; timezone: string; night_start: string; night_end: string; secretary_email: string | null; updated_at: string }
  event_series: Series[]
  events: CalendarEvent[]
  rsvps: { event_id: string; member_id: string; status: string; updated_at: string }[]
  feed_tokens: { member_id: string; token: string; created_at: string }[]
  outbox: DemoEmail[]
}

interface SeedPerson {
  email: string
  name: string
  role: Member['role']
  type: Member['member_type']
  class: string | null
  status: Member['status']
  chair?: string[]
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
const isChair = (ctx: Ctx) => isMember(ctx) && me(ctx)!.role === 'chair'
const canManage = (ctx: Ctx, category: unknown) =>
  isAdmin(ctx) || (isChair(ctx) && state.chair_categories.some((c) => c.member_id === ctx.uid && c.category === category))
const eventVisible = (ctx: Ctx, e: Row) => isMember(ctx) && (!e.hidden_from_associates || isBrother(ctx))

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
  'calendar.chair_categories': {
    rows: () => state.chair_categories as unknown as Row[],
    key: ['member_id', 'category'],
    select: isMember,
    insert: isAdmin,
    delete: isAdmin,
  },
  'calendar.event_series': {
    rows: () => state.event_series as unknown as Row[],
    key: ['id'],
    select: isMember,
    insert: (ctx) => isAdmin(ctx) || isChair(ctx),
    delete: (ctx) => isAdmin(ctx) || isChair(ctx),
  },
  'calendar.events': {
    rows: () => state.events as unknown as Row[],
    key: ['id'],
    select: eventVisible,
    insert: (ctx, r) => canManage(ctx, r.category),
    update: { using: (ctx, r) => canManage(ctx, r.category), check: (ctx, r) => canManage(ctx, r.category) },
    delete: (ctx, r) => canManage(ctx, r.category),
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

function localInstant(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new TZDate(y, m - 1, d, hh, mm, CHAPTER_TZ)
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
    if (!ctx.service && !(isAdmin(ctx) || isChair(ctx))) throw denied('event_series')
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
    chair_categories: [],
    settings: { id: true, timezone: CHAPTER_TZ, night_start: '19:00:00', night_end: '23:00:00', secretary_email: null, updated_at: nowIso() },
    event_series: [],
    events: [],
    rsvps: [],
    feed_tokens: [],
    outbox: [],
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
    for (const category of p.chair ?? []) state.chair_categories.push({ member_id: u.id, category })
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
