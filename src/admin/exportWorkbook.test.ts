import { describe, expect, it } from 'vitest'
import type { DatedItemRow, Excuse, Member, Submission, WeeklyBlockRow } from '../lib/types'
import { buildSheets, buildWorkbook, exportFilename, type ExportData } from './exportWorkbook'

const member = (id: string, name: string, extra: Partial<Member> = {}): Member => ({
  id,
  name,
  email: `${id}@example.com`,
  role: 'member',
  member_type: 'brother',
  pledge_class: null,
  status: 'approved',
  active: true,
  approved_at: '2026-08-20T12:00:00Z',
  approved_by: null,
  created_at: '2026-08-20T12:00:00Z',
  updated_at: '2026-08-20T12:00:00Z',
  ...extra,
})

const data: ExportData = {
  semester: { name: 'Fall 2026', starts_on: '2026-08-24', ends_on: '2026-12-18' },
  members: [member('b', 'Ben'), member('a', 'Alex', { role: 'admin' }), member('p', 'Pat', { member_type: 'associate' })],
  submissions: [{ member_id: 'a', semester_id: 's', classes_done_at: 'x', exams_done_at: 'x', obligations_done_at: 'x', completed: true, canvas_feed_url: null, canvas_synced_at: null, canvas_sync_error: null, updated_at: 'x' } as Submission],
  blocks: [
    { id: '1', member_id: 'b', semester_id: 's', kind: 'class', category: 'school', weekday: 1, start_time: '09:35:00', end_time: '10:25:00', label: 'MAC2312', location: 'LIT 109', created_at: 'x' },
    { id: '2', member_id: 'a', semester_id: 's', kind: 'obligation', category: 'personal', weekday: 4, start_time: '18:00:00', end_time: '22:00:00', label: 'Publix', location: null, created_at: 'x' },
  ] as WeeklyBlockRow[],
  items: [
    { id: '3', member_id: 'b', semester_id: 's', kind: 'exam', category: 'exam', title: 'Exam 2', course: 'COP3502', starts_at: '2026-10-22T00:20:00Z', ends_at: '2026-10-22T02:10:00Z', all_day: false, blocks_availability: true, source: 'canvas', external_uid: 'e', dismissed: false, created_at: 'x' },
    { id: '4', member_id: 'b', semester_id: 's', kind: 'deadline', category: 'school', title: 'Project', course: null, starts_at: '2026-10-22T03:59:00Z', ends_at: '2026-10-22T03:59:00Z', all_day: false, blocks_availability: false, source: 'canvas', external_uid: 'd', dismissed: false, created_at: 'x' },
    { id: '5', member_id: 'a', semester_id: 's', kind: 'obligation', category: 'school', title: 'Career fair', course: null, starts_at: '2026-10-15T14:00:00Z', ends_at: '2026-10-15T16:00:00Z', all_day: false, blocks_availability: true, source: 'manual', external_uid: null, dismissed: false, created_at: 'x' },
  ] as DatedItemRow[],
  report: {
    events: [
      { id: 'e1', title: 'Chapter', category: 'required', starts_at: '2026-09-13T23:00:00Z', ends_at: '2026-09-14T00:30:00Z', required: true },
      { id: 'e2', title: 'Chapter', category: 'required', starts_at: '2026-09-20T23:00:00Z', ends_at: '2026-09-21T00:30:00Z', required: true },
    ],
    members: [
      { id: 'a', name: 'Alex', member_type: 'brother', pledge_class: null },
      { id: 'b', name: 'Ben', member_type: 'brother', pledge_class: null },
    ],
    cells: [
      { e: 'e1', m: 'a', s: 'present', r: true },
      { e: 'e2', m: 'a', s: 'absent', r: false },
      { e: 'e1', m: 'b', s: 'excused', r: true },
    ],
  },
  excuses: [{ id: 'x', event_id: 'e2', member_id: 'b', reason: 'Sick', attachment_path: null, status: 'approved', review_note: null, reviewed_by: null, reviewed_at: '2026-09-21T12:00:00Z', created_at: '2026-09-20T12:00:00Z' } as Excuse],
  eventTitles: new Map([['e2', { title: 'Chapter', starts_at: '2026-09-20T23:00:00Z' }]]),
}

const values = (rows: unknown[][]) => rows.map((r) => r.map((c) => (c && typeof c === 'object' && 'value' in c ? (c as { value: unknown }).value : c)))

describe('admin export', () => {
  const sheets = buildSheets(data)
  it('has the six sheets', () => {
    expect(sheets.map((s) => s.sheet)).toEqual(['Members', 'Weekly schedules', 'Exams', 'Obligations', 'Attendance', 'Excuses'])
  })
  it('lists members with access and submission status', () => {
    expect(values(sheets[0].data)).toEqual([
      ['Name', 'Email', 'Access', 'Pledge class', 'Approval', 'Active', 'Schedule submitted', 'Joined'],
      ['Alex', 'a@example.com', 'Admin', null, 'Approved', 'Yes', 'Yes', '2026-08-20'],
      ['Ben', 'b@example.com', 'Brother', null, 'Approved', 'Yes', 'No', '2026-08-20'],
      ['Pat', 'p@example.com', 'Pledge', null, 'Approved', 'Yes', 'No', '2026-08-20'],
    ])
  })
  it('splits classes, exams and obligations in chapter time', () => {
    expect(values(sheets[1].data)[1]).toEqual(['Ben', 'Monday', '9:35 AM', '10:25 AM', 'MAC2312', 'LIT 109'])
    expect(values(sheets[2].data)).toEqual([
      ['Member', 'Course', 'Exam', 'Date', 'Start', 'End', 'Source'],
      ['Ben', 'COP3502', 'Exam 2', '2026-10-21', '8:20 PM', '10:10 PM', 'Canvas'],
    ])
    expect(values(sheets[3].data).slice(1)).toEqual([
      ['Alex', 'Publix', 'Every Thursday', '6:00 PM', '10:00 PM', 'Personal', null],
      ['Alex', 'Career fair', '2026-10-15', '10:00 AM', '12:00 PM', 'School/involvement', null],
    ])
  })
  it('writes attendance letters and a percentage that ignores excused events', () => {
    expect(values(sheets[4].data)).toEqual([
      ['Member', 'Attendance %', 'Chapter 9/13', 'Chapter 9/20'],
      ['Alex', 0.5, 'P', 'A'],
      ['Ben', null, 'E', null],
    ])
  })
  it('lists excuses with their event', () => {
    expect(values(sheets[5].data)[1]).toEqual(['Ben', 'Chapter', '2026-09-20', 'Sick', 'Approved', '2026-09-20', '2026-09-21', null, 'No'])
  })
  it('writes a real .xlsx file', async () => {
    const blob = await buildWorkbook(data)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    expect(exportFilename('Fall 2026', new Date('2026-10-04T16:00:00Z'))).toBe('Fall-2026-export-2026-10-04.xlsx')
  })
})
