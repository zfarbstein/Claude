// Per-member .ics subscription feed: GET /functions/v1/ics-feed?token=<secret>
// Calendar apps cannot send auth headers, so JWT verification is off for this function
// (see supabase/config.toml) and the secret token identifies the member instead.
// No npm imports: one PostgREST call keeps cold starts fast.
import { buildCalendar, type FeedEvent } from '../_shared/ics.ts'
import { serviceHeaders } from '../_shared/server.ts'

const TOKEN_RE = /^[a-f0-9]{48}$/
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  const token = (new URL(req.url).searchParams.get('token') ?? '').replace(/\.ics$/, '')
  if (!TOKEN_RE.test(token)) return new Response('Not found', { status: 404 })

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feed_events`, {
    method: 'POST',
    headers: {
      ...serviceHeaders,
      'content-profile': 'calendar',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    if (error?.code === 'P0002') return new Response('Not found', { status: 404 })
    console.error('feed_events failed', res.status, error)
    return new Response('Server error', { status: 500 })
  }
  const events = (await res.json()) as FeedEvent[]

  const body = buildCalendar(events, {
    name: Deno.env.get('CALENDAR_NAME') ?? 'Chapter Calendar',
    timeZone: 'America/New_York',
    uidDomain: Deno.env.get('CALENDAR_UID_DOMAIN') ?? 'chapter-calendar',
  })

  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="chapter.ics"',
      'cache-control': 'private, max-age=900',
    },
  })
})
