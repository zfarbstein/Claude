import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { unwrap } from '../lib/query'
import { cal, supabase } from '../lib/supabase'
import type { CalendarEvent, Excuse, Member } from '../lib/types'
import { toJpeg } from '../schedule/images'

export const excuseKeys = {
  mine: (memberId: string) => ['excuses', 'mine', memberId] as const,
  queue: ['excuses', 'queue'] as const,
  all: ['excuses'] as const,
  events: ['excuses', 'events'] as const,
}

export type ExcuseWithEvent = Excuse & { event: Pick<CalendarEvent, 'id' | 'title' | 'starts_at' | 'ends_at' | 'all_day'> | null }

async function attachEvents(rows: Excuse[]): Promise<ExcuseWithEvent[]> {
  if (rows.length === 0) return []
  const events = unwrap(
    await cal.from('events').select('id,title,starts_at,ends_at,all_day').in('id', [...new Set(rows.map((r) => r.event_id))]),
  )
  const byId = new Map(events.map((e) => [e.id, e]))
  return rows.map((r) => ({ ...r, event: byId.get(r.event_id) ?? null }))
}

export function useMyExcuses() {
  const { member } = useAuth()
  return useQuery({
    queryKey: excuseKeys.mine(member?.id ?? ''),
    enabled: !!member,
    queryFn: async () =>
      attachEvents(unwrap(await cal.from('excuses').select('*').eq('member_id', member!.id).order('created_at', { ascending: false }).limit(50))),
  })
}

/** Required events you can still submit an excuse for: from a week ago to two months out. */
export function useExcusableEvents() {
  return useQuery({
    queryKey: excuseKeys.events,
    queryFn: async (): Promise<CalendarEvent[]> =>
      unwrap(
        await cal
          .from('events')
          .select('*')
          .eq('required', true)
          .gte('ends_at', new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
          .lte('starts_at', new Date(Date.now() + 62 * 24 * 3600_000).toISOString())
          .order('starts_at')
          .limit(100),
      ),
  })
}

export type QueueItem = ExcuseWithEvent & { member: Pick<Member, 'id' | 'name' | 'email'> | null }

/** Admins: every excuse, newest first, with names and events. */
export function useExcuseQueue() {
  return useQuery({
    queryKey: excuseKeys.queue,
    queryFn: async (): Promise<QueueItem[]> => {
      const rows = await attachEvents(unwrap(await cal.from('excuses').select('*').order('created_at', { ascending: false }).limit(300)))
      if (rows.length === 0) return []
      const members = unwrap(await supabase.from('members').select('id,name,email').in('id', [...new Set(rows.map((r) => r.member_id))]))
      const byId = new Map(members.map((m) => [m.id, m]))
      return rows.map((r) => ({ ...r, member: byId.get(r.member_id) ?? null }))
    },
  })
}

export async function uploadAttachment(memberId: string, file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const blob = isPdf ? file : await toJpeg(file)
  const path = `${memberId}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`
  const { error } = await supabase.storage.from('excuse-attachments').upload(path, blob, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

/** Saves the excuse and emails the secretary (Edge Function submit-excuse). */
export function useSubmitExcuse() {
  const qc = useQueryClient()
  const { member } = useAuth()
  return useMutation({
    mutationFn: async (args: { eventId: string; reason: string; file: File | null }) => {
      const path = args.file ? await uploadAttachment(member!.id, args.file) : null
      const { data, error } = await supabase.functions.invoke('submit-excuse', {
        body: { event_id: args.eventId, reason: args.reason, attachment_path: path },
      })
      if (error) {
        const context = (error as { context?: Response }).context
        const detail = context ? await context.json().catch(() => null) : null
        throw new Error(detail?.error ?? 'Couldn’t send your excuse. Check your connection and try again.')
      }
      return data as { excuse: Excuse; emailed: boolean }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: excuseKeys.all }),
  })
}

export function useReviewExcuse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; approve: boolean; note: string }) =>
      unwrap(await cal.rpc('review_excuse', { p_excuse_id: args.id, p_approve: args.approve, p_note: args.note.trim() || undefined })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: excuseKeys.all })
      void qc.invalidateQueries({ queryKey: ['attendance'] })
      // Tell the member now instead of at the next 5-minute run.
      void supabase.functions.invoke('send-notifications', { body: {} }).catch(() => undefined)
    },
  })
}

/** A private file (excuse proof, schedule photo) as a temporary object URL. */
export async function openPrivateFile(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) throw new Error('That file isn’t available anymore.')
  return URL.createObjectURL(data)
}
