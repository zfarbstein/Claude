// Helpers for the Edge Functions (Deno only): auth, PostgREST and Storage with the service key.

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })
}

/** Wraps a handler with CORS preflight and error -> JSON mapping. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      // supabase-js adds x-supabase-client-* headers that change between versions, so echo what was asked for.
      const requested = req.headers.get('access-control-request-headers')
      return new Response('ok', { headers: { ...corsHeaders, ...(requested ? { 'access-control-allow-headers': requested } : {}) } })
    }
    try {
      return await handler(req)
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message })
      console.error(e)
      return json(500, { error: 'Something went wrong. Try again in a minute.' })
    }
  })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Legacy JWT service key, or the first of the newer sb_secret_ keys.
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'))[0] as string)
// sb_secret_ keys go only in `apikey`; JWT keys also go in Authorization.
export const serviceHeaders: Record<string, string> = SERVICE_KEY.startsWith('sb_')
  ? { apikey: SERVICE_KEY }
  : { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` }

/** PostgREST call as the service role. `schema` picks the API schema. */
export async function rest<T = unknown>(path: string, init: { method?: string; body?: unknown; schema?: string; prefer?: string } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const profileHeader = method === 'GET' ? 'accept-profile' : 'content-profile'
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      ...serviceHeaders,
      'content-type': 'application/json',
      [profileHeader]: init.schema ?? 'calendar',
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PostgREST ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}

export interface Caller {
  id: string
  admin: boolean
}

/** The signed-in, approved, active member making this request. */
export async function requireMember(req: Request): Promise<Caller> {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in again.')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: serviceHeaders.apikey, authorization } })
  if (!res.ok) throw new HttpError(401, 'Sign in again.')
  const user = (await res.json()) as { id: string }
  const rows = await rest<{ status: string; active: boolean; role: string }[]>(`members?id=eq.${user.id}&select=status,active,role`, { schema: 'public' })
  if (!rows[0] || rows[0].status !== 'approved' || !rows[0].active) throw new HttpError(403, 'Your account isn’t approved yet.')
  return { id: user.id, admin: rows[0].role === 'admin' }
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireMember(req)
  if (!caller.admin) throw new HttpError(403, 'Only admins can do that.')
  return caller
}

// Legacy anon JWT, or the first of the newer sb_publishable_ keys.
const ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? (Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))[0] as string | undefined)

/** PostgREST call as the signed-in member, so RLS and auth.uid() apply. Database errors become HttpErrors. */
export async function userRest<T = unknown>(req: Request, path: string, init: { method?: string; body?: unknown; schema?: string } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY ?? serviceHeaders.apikey,
      authorization: req.headers.get('authorization') ?? '',
      'content-type': 'application/json',
      [method === 'GET' ? 'accept-profile' : 'content-profile']: init.schema ?? 'calendar',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await res.text()
  if (!res.ok) {
    const detail = (() => {
      try {
        return JSON.parse(text) as { message?: string; code?: string }
      } catch {
        return {}
      }
    })()
    const status = detail.code === '42501' ? 403 : detail.code === '23505' ? 409 : res.status >= 500 ? 502 : 400
    throw new HttpError(status, detail.message ?? 'Something went wrong. Try again.')
  }
  return (text ? JSON.parse(text) : null) as T
}

export interface Semester {
  id: string
  name: string
  starts_on: string
  ends_on: string
}

export async function currentSemester(): Promise<Semester> {
  const rows = await rest<Semester[]>('semesters?is_current=eq.true&select=id,name,starts_on,ends_on')
  if (!rows[0]) throw new HttpError(409, 'There is no current semester yet. Ask an admin to start one.')
  return rows[0]
}

export async function downloadUpload(path: string): Promise<Uint8Array> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/schedule-uploads/${path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: serviceHeaders,
  })
  if (!res.ok) throw new HttpError(400, 'Couldn’t open that upload. Try adding it again.')
  return new Uint8Array(await res.arrayBuffer())
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const MAX_FEED_BYTES = 3 * 1024 * 1024

/** Fetches a public calendar feed with a timeout and size cap. https only, no IP-literal hosts. */
export async function fetchFeed(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url.trim().replace(/^webcals?:\/\//i, 'https://'))
  } catch {
    throw new HttpError(400, 'That link isn’t valid.')
  }
  const host = parsed.hostname
  if (parsed.protocol !== 'https:' || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.local')) {
    throw new HttpError(400, 'Use an https:// calendar link.')
  }
  const res = await fetch(parsed, { signal: AbortSignal.timeout(15_000), redirect: 'follow' }).catch(() => {
    throw new HttpError(502, 'Couldn’t reach that calendar. Check the link and try again.')
  })
  if (!res.ok) throw new HttpError(502, `That calendar link returned an error (${res.status}). Check the link and try again.`)
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_FEED_BYTES) throw new HttpError(413, 'That calendar is too large to import.')
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.length
  }
  const text = new TextDecoder().decode(all)
  if (!text.includes('BEGIN:VCALENDAR')) throw new HttpError(400, 'That link isn’t a calendar (.ics) feed.')
  return text
}

export function todayInChapter(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}
