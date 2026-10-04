import { describe, expect, it } from 'vitest'
import {
  dayKey,
  eventsByDay,
  formatTimeRange,
  isMultiDayOrAllDay,
  layoutDay,
  monthGridDays,
  toFormParts,
  weekDays,
} from './time'

// Vitest runs with TZ=America/Los_Angeles so these prove we use chapter time, not device time.
const ev = (starts_at: string, ends_at: string, all_day = false, id = starts_at) => ({ id, starts_at, ends_at, all_day })

describe('month and week grids', () => {
  it('covers whole Sun–Sat weeks around the month', () => {
    const days = monthGridDays(new Date('2027-01-15T17:00:00Z'))
    expect(days.length % 7).toBe(0)
    expect(dayKey(days[0])).toBe('2026-12-27')
    expect(dayKey(days[days.length - 1])).toBe('2027-02-06')
    expect(days.every((d) => d.getHours() === 0)).toBe(true)
  })

  it('builds a Sunday-first week', () => {
    const days = weekDays(new Date('2026-11-04T16:00:00Z'))
    expect(days.map(dayKey)).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ])
  })
})

describe('eventsByDay', () => {
  it('uses chapter time for the day boundary', () => {
    // 11:30 PM Eastern on Jan 15 is still Jan 15 in Gainesville (8:30 PM in LA).
    const map = eventsByDay([ev('2027-01-16T04:30:00Z', '2027-01-16T05:00:00Z')])
    expect([...map.keys()]).toEqual(['2027-01-15'])
  })

  it('puts overnight events on both days but not a day they end exactly at midnight', () => {
    const overnight = ev('2027-01-16T02:00:00Z', '2027-01-16T06:00:00Z') // 9 PM – 1 AM
    const toMidnight = ev('2027-01-17T02:00:00Z', '2027-01-17T05:00:00Z') // 9 PM – 12 AM
    const map = eventsByDay([overnight, toMidnight])
    expect(map.get('2027-01-15')).toEqual([overnight])
    expect(map.get('2027-01-16')).toEqual([overnight, toMidnight])
    expect(map.has('2027-01-17')).toBe(false)
  })

  it('spreads all-day multi-day events and sorts all-day first', () => {
    const allDay = ev('2027-03-06T05:00:00Z', '2027-03-08T05:00:00Z', true, 'a') // Mar 6–7
    const timed = ev('2027-03-06T14:00:00Z', '2027-03-06T15:00:00Z', false, 't')
    const map = eventsByDay([timed, allDay])
    expect(map.get('2027-03-06')?.map((e) => e.id)).toEqual(['a', 't'])
    expect(map.get('2027-03-07')?.map((e) => e.id)).toEqual(['a'])
    expect(map.has('2027-03-08')).toBe(false)
  })
})

describe('formatTimeRange', () => {
  it('formats common shapes', () => {
    expect(formatTimeRange(ev('2027-01-16T00:00:00Z', '2027-01-16T01:30:00Z'))).toBe('7 – 8:30 PM')
    expect(formatTimeRange(ev('2027-01-16T02:00:00Z', '2027-01-16T06:00:00Z'))).toBe('9 PM – 1 AM')
    expect(formatTimeRange(ev('2027-01-15T16:00:00Z', '2027-01-15T20:00:00Z'))).toBe('11 AM – 3 PM')
    expect(formatTimeRange(ev('2027-01-15T05:00:00Z', '2027-01-16T05:00:00Z', true))).toBe('All day')
    expect(formatTimeRange(ev('2027-01-15T05:00:00Z', '2027-01-17T05:00:00Z', true))).toBe('Fri Jan 15 – Sat Jan 16')
  })

  it('shows dates when a timed event runs into a second day', () => {
    expect(formatTimeRange(ev('2027-01-16T01:00:00Z', '2027-01-16T19:00:00Z'))).toBe('Fri Jan 15, 8 PM – Sat Jan 16, 2 PM')
  })

  it('keeps wall-clock times across the DST change', () => {
    // Nov 1 2026: clocks fall back. 7 PM EST = 00:00Z next day.
    expect(formatTimeRange(ev('2026-11-02T00:00:00Z', '2026-11-02T01:30:00Z'))).toBe('7 – 8:30 PM')
  })
})

describe('toFormParts', () => {
  it('round-trips an overnight event as one date', () => {
    expect(toFormParts(ev('2027-01-16T02:00:00Z', '2027-01-16T06:00:00Z'))).toEqual({
      start_date: '2027-01-15', end_date: '2027-01-15', start_time: '21:00', end_time: '01:00',
    })
  })
  it('uses the last day (not the exclusive end) for all-day events', () => {
    expect(toFormParts(ev('2027-01-15T05:00:00Z', '2027-01-17T05:00:00Z', true))).toMatchObject({
      start_date: '2027-01-15', end_date: '2027-01-16',
    })
  })
})

describe('isMultiDayOrAllDay', () => {
  it('is true for all-day and 24h+ events only', () => {
    expect(isMultiDayOrAllDay(ev('2027-01-15T05:00:00Z', '2027-01-16T05:00:00Z', true))).toBe(true)
    expect(isMultiDayOrAllDay(ev('2027-01-16T02:00:00Z', '2027-01-16T06:00:00Z'))).toBe(false)
    expect(isMultiDayOrAllDay(ev('2027-01-16T01:00:00Z', '2027-01-17T02:00:00Z'))).toBe(true)
  })
})

describe('layoutDay', () => {
  const day = new Date('2027-01-15T17:00:00Z')
  it('positions by chapter-time minutes and clamps at midnight', () => {
    const [item] = layoutDay([ev('2027-01-16T02:00:00Z', '2027-01-16T06:00:00Z')], day)
    expect(item.top).toBe(21 * 60)
    expect(item.height).toBe(3 * 60)
  })
  it('splits overlapping events into columns', () => {
    const a = ev('2027-01-15T23:00:00Z', '2027-01-16T01:00:00Z', false, 'a') // 6–8 PM
    const b = ev('2027-01-16T00:00:00Z', '2027-01-16T01:00:00Z', false, 'b') // 7–8 PM
    const c = ev('2027-01-16T02:00:00Z', '2027-01-16T03:00:00Z', false, 'c') // 9–10 PM
    const items = layoutDay([c, b, a], day)
    const byId = Object.fromEntries(items.map((i) => [i.event.id, i]))
    expect([byId.a.column, byId.a.columns]).toEqual([0, 2])
    expect([byId.b.column, byId.b.columns]).toEqual([1, 2])
    expect([byId.c.column, byId.c.columns]).toEqual([0, 1])
  })
  it('ignores all-day events', () => {
    expect(layoutDay([ev('2027-01-15T05:00:00Z', '2027-01-16T05:00:00Z', true)], day)).toEqual([])
  })
})
