import { addMonths, format, getDay } from 'date-fns'
import { fromDayKey, toFormParts } from '../lib/time'
import type { CalendarEvent, EventInput } from '../lib/types'

export type RepeatFreq = 'none' | 'daily' | 'weekly' | 'monthly'

export interface EventFormValues {
  title: string
  category: string
  all_day: boolean
  multi_day: boolean
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  location: string
  description: string
  required: boolean
  hidden_from_associates: boolean
  rsvp_enabled: boolean
  repeat: RepeatFreq
  interval: number
  by_weekday: number[]
  ends: 'count' | 'until'
  count: number
  until: string
}

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>

export function newEventValues(date: string, category: string): EventFormValues {
  const day = fromDayKey(date)
  return {
    title: '',
    category,
    all_day: false,
    multi_day: false,
    start_date: date,
    end_date: date,
    start_time: '19:00',
    end_time: '20:00',
    location: '',
    description: '',
    required: category === 'required',
    hidden_from_associates: false,
    rsvp_enabled: category !== 'required',
    repeat: 'none',
    interval: 1,
    by_weekday: [getDay(day)],
    ends: 'count',
    count: 10,
    until: format(addMonths(day, 3), 'yyyy-MM-dd'),
  }
}

export function editEventValues(e: CalendarEvent): EventFormValues {
  const parts = toFormParts(e)
  return {
    ...newEventValues(parts.start_date, e.category),
    title: e.title,
    all_day: e.all_day,
    multi_day: parts.end_date !== parts.start_date,
    ...parts,
    location: e.location ?? '',
    description: e.description ?? '',
    required: e.required,
    hidden_from_associates: e.hidden_from_associates,
    rsvp_enabled: e.rsvp_enabled,
  }
}

/** Single-day timed event whose end time is at/before its start: the server ends it the next day. */
export const endsNextDay = (v: EventFormValues) =>
  !v.all_day && !v.multi_day && !!v.start_time && !!v.end_time && v.end_time < v.start_time

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function validateEventForm(v: EventFormValues, isEdit = false): EventFormErrors {
  const errors: EventFormErrors = {}
  const title = v.title.trim()
  if (!title) errors.title = 'Add a title.'
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.'
  if (!v.category) errors.category = 'Pick a category.'
  if (!DATE_RE.test(v.start_date)) errors.start_date = 'Pick a date.'
  if (v.multi_day) {
    if (!DATE_RE.test(v.end_date)) errors.end_date = 'Pick an end date.'
    else if (DATE_RE.test(v.start_date)) {
      const span = daysBetween(v.start_date, v.end_date)
      if (span < 0) errors.end_date = 'The end date is before the start date.'
      else if (span > 13) errors.end_date = 'Events can last at most 14 days.'
    }
  }
  if (!v.all_day) {
    if (!TIME_RE.test(v.start_time)) errors.start_time = 'Pick a start time.'
    if (!TIME_RE.test(v.end_time)) errors.end_time = 'Pick an end time.'
    else if (!v.multi_day && v.end_time === v.start_time) errors.end_time = 'The end time must differ from the start time.'
    else if (v.multi_day && v.end_date === v.start_date && v.end_time <= v.start_time)
      errors.end_time = 'The end time must be after the start time.'
  }
  if (v.location.length > 200) errors.location = 'Keep the location under 200 characters.'
  if (v.description.length > 4000) errors.description = 'Keep the description under 4,000 characters.'
  if (!isEdit && v.repeat !== 'none') {
    if (!Number.isInteger(v.interval) || v.interval < 1 || v.interval > 12) errors.interval = 'Use a number from 1 to 12.'
    if (v.repeat === 'weekly' && v.by_weekday.length === 0) errors.by_weekday = 'Pick at least one day.'
    if (v.ends === 'count' && (!Number.isInteger(v.count) || v.count < 1 || v.count > 200))
      errors.count = 'Use a number from 1 to 200.'
    if (v.ends === 'until') {
      if (!DATE_RE.test(v.until)) errors.until = 'Pick the last date.'
      else if (DATE_RE.test(v.start_date) && v.until < v.start_date) errors.until = 'The last date is before the first event.'
    }
  }
  return errors
}

export function toEventInput(v: EventFormValues): EventInput {
  const required = v.required || v.category === 'required'
  return {
    title: v.title.trim(),
    category: v.category,
    start_date: v.start_date,
    end_date: v.multi_day ? v.end_date : null,
    start_time: v.all_day ? '00:00' : v.start_time,
    end_time: v.all_day ? '00:00' : v.end_time,
    all_day: v.all_day,
    location: v.location.trim(),
    description: v.description.trim(),
    required,
    hidden_from_associates: v.hidden_from_associates,
    rsvp_enabled: !required && v.rsvp_enabled,
    recurrence:
      v.repeat === 'none'
        ? null
        : {
            freq: v.repeat,
            interval: v.interval,
            by_weekday: v.repeat === 'weekly' ? [...v.by_weekday].sort() : [],
            until: v.ends === 'until' ? v.until : null,
            count: v.ends === 'count' ? v.count : null,
          },
  }
}
