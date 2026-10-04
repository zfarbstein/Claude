import { useQuery } from '@tanstack/react-query'
import { unwrap } from '../lib/query'
import { cal, supabase } from '../lib/supabase'
import type { Member } from '../lib/types'

export type DirectoryMember = Pick<Member, 'id' | 'name' | 'email' | 'role' | 'member_type' | 'pledge_class'>

/** Approved, active members. RLS limits this to brothers and admins (pledges only see themselves). */
export function useDirectory() {
  return useQuery({
    queryKey: ['directory'],
    queryFn: async (): Promise<DirectoryMember[]> =>
      unwrap(
        await supabase
          .from('members')
          .select('id,name,email,role,member_type,pledge_class')
          .eq('status', 'approved')
          .eq('active', true)
          .order('name'),
      ),
  })
}

/** Admins: which members finished this semester's schedule (member id -> completed). */
export function useSubmissionMap(semesterId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['submission-map', semesterId],
    enabled: enabled && !!semesterId,
    queryFn: async () => {
      const rows = unwrap(await cal.from('schedule_submissions').select('member_id,completed').eq('semester_id', semesterId!))
      return new Map(rows.map((r) => [r.member_id, !!r.completed]))
    },
  })
}
