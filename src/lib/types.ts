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

export type Settings = Database['calendar']['Tables']['settings']['Row']
export type AttendanceRow = Database['calendar']['Tables']['attendance']['Row']
export type AttendanceStatus = 'present' | 'absent' | 'excused'
export type Excuse = Database['calendar']['Tables']['excuses']['Row']
export type NotificationRow = Database['calendar']['Tables']['notifications']['Row']
export type InboxRow = Database['calendar']['Tables']['notification_inbox']['Row']
export type HubApp = Database['public']['Tables']['hub_apps']['Row']
export type ScheduleUpload = Database['calendar']['Tables']['schedule_uploads']['Row']

export type NightStatus = 'free' | 'busy' | 'unknown'

/** Why a member is busy on a night: a mark (label = their reason), a class, an obligation or an exam. */
export interface NightReason {
  kind: 'mark' | 'class' | 'obligation' | 'exam'
  label: string | null
  start?: string | null
  end?: string | null
}

export interface NightCount {
  night: string
  free: number
  busy: number
  unknown: number
  total: number
}

export interface MemberNight {
  night: string
  status: NightStatus
  reasons: NightReason[]
  marked: boolean
  mark_reason: string | null
  required_event_id: string | null
  required_event_title: string | null
}

export interface NightDetailRow {
  member_id: string
  name: string
  member_type: MemberType
  status: NightStatus
  reasons: NightReason[]
}

/** calendar.member_schedule(): labels are null when the viewer only gets busy times. */
export interface MemberScheduleView {
  semester: { id: string; name: string; starts_on: string; ends_on: string } | null
  submitted: boolean
  detailed: boolean
  blocks: { weekday: number; start: string; end: string; kind: string | null; category: string | null; label: string | null; location: string | null }[]
  items: { starts_at: string; ends_at: string; all_day: boolean; kind: string | null; title: string | null; course: string | null }[]
}

export interface RosterRow {
  member_id: string
  name: string
  member_type: MemberType
  pledge_class: string | null
  status: AttendanceStatus | null
  method: string | null
  marked_at: string | null
  excuse_status: string | null
}

export interface AttendanceReport {
  events: { id: string; title: string; category: string; starts_at: string; ends_at: string; required: boolean }[]
  members: { id: string; name: string; member_type: MemberType; pledge_class: string | null }[]
  cells: { e: string; m: string; s: AttendanceStatus; r: boolean }[]
}

export type Audience = 'everyone' | 'brothers' | 'pledges' | 'members' | 'unsubmitted'
