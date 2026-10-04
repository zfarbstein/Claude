import type { CalendarEvent, Member } from './types'

// UI mirror of the RLS rules. The database enforces these; the UI only hides what would fail.

export const isActiveMember = (m: Member | null | undefined): boolean => !!m && m.status === 'approved' && m.active

export const isAdmin = (m: Member | null | undefined) => !!m && isActiveMember(m) && m.role === 'admin'

export const isBrother = (m: Member | null | undefined) => !!m && isActiveMember(m) && m.member_type === 'brother'

export const isAssociate = (m: Member | null | undefined) => !!m && isActiveMember(m) && m.member_type === 'associate'

export function manageableCategories(m: Member | null | undefined, chairCategories: string[], all: string[]): string[] {
  if (!m || !isActiveMember(m)) return []
  if (m.role === 'admin') return all
  if (m.role === 'chair') return all.filter((k) => chairCategories.includes(k))
  return []
}

export function canManageEvent(m: Member | null | undefined, chairCategories: string[], e: Pick<CalendarEvent, 'category'>) {
  if (!m || !isActiveMember(m)) return false
  return m.role === 'admin' || (m.role === 'chair' && chairCategories.includes(e.category))
}

export function canRsvp(e: Pick<CalendarEvent, 'required' | 'rsvp_enabled' | 'ends_at'>, now = Date.now()) {
  return !e.required && e.rsvp_enabled && new Date(e.ends_at).getTime() > now
}

export const ROLE_LABELS = { admin: 'Admin', chair: 'Chair', member: 'Member' } as const
export const TYPE_LABELS = { brother: 'Brother', associate: 'Associate Member' } as const
