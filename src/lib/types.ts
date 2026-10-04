import type { Database } from './database.types'

export type Member = Database['public']['Tables']['members']['Row']
export type MemberRole = Database['public']['Enums']['member_role']
export type MemberType = Database['public']['Enums']['member_type']
export type MemberStatus = Database['public']['Enums']['member_status']
export type CalendarEvent = Database['calendar']['Tables']['events']['Row']
export type Category = Database['calendar']['Tables']['categories']['Row']
export type Semester = Database['calendar']['Tables']['semesters']['Row']
export type Submission = Database['calendar']['Tables']['schedule_submissions']['Row']
export type WeeklyBlockRow = Database['calendar']['Tables']['weekly_blocks']['Row']
export type DatedItemRow = Database['calendar']['Tables']['dated_items']['Row']

/** What the calendar draws: chapter events, plus the member's own exams and one-off obligations. */
export type DisplayEvent = CalendarEvent & { personal?: { kind: 'exam' | 'obligation'; course: string | null } }
export type RsvpStatus = 'going' | 'maybe' | 'not_going'
export type Rsvp = { event_id: string; member_id: string; status: RsvpStatus }

export interface RecurrenceInput {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  by_weekday: number[]
  until: string | null
  count: number | null
}

/** Payload for calendar.create_event / calendar.update_event (local chapter time). */
export interface EventInput {
  title: string
  category: string
  start_date: string
  end_date: string | null
  start_time: string
  end_time: string
  all_day: boolean
  location: string
  description: string
  required: boolean
  hidden_from_associates: boolean
  rsvp_enabled: boolean
  recurrence: RecurrenceInput | null
}
