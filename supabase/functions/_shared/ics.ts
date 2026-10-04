// RFC 5545 calendar builder. No imports so it runs in Deno (Edge Functions) and Vitest.

export interface FeedEvent {
  id: string
  title: string
  category_label: string
  starts_at: string
  ends_at: string
  all_day: boolean
  location: string | null
  description: string | null
  required: boolean
  updated_at: string
}

export interface CalendarOptions {
  name: string
  timeZone: string
  uidDomain: string
  now?: Date
}

const encoder = new TextEncoder()

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Folds a content line to 75 octets per line without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let currentBytes = 0
  let limit = 75
  for (const ch of line) {
    const size = encoder.encode(ch).length
    if (currentBytes + size > limit) {
      parts.push(current)
      current = ch
      currentBytes = size
      limit = 74 // continuation lines start with a space
    } else {
      current += ch
      currentBytes += size
    }
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function utcStamp(value: string | Date): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** YYYYMMDD of an instant in the given zone. */
export function localDateStamp(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}${get('month')}${get('day')}`
}

export function buildCalendar(events: FeedEvent[], opts: CalendarOptions): string {
  const now = utcStamp(opts.now ?? new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chapter Hub//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `X-WR-TIMEZONE:${opts.timeZone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@${opts.uidDomain}`, `DTSTAMP:${now}`)
    lines.push(`LAST-MODIFIED:${utcStamp(e.updated_at)}`)
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${localDateStamp(e.starts_at, opts.timeZone)}`)
      lines.push(`DTEND;VALUE=DATE:${localDateStamp(e.ends_at, opts.timeZone)}`)
    } else {
      lines.push(`DTSTART:${utcStamp(e.starts_at)}`, `DTEND:${utcStamp(e.ends_at)}`)
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`, `CATEGORIES:${escapeText(e.category_label)}`)
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`)
    const description = [e.required ? 'Required chapter event.' : '', e.description ?? '']
      .filter(Boolean)
      .join('\n\n')
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`)
    lines.push('TRANSP:OPAQUE', 'END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
