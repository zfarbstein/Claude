import { format } from 'date-fns'
import writeExcelFile, { type Cell, type Row, type Sheet } from 'write-excel-file/universal'
import { ACCESS_LABELS, accessOf } from '../lib/permissions'
import { inChapterTz } from '../lib/time'
import type { AttendanceReport, AttendanceStatus, DatedItemRow, Excuse, Member, Semester, Submission, WeeklyBlockRow } from '../lib/types'
import { attendancePercent } from '../attendance/api'

export interface ExportData {
  semester: Pick<Semester, 'name' | 'starts_on' | 'ends_on'> | null
  members: Member[]
  submissions: Submission[]
  blocks: WeeklyBlockRow[]
  items: DatedItemRow[]
  report: AttendanceReport
  excuses: Excuse[]
  eventTitles: Map<string, { title: string; starts_at: string }>
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SOURCES: Record<string, string> = { manual: 'Typed in', ai: 'Read by Claude', canvas: 'Canvas', ics: 'Calendar file/link' }
const LETTER: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', excused: 'E' }

const header = (titles: string[]): Row => titles.map((value) => ({ value, fontWeight: 'bold' as const }))
const date = (iso: string | null) => (iso ? format(inChapterTz(iso), 'yyyy-MM-dd') : null)
const time = (iso: string, allDay: boolean) => (allDay ? 'All day' : format(inChapterTz(iso), 'h:mm a'))
const clock = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const widths = (...w: number[]) => w.map((width) => ({ width }))

/** The six sheets of the admin export, as plain rows (tested separately from file writing). */
export function buildSheets(d: ExportData): Sheet<Blob>[] {
  const names = new Map(d.members.map((m) => [m.id, m.name || m.email]))
  const name = (id: string) => names.get(id) ?? 'Former member'
  const byName = <T extends { member_id: string }>(a: T, b: T) => name(a.member_id).localeCompare(name(b.member_id))
  const subs = new Map(d.submissions.map((s) => [s.member_id, s]))

  const members: Row[] = [
    header(['Name', 'Email', 'Access', 'Pledge class', 'Approval', 'Active', 'Schedule submitted', 'Joined']),
    ...[...d.members]
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
      .map((m): Row => {
        const s = subs.get(m.id)
        const steps = s ? [s.classes_done_at, s.exams_done_at, s.obligations_done_at].filter(Boolean).length : 0
        return [
          m.name,
          m.email,
          ACCESS_LABELS[accessOf(m)],
          m.pledge_class,
          m.status[0].toUpperCase() + m.status.slice(1),
          m.active ? 'Yes' : 'No',
          s?.completed ? 'Yes' : steps > 0 ? `In progress (${steps}/3)` : 'No',
          date(m.approved_at ?? m.created_at),
        ]
      }),
  ]

  const classes: Row[] = [
    header(['Member', 'Day', 'Start', 'End', 'Class', 'Location']),
    ...d.blocks
      .filter((b) => b.kind === 'class')
      .sort((a, b) => byName(a, b) || a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
      .map((b): Row => [name(b.member_id), DAYS[b.weekday], clock(b.start_time), clock(b.end_time), b.label, b.location]),
  ]

  const exams: Row[] = [
    header(['Member', 'Course', 'Exam', 'Date', 'Start', 'End', 'Source']),
    ...d.items
      .filter((i) => i.kind === 'exam' && !i.dismissed)
      .sort((a, b) => byName(a, b) || a.starts_at.localeCompare(b.starts_at))
      .map((i): Row => [name(i.member_id), i.course, i.title, date(i.starts_at), time(i.starts_at, i.all_day), i.all_day ? null : time(i.ends_at, false), SOURCES[i.source] ?? i.source]),
  ]

  const obligations: Row[] = [
    header(['Member', 'Obligation', 'When', 'Start', 'End', 'Type', 'Location']),
    ...[
      ...d.blocks
        .filter((b) => b.kind === 'obligation')
        .map((b) => ({ member_id: b.member_id, sort: `0${b.weekday}${b.start_time}`, row: [b.label, `Every ${DAYS[b.weekday]}`, clock(b.start_time), clock(b.end_time), b.category === 'school' ? 'School/involvement' : 'Personal', b.location] as Cell[] })),
      ...d.items
        .filter((i) => i.kind === 'obligation' && !i.dismissed)
        .map((i) => ({ member_id: i.member_id, sort: `1${i.starts_at}`, row: [i.title, date(i.starts_at), time(i.starts_at, i.all_day), i.all_day ? null : time(i.ends_at, false), i.category === 'school' ? 'School/involvement' : 'Personal', null] as Cell[] })),
    ]
      .sort((a, b) => byName(a, b) || a.sort.localeCompare(b.sort))
      .map((o): Row => [name(o.member_id), ...o.row]),
  ]

  const cells = new Map(d.report.cells.map((c) => [`${c.m}:${c.e}`, c.s]))
  const attendance: Row[] = [
    header(['Member', 'Attendance %', ...d.report.events.map((e) => `${e.title} ${format(inChapterTz(e.starts_at), 'M/d')}`)]),
    ...d.report.members.map((m): Row => {
      const statuses = d.report.events.map((e) => cells.get(`${m.id}:${e.id}`) ?? null)
      const pct = attendancePercent(statuses.filter((s): s is AttendanceStatus => !!s))
      return [m.name, pct === null ? null : pct / 100, ...statuses.map((s) => (s ? LETTER[s] : null))].map((v, i) =>
        i === 1 && typeof v === 'number' ? { value: v, type: Number, format: '0%' } : v,
      ) as Row
    }),
  ]

  const excuses: Row[] = [
    header(['Member', 'Event', 'Event date', 'Reason', 'Status', 'Submitted', 'Reviewed', 'Note', 'Proof attached']),
    ...[...d.excuses]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((x): Row => {
        const e = d.eventTitles.get(x.event_id)
        return [
          name(x.member_id),
          e?.title ?? 'Deleted event',
          e ? date(e.starts_at) : null,
          x.reason,
          x.status[0].toUpperCase() + x.status.slice(1),
          date(x.created_at),
          date(x.reviewed_at),
          x.review_note,
          x.attachment_path ? 'Yes' : 'No',
        ]
      }),
  ]

  return [
    { sheet: 'Members', data: members, columns: widths(24, 30, 10, 14, 11, 8, 18, 12), stickyRowsCount: 1 },
    { sheet: 'Weekly schedules', data: classes, columns: widths(24, 12, 10, 10, 26, 16), stickyRowsCount: 1 },
    { sheet: 'Exams', data: exams, columns: widths(24, 12, 22, 12, 10, 10, 16), stickyRowsCount: 1 },
    { sheet: 'Obligations', data: obligations, columns: widths(24, 28, 16, 10, 10, 18, 18), stickyRowsCount: 1 },
    { sheet: 'Attendance', data: attendance, columns: widths(24, 13, ...d.report.events.map(() => 14)), stickyRowsCount: 1, stickyColumnsCount: 1 },
    { sheet: 'Excuses', data: excuses, columns: widths(24, 24, 12, 50, 10, 12, 12, 30, 14), stickyRowsCount: 1 },
  ]
}

export function exportFilename(semesterName: string | undefined, now = new Date()) {
  return `${(semesterName ?? 'Chapter').replace(/[^\w-]+/g, '-')}-export-${format(inChapterTz(now), 'yyyy-MM-dd')}.xlsx`
}

export async function buildWorkbook(d: ExportData): Promise<Blob> {
  return writeExcelFile(buildSheets(d), { fontFamily: 'Calibri', fontSize: 11 }).toBlob()
}
