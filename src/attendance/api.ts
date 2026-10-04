import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '../lib/query'
import { cal } from '../lib/supabase'
import type { AttendanceReport, AttendanceStatus, CalendarEvent, RosterRow } from '../lib/types'

export const attendanceKeys = {
  roster: (eventId: string) => ['attendance', 'roster', eventId] as const,
  code: (eventId: string) => ['attendance', 'code', eventId] as const,
  open: ['attendance', 'open'] as const,
  report: (from: string, to: string, category: string) => ['attendance', 'report', from, to, category] as const,
  all: ['attendance'] as const,
}

/** Members can check in from 15 minutes before an event starts until it ends. */
export const CHECKIN_LEAD_MS = 15 * 60_000
export const checkinOpen = (e: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>, now = Date.now()) =>
  !e.all_day && now >= Date.parse(e.starts_at) - CHECKIN_LEAD_MS && now <= Date.parse(e.ends_at)

export interface CheckinCode {
  code: string | null
  expires_at: string
  opens_at: string
  closes_at: string
}

/** The rotating code for the door. Refetches as each 30-second code expires. */
export function useCheckinCode(eventId: string) {
  return useQuery({
    queryKey: attendanceKeys.code(eventId),
    queryFn: async (): Promise<CheckinCode> => {
      const rows = unwrap(await cal.rpc('checkin_code', { p_event_id: eventId })) as CheckinCode[]
      return rows[0]
    },
    staleTime: 0,
    refetchInterval: (q) => {
      const expires = q.state.data ? Date.parse(q.state.data.expires_at) : 0
      return Math.min(30_000, Math.max(500, expires - Date.now() + 250))
    },
    refetchIntervalInBackground: true,
  })
}

export function useRoster(eventId: string) {
  return useQuery({
    queryKey: attendanceKeys.roster(eventId),
    queryFn: async () => unwrap(await cal.rpc('event_roster', { p_event_id: eventId })) as unknown as RosterRow[],
    refetchInterval: 5000,
  })
}

export function useSetAttendance(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ memberId, status }: { memberId: string; status: AttendanceStatus | null }) =>
      unwrap(await cal.rpc('set_attendance', { p_event_id: eventId, p_member_id: memberId, p_status: status as string })),
    onMutate: async ({ memberId, status }) => {
      await qc.cancelQueries({ queryKey: attendanceKeys.roster(eventId) })
      const previous = qc.getQueryData<RosterRow[]>(attendanceKeys.roster(eventId))
      qc.setQueryData<RosterRow[]>(attendanceKeys.roster(eventId), (rows) =>
        rows?.map((r) => (r.member_id === memberId ? { ...r, status, method: status ? 'manual' : null } : r)),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(attendanceKeys.roster(eventId), ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: attendanceKeys.all }),
  })
}

export interface CheckinResult {
  ok: boolean
  message: string
  title?: string
}

export async function checkIn(eventId: string, code: string): Promise<CheckinResult> {
  return unwrap(await cal.rpc('check_in', { p_event_id: eventId, p_code: code })) as unknown as CheckinResult
}

export function useOpenCheckins() {
  return useQuery({
    queryKey: attendanceKeys.open,
    queryFn: async (): Promise<CalendarEvent[]> => unwrap(await cal.rpc('open_checkins')),
    refetchInterval: 60_000,
  })
}

export function useAttendanceReport(from: string, to: string, category: string) {
  return useQuery({
    queryKey: attendanceKeys.report(from, to, category),
    enabled: !!from && !!to && from <= to,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      unwrap(
        await cal.rpc('attendance_report', { p_from: from, p_to: to, p_categories: category === 'all' ? undefined : [category] }),
      ) as unknown as AttendanceReport,
  })
}

/** Present / (present + absent); excused events don't count either way. */
export function attendancePercent(statuses: AttendanceStatus[]): number | null {
  const present = statuses.filter((s) => s === 'present').length
  const absent = statuses.filter((s) => s === 'absent').length
  return present + absent === 0 ? null : Math.round((present / (present + absent)) * 100)
}

/** Parses a scanned QR code: https://<app>/checkin?e=<event>&c=<code> */
export function parseCheckinUrl(text: string): { eventId: string; code: string } | null {
  try {
    const url = new URL(text)
    const eventId = url.searchParams.get('e')
    const code = url.searchParams.get('c')
    if (!url.pathname.endsWith('/checkin') || !eventId || !code) return null
    return { eventId, code }
  } catch {
    return null
  }
}
