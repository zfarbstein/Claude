import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '../lib/query'
import { cal } from '../lib/supabase'
import type { MemberNight, MemberScheduleView, NightCount, NightDetailRow } from '../lib/types'

export const availabilityKeys = {
  all: ['availability'] as const,
  summary: (start: string, end: string) => ['availability', 'summary', start, end] as const,
  member: (memberId: string, start: string, end: string) => ['availability', 'member', memberId, start, end] as const,
  detail: (night: string) => ['availability', 'detail', night] as const,
  schedule: (memberId: string) => ['member-schedule', memberId] as const,
}

/** Free/busy/unknown counts per night ('yyyy-MM-dd' keys, inclusive). Brothers and admins only. */
export function useNightSummary(start: string, end: string, enabled: boolean) {
  return useQuery({
    queryKey: availabilityKeys.summary(start, end),
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const rows = unwrap(await cal.rpc('night_summary', { p_start: start, p_end: end })) as NightCount[]
      return new Map(rows.map((r) => [r.night, r]))
    },
  })
}

/** One member's nights. Details (reasons) only for yourself or as an admin. */
export function useMemberNights(memberId: string | undefined, start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: availabilityKeys.member(memberId ?? '', start, end),
    enabled: enabled && !!memberId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const rows = unwrap(await cal.rpc('member_nights', { p_member: memberId!, p_start: start, p_end: end })) as unknown as MemberNight[]
      return new Map(rows.map((r) => [r.night, r]))
    },
  })
}

/** Everyone's status for one night, with reasons. Admins only. */
export function useNightDetail(night: string, enabled: boolean) {
  return useQuery({
    queryKey: availabilityKeys.detail(night),
    enabled,
    queryFn: async () => unwrap(await cal.rpc('night_detail', { p_night: night })) as unknown as NightDetailRow[],
  })
}

export function useSetNightMark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { night: string; unavailable: boolean; reason?: string }) =>
      unwrap(
        await cal.rpc('set_night_mark', {
          p_night: args.night,
          p_unavailable: args.unavailable,
          p_reason: args.reason?.trim() || undefined,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKeys.all }),
  })
}

export function useMemberSchedule(memberId: string | undefined) {
  return useQuery({
    queryKey: availabilityKeys.schedule(memberId ?? ''),
    enabled: !!memberId,
    queryFn: async () => unwrap(await cal.rpc('member_schedule', { p_member: memberId! })) as unknown as MemberScheduleView,
  })
}
