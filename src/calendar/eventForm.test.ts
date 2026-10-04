import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../lib/types'
import { editEventValues, endsNextDay, newEventValues, toEventInput, validateEventForm } from './eventForm'

describe('event form', () => {
  it('defaults to an evening event on the chosen day, repeating on that weekday', () => {
    const v = newEventValues('2027-01-13', 'social') // a Wednesday
    expect(v).toMatchObject({ start_date: '2027-01-13', start_time: '19:00', end_time: '20:00', by_weekday: [3], until: '2027-04-13' })
    expect(newEventValues('2027-01-13', 'required')).toMatchObject({ required: true, rsvp_enabled: false })
  })

  it('validates required fields and ranges', () => {
    const v = { ...newEventValues('2027-01-13', 'social'), title: ' ', end_time: '19:00' }
    expect(validateEventForm(v)).toMatchObject({ title: expect.any(String), end_time: expect.any(String) })
    const repeat = { ...newEventValues('2027-01-13', 'social'), title: 'x', repeat: 'weekly' as const, by_weekday: [], ends: 'until' as const, until: '2027-01-01' }
    expect(Object.keys(validateEventForm(repeat)).sort()).toEqual(['by_weekday', 'until'])
    const long = { ...newEventValues('2027-01-13', 'social'), title: 'x', multi_day: true, end_date: '2027-01-30' }
    expect(validateEventForm(long).end_date).toMatch(/14 days/)
  })

  it('allows overnight single-day events and flags them', () => {
    const v = { ...newEventValues('2027-01-15', 'social'), title: 'Party', start_time: '21:00', end_time: '01:00' }
    expect(validateEventForm(v)).toEqual({})
    expect(endsNextDay(v)).toBe(true)
  })

  it('builds the RPC payload', () => {
    const v = { ...newEventValues('2027-01-13', 'required'), title: '  Chapter  ', repeat: 'weekly' as const, by_weekday: [3, 0], count: 4 }
    expect(toEventInput(v)).toEqual({
      title: 'Chapter', category: 'required', start_date: '2027-01-13', end_date: null, start_time: '19:00', end_time: '20:00',
      all_day: false, location: '', description: '', required: true, hidden_from_associates: false, rsvp_enabled: false,
      recurrence: { freq: 'weekly', interval: 1, by_weekday: [0, 3], until: null, count: 4 },
    })
  })

  it('loads an existing event back into the form', () => {
    const e = {
      id: '1', series_id: null, title: 'Formal', category: 'social', starts_at: '2027-01-16T01:00:00Z', ends_at: '2027-01-16T05:30:00Z',
      all_day: false, location: 'Hilton', description: null, required: false, hidden_from_associates: true, rsvp_enabled: true,
      created_by: null, created_at: '', updated_at: '',
    } satisfies CalendarEvent
    expect(editEventValues(e)).toMatchObject({
      title: 'Formal', start_date: '2027-01-15', end_date: '2027-01-15', multi_day: false, start_time: '20:00', end_time: '00:30',
      location: 'Hilton', description: '', hidden_from_associates: true,
    })
  })
})
