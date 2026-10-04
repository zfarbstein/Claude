import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { unwrap } from '../lib/query'
import { cal, supabase } from '../lib/supabase'
import type { Audience, HubApp, NotificationRow } from '../lib/types'

export const notificationKeys = {
  unread: (memberId: string) => ['inbox', 'unread', memberId] as const,
  inbox: (memberId: string) => ['inbox', 'list', memberId] as const,
  all: ['inbox'] as const,
  admin: ['notifications', 'admin'] as const,
  apps: ['hub-apps'] as const,
}

export function useUnreadCount() {
  const { member } = useAuth()
  return useQuery({
    queryKey: notificationKeys.unread(member?.id ?? ''),
    enabled: !!member,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await cal
        .from('notification_inbox')
        .select('notification_id', { count: 'exact', head: true })
        .eq('member_id', member!.id)
        .is('read_at', null)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
  })
}

export interface InboxItem extends Pick<NotificationRow, 'id' | 'title' | 'body' | 'url' | 'kind'> {
  read_at: string | null
  created_at: string
}

export function useInbox() {
  const { member } = useAuth()
  return useQuery({
    queryKey: notificationKeys.inbox(member?.id ?? ''),
    enabled: !!member,
    queryFn: async (): Promise<InboxItem[]> => {
      const rows = unwrap(
        await cal
          .from('notification_inbox')
          .select('notification_id,read_at,created_at')
          .eq('member_id', member!.id)
          .order('created_at', { ascending: false })
          .limit(60),
      )
      if (rows.length === 0) return []
      const notes = unwrap(await cal.from('notifications').select('id,title,body,url,kind').in('id', rows.map((r) => r.notification_id)))
      const byId = new Map(notes.map((n) => [n.id, n]))
      return rows.flatMap((r) => {
        const n = byId.get(r.notification_id)
        return n ? [{ ...n, read_at: r.read_at, created_at: r.created_at }] : []
      })
    },
  })
}

export function useMarkInboxRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await cal.rpc('mark_inbox_read', {})),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useHubApps() {
  return useQuery({
    queryKey: notificationKeys.apps,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<HubApp[]> => unwrap(await supabase.from('hub_apps').select('*').order('sort_order').order('name')),
  })
}

export interface SendInput {
  title: string
  body: string
  audience: Audience
  memberIds?: string[]
  /** ISO time to send later; omit to send now. */
  sendAt?: string | null
  url?: string
}

/** Admins: queue a notification and, when it's for now, deliver it right away. */
export function useSendNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SendInput) => {
      const row = unwrap(
        await cal.rpc('send_notification', {
          p_title: input.title,
          p_body: input.body,
          p_audience: input.audience,
          p_member_ids: input.memberIds ?? [],
          p_send_at: input.sendAt ?? undefined,
          p_url: input.url ?? '/',
        }),
      )
      if (!input.sendAt) await deliverNow()
      return row
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.admin })
      void qc.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

/** Runs the sender now instead of waiting for the 5-minute schedule. */
export async function deliverNow(): Promise<void> {
  const { error } = await supabase.functions.invoke('send-notifications', { body: {} })
  if (error) throw new Error('Saved, but sending failed. It will go out within 5 minutes.')
}

export function useNotificationHistory() {
  return useQuery({
    queryKey: notificationKeys.admin,
    refetchInterval: 15_000,
    queryFn: async (): Promise<NotificationRow[]> =>
      unwrap(await cal.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
  })
}

export function useCancelNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await cal.rpc('cancel_notification', { p_id: id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.admin }),
  })
}
