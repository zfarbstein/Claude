import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { cal, supabase } from '../lib/supabase'
import type { CalendarEvent, Category, EventInput, Member, Rsvp, RsvpStatus } from '../lib/types'

export const calendarKeys = {
  categories: ['categories'] as const,
  events: (start: string, end: string) => ['events', start, end] as const,
  allEvents: ['events'] as const,
  myRsvps: (memberId: string) => ['rsvps', 'mine', memberId] as const,
  eventRsvps: (eventId: string) => ['rsvps', 'event', eventId] as const,
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export function useCategories() {
  return useQuery({
    queryKey: calendarKeys.categories,
    queryFn: async (): Promise<Category[]> =>
      unwrap(await cal.from('categories').select('*').order('sort_order')),
    placeholderData: DEFAULT_CATEGORIES,
    staleTime: 10 * 60_000,
  })
}

/** Events overlapping [start, end). */
export function useEvents(start: Date, end: Date) {
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  return useQuery({
    queryKey: calendarKeys.events(startIso, endIso),
    queryFn: async (): Promise<CalendarEvent[]> =>
      unwrap(
        await cal
          .from('events')
          .select('*')
          .lt('starts_at', endIso)
          .gt('ends_at', startIso)
          .order('starts_at')
          .limit(2000),
      ),
    placeholderData: (prev) => prev,
  })
}

export function useMyRsvps(memberId: string | undefined) {
  return useQuery({
    queryKey: calendarKeys.myRsvps(memberId ?? ''),
    enabled: !!memberId,
    queryFn: async (): Promise<Map<string, RsvpStatus>> => {
      const rows = unwrap(await cal.from('rsvps').select('event_id,status').eq('member_id', memberId!))
      return new Map(rows.map((r) => [r.event_id, r.status as RsvpStatus]))
    },
  })
}

export type EventRsvp = Rsvp & { name: string }

/** Everyone's RSVPs for one event. RLS returns only your own row to associates. */
export function useEventRsvps(eventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: calendarKeys.eventRsvps(eventId ?? ''),
    enabled: !!eventId && enabled,
    queryFn: async (): Promise<EventRsvp[]> => {
      const rows = unwrap(await cal.from('rsvps').select('event_id,member_id,status').eq('event_id', eventId!))
      if (rows.length === 0) return []
      const members = unwrap(
        await supabase.from('members').select('id,name').in('id', rows.map((r) => r.member_id)),
      ) as Pick<Member, 'id' | 'name'>[]
      const names = new Map(members.map((m) => [m.id, m.name]))
      return rows
        .map((r) => ({ ...r, status: r.status as RsvpStatus, name: names.get(r.member_id) ?? 'Member' }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  })
}

export function useSetRsvp(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: RsvpStatus | null }) => {
      if (status === null) {
        unwrap(await cal.from('rsvps').delete().eq('event_id', eventId).eq('member_id', memberId))
      } else {
        unwrap(
          await cal
            .from('rsvps')
            .upsert({ event_id: eventId, member_id: memberId, status }, { onConflict: 'event_id,member_id' }),
        )
      }
    },
    onSuccess: (_d, { eventId }) => {
      void qc.invalidateQueries({ queryKey: calendarKeys.myRsvps(memberId) })
      void qc.invalidateQueries({ queryKey: calendarKeys.eventRsvps(eventId) })
    },
  })
}

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id?: string; input: EventInput; scope?: 'single' | 'following' }) => {
      const p = JSON.parse(JSON.stringify(args.input))
      const rows = args.id
        ? unwrap(await cal.rpc('update_event', { p_id: args.id, p, p_scope: args.scope ?? 'single' }))
        : unwrap(await cal.rpc('create_event', { p }))
      return rows as CalendarEvent[]
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.allEvents }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ event, scope }: { event: CalendarEvent; scope: 'single' | 'following' }) => {
      const query =
        scope === 'following' && event.series_id
          ? cal.from('events').delete().eq('series_id', event.series_id).gte('starts_at', event.starts_at)
          : cal.from('events').delete().eq('id', event.id)
      const rows = unwrap(await query.select('id'))
      if (rows.length === 0) throw new Error('You can’t delete this event.')
      return rows.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.allEvents }),
  })
}

export async function fetchSeries(seriesId: string) {
  return unwrap(await cal.from('event_series').select('*').eq('id', seriesId).maybeSingle())
}
