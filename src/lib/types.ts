import type { Database } from './database.types'

export type Member = Database['public']['Tables']['members']['Row']
export type MemberRole = Database['public']['Enums']['member_role']
export type MemberType = Database['public']['Enums']['member_type']
export type MemberStatus = Database['public']['Enums']['member_status']
export type CalendarEvent = Database['calendar']['Tables']['events']['Row']
export type Category = Database['calendar']['Tables']['categories']['Row']
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
