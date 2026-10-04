import type { CalendarEvent, Member, MemberRole, MemberType } from './types'

// UI mirror of the RLS rules. The database enforces these; the UI only hides what would fail.
// There are three views: admin (exec), brother and pledge (associate member).

export type Access = 'admin' | 'brother' | 'pledge'

export const ACCESS_LABELS: Record<Access, string> = { admin: 'Admin', brother: 'Brother', pledge: 'Pledge' }

export const isActiveMember = (m: Member | null | undefined): boolean => !!m && m.status === 'approved' && m.active

export const isAdmin = (m: Member | null | undefined) => !!m && isActiveMember(m) && m.role === 'admin'

export const isBrother = (m: Member | null | undefined) => !!m && isActiveMember(m) && m.member_type === 'brother'

export const isPledge = (m: Member | null | undefined) => !!m && isActiveMember(m) && m.member_type === 'associate'

export function accessOf(m: Pick<Member, 'role' | 'member_type'>): Access {
  if (m.member_type === 'associate') return 'pledge'
  return m.role === 'admin' ? 'admin' : 'brother'
}

export function accessFields(access: Access): { role: MemberRole; member_type: MemberType } {
  if (access === 'admin') return { role: 'admin', member_type: 'brother' }
  if (access === 'brother') return { role: 'member', member_type: 'brother' }
  return { role: 'member', member_type: 'associate' }
}

/** Only admins create, edit and delete chapter events. */
export const canManageEvents = (m: Member | null | undefined) => isAdmin(m)

export function canRsvp(e: Pick<CalendarEvent, 'required' | 'rsvp_enabled' | 'ends_at'>, now = Date.now()) {
  return !e.required && e.rsvp_enabled && new Date(e.ends_at).getTime() > now
}
