import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useAuth } from '../auth/AuthProvider'
import { cal, supabase } from '../lib/supabase'
import { inChapterTz } from '../lib/time'
import type { DatedItemRow, DisplayEvent, Semester, Submission, WeeklyBlockRow } from '../lib/types'
import type { ParsedSchedule, ScheduleBlock, ScheduleItem, ScheduleStep } from '../../supabase/functions/_shared/schedule-types'
import { toJpeg } from './images'

export const scheduleKeys = {
  semester: ['semester', 'current'] as const,
  submission: (semesterId: string, memberId: string) => ['submission', semesterId, memberId] as const,
  mine: (semesterId: string, memberId: string) => ['schedule', semesterId, memberId] as const,
  items: ['schedule-items'] as const,
  counts: ['submission-counts'] as const,
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export function useCurrentSemester() {
  return useQuery({
    queryKey: scheduleKeys.semester,
    queryFn: async (): Promise<Semester | null> => unwrap(await cal.from('semesters').select('*').eq('is_current', true).maybeSingle()),
    staleTime: 5 * 60_000,
  })
}

/** Whether the signed-in member still has to set up their schedule for the current semester. */
export function useScheduleStatus() {
  const { member } = useAuth()
  const semester = useCurrentSemester()
  const semesterId = semester.data?.id
  const submission = useQuery({
    queryKey: scheduleKeys.submission(semesterId ?? '', member?.id ?? ''),
    enabled: !!semesterId && !!member,
    queryFn: async (): Promise<Submission | null> =>
      unwrap(await cal.from('schedule_submissions').select('*').eq('semester_id', semesterId!).eq('member_id', member!.id).maybeSingle()),
  })
  return {
    loading: semester.isPending || (!!semesterId && submission.isPending),
    error: semester.error ?? submission.error,
    semester: semester.data ?? null,
    submission: submission.data ?? null,
    needsSetup: !!semester.data && !submission.data?.completed,
  }
}

export interface MySchedule {
  blocks: WeeklyBlockRow[]
  items: DatedItemRow[]
}

export function useMySchedule(semesterId: string | undefined) {
  const { member } = useAuth()
  return useQuery({
    queryKey: scheduleKeys.mine(semesterId ?? '', member?.id ?? ''),
    enabled: !!semesterId && !!member,
    queryFn: async (): Promise<MySchedule> => {
      const [blocks, items] = await Promise.all([
        cal.from('weekly_blocks').select('*').eq('member_id', member!.id).eq('semester_id', semesterId!).order('weekday').order('start_time'),
        cal.from('dated_items').select('*').eq('member_id', member!.id).eq('semester_id', semesterId!).order('starts_at'),
      ])
      return { blocks: unwrap(blocks), items: unwrap(items) }
    },
  })
}

/** The member's own exams and one-off obligations in [start, end), drawn on their calendar. */
export function useMyCalendarItems(start: Date, end: Date) {
  const { member } = useAuth()
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  return useQuery({
    queryKey: [...scheduleKeys.items, member?.id, startIso, endIso],
    enabled: !!member,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<DisplayEvent[]> => {
      const rows = unwrap(
        await cal
          .from('dated_items')
          .select('*')
          .eq('member_id', member!.id)
          .eq('dismissed', false)
          .in('kind', ['exam', 'obligation'])
          .lt('starts_at', endIso)
          .gte('ends_at', startIso),
      )
      return rows.map((r) => ({
        id: `item-${r.id}`,
        series_id: null,
        title: r.course && !r.title.includes(r.course) ? `${r.course} ${r.title}` : r.title,
        category: r.category,
        starts_at: r.starts_at,
        ends_at: r.ends_at > r.starts_at ? r.ends_at : new Date(Date.parse(r.starts_at) + 30 * 60_000).toISOString(),
        all_day: r.all_day,
        location: null,
        description: null,
        required: false,
        hidden_from_associates: false,
        rsvp_enabled: false,
        created_by: r.member_id,
        created_at: r.created_at,
        updated_at: r.created_at,
        personal: { kind: r.kind as 'exam' | 'obligation', course: r.course },
      }))
    },
  })
}

const hhmm = (value: string) => format(inChapterTz(value), 'HH:mm')

export function blockFromRow(r: WeeklyBlockRow): ScheduleBlock {
  return {
    weekday: r.weekday,
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    label: r.label,
    location: r.location,
    category: r.category === 'personal' ? 'personal' : 'school',
  }
}

export function itemFromRow(r: DatedItemRow): ScheduleItem {
  const sameDay = format(inChapterTz(r.starts_at), 'yyyy-MM-dd') === format(inChapterTz(r.ends_at), 'yyyy-MM-dd')
  return {
    kind: r.kind as ScheduleItem['kind'],
    title: r.title,
    course: r.course,
    date: format(inChapterTz(r.starts_at), 'yyyy-MM-dd'),
    start: r.all_day ? null : hhmm(r.starts_at),
    end: !r.all_day && r.ends_at > r.starts_at && sameDay ? hhmm(r.ends_at) : null,
    all_day: r.all_day,
    category: r.category === 'school' ? 'school' : 'personal',
    source: r.source as ScheduleItem['source'],
    external_uid: r.external_uid,
    dismissed: r.dismissed,
  }
}

export function useSaveStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { step: ScheduleStep; blocks?: ScheduleBlock[]; items?: ScheduleItem[]; canvasUrl?: string | null }) =>
      unwrap(
        await cal.rpc('save_schedule_step', {
          p_step: args.step,
          p_blocks: JSON.parse(JSON.stringify(args.blocks ?? [])),
          p_items: JSON.parse(JSON.stringify(args.items ?? [])),
          p_canvas_url: args.canvasUrl ?? undefined,
        }),
      ),
    onSuccess: (row) => {
      // Update the gate's cache right away so finishing the last step opens the calendar.
      qc.setQueryData(scheduleKeys.submission(row.semester_id, row.member_id), row)
      void qc.invalidateQueries({ queryKey: ['schedule'] })
      void qc.invalidateQueries({ queryKey: scheduleKeys.items })
      void qc.invalidateQueries({ queryKey: scheduleKeys.counts })
    },
  })
}

