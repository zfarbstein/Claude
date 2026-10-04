import { describe, expect, it } from 'vitest'
import { buildCalendar, escapeText, foldLine, localDateStamp, utcStamp, type FeedEvent } from './ics'

const base: FeedEvent = {
  id: 'abc', title: 'Chapter Meeting', category_label: 'Required Chapter Event', starts_at: '2027-01-11T00:00:00Z',
  ends_at: '2027-01-11T01:30:00Z', all_day: false, location: 'House; Room 1, Floor 2', description: 'Line 1\nLine 2',
  required: true, updated_at: '2027-01-01T12:00:00Z',
}

describe('ics', () => {
  it('escapes text per RFC 5545', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
  })

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = 'DESCRIPTION:' + 'é'.repeat(100)
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line)
  })

  it('formats instants and all-day dates', () => {
    expect(utcStamp('2027-01-11T00:00:00.000Z')).toBe('20270111T000000Z')
    expect(localDateStamp('2027-01-15T05:00:00Z', 'America/New_York')).toBe('20270115')
  })

  it('builds a valid calendar', () => {
    const allDay: FeedEvent = { ...base, id: 'def', all_day: true, starts_at: '2027-01-15T05:00:00Z', ends_at: '2027-01-17T05:00:00Z', required: false, description: null, location: null }
    const ics = buildCalendar([base, allDay], { name: 'Test, Cal', timeZone: 'America/New_York', uidDomain: 'x', now: new Date('2027-01-01T00:00:00Z') })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('X-WR-CALNAME:Test\\, Cal')
    expect(ics).toContain('UID:abc@x')
    expect(ics).toContain('DTSTART:20270111T000000Z')
    expect(ics).toContain('LOCATION:House\\; Room 1\\, Floor 2')
    expect(ics).toContain('DESCRIPTION:Required chapter event.\\n\\nLine 1\\nLine 2')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270115')
    expect(ics).toContain('DTEND;VALUE=DATE:20270117')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })
})
