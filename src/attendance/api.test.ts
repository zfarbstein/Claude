import { describe, expect, it } from 'vitest'
import { attendancePercent, checkinOpen, parseCheckinUrl } from './api'

describe('attendance helpers', () => {
  it('computes attendance without counting excused events', () => {
    expect(attendancePercent(['present', 'present', 'absent', 'excused'])).toBe(67)
    expect(attendancePercent(['excused'])).toBeNull()
    expect(attendancePercent([])).toBeNull()
  })
  it('opens check-in 15 minutes early until the end', () => {
    const e = { starts_at: '2026-10-11T23:00:00Z', ends_at: '2026-10-12T00:30:00Z', all_day: false }
    expect(checkinOpen(e, Date.parse('2026-10-11T22:44:00Z'))).toBe(false)
    expect(checkinOpen(e, Date.parse('2026-10-11T22:46:00Z'))).toBe(true)
    expect(checkinOpen(e, Date.parse('2026-10-12T00:31:00Z'))).toBe(false)
    expect(checkinOpen({ ...e, all_day: true }, Date.parse('2026-10-11T23:10:00Z'))).toBe(false)
  })
  it('reads check-in QR codes', () => {
    expect(parseCheckinUrl('https://cal.example.com/checkin?e=abc&c=123456')).toEqual({ eventId: 'abc', code: '123456' })
    expect(parseCheckinUrl('https://cal.example.com/other?e=abc&c=1')).toBeNull()
    expect(parseCheckinUrl('not a url')).toBeNull()
  })
})