/** Calls an Edge Function and turns its { error } body into a readable Error. */
async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  if (error) {
    const context = (error as { context?: Response }).context
    const detail = context ? await context.json().catch(() => null) : null
    throw new Error(detail?.error ?? 'Couldn’t reach the server. Check your connection and try again.')
  }
  return data as T
}

async function upload(memberId: string, semesterId: string, blob: Blob, extension: string, contentType: string): Promise<string> {
  const path = `${memberId}/${semesterId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('schedule-uploads').upload(path, blob, { contentType })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

/** Uploads the photos (shrunk to JPEG) and has Claude read them plus any typed text. */
export async function readSchedule(args: { step: ScheduleStep; text: string; photos: File[]; memberId: string; semesterId: string }) {
  const paths = await Promise.all(
    args.photos.map(async (file) => upload(args.memberId, args.semesterId, await toJpeg(file), 'jpg', 'image/jpeg')),
  )
  return invoke<ParsedSchedule>('parse-schedule', { step: args.step, text: args.text, image_paths: paths })
}

export async function importCalendar(args: {
  step: 'exams' | 'obligations'
  source: 'canvas' | 'ics_url' | 'ics_file'
  url?: string
  file?: File
  memberId: string
  semesterId: string
}) {
  const path = args.file ? await upload(args.memberId, args.semesterId, args.file, 'ics', 'text/calendar') : undefined
  return invoke<ParsedSchedule>('import-calendar', { step: args.step, source: args.source, url: args.url, path })
}

export function useSubmissionCounts() {
  return useQuery({
    queryKey: scheduleKeys.counts,
    queryFn: async () => {
      const rows = unwrap(await cal.rpc('submission_counts'))
      return rows[0] ?? { submitted: 0, total: 0 }
    },
  })
}
