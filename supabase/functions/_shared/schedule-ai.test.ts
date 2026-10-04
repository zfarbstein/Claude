import { describe, expect, it } from 'vitest'
import { buildSchedulePrompt, normalizeAiSchedule, SCHEDULE_JSON_SCHEMA } from './schedule-ai'
import { blockProblem, normalizeTime } from './schedule-types'

const semester = { name: 'Fall 2026', starts_on: '2026-08-24', ends_on: '2026-12-18' }

describe('schedule AI helpers', () => {
  it('normalizes times', () => {
    expect(normalizeTime('9:35')).toBe('09:35')
    expect(normalizeTime('09:35:00')).toBe('09:35')
    expect(normalizeTime('8:20 PM')).toBe('20:20')
    expect(normalizeTime('12am')).toBe('00:00')
    expect(normalizeTime('25:00')).toBeNull()
    expect(normalizeTime(null)).toBeNull()
  })

  it('includes UF specifics and the typed text in the prompt', () => {
    const prompt = buildSchedulePrompt('classes', semester, '2026-10-04', 'COP3502 MWF period 4', 1)
    expect(prompt).toContain('4 10:40-11:30')
    expect(prompt).toContain('E3 21:20-22:10')
    expect(prompt).toContain('Thursday as "R"')
    expect(prompt).toContain('COP3502 MWF period 4')
    expect(prompt).toContain('1 image is attached')
    expect(SCHEDULE_JSON_SCHEMA.required).toEqual(['weekly', 'dated', 'notes'])
  })

  it('expands weekly meetings into one row per day and drops invalid rows', () => {
    const result = normalizeAiSchedule(
      {
        weekly: [
          { days: [1, 3, 5], start: '10:40', end: '11:30', label: 'COP3502 Lecture', location: 'CSE A101', category: 'school' },
          { days: [9], start: '10:40', end: '11:30', label: 'Bad day', location: null, category: 'school' },
          { days: [2], start: '14:00', end: '13:00', label: 'Backwards', location: null, category: 'school' },
        ],
        dated: [{ kind: 'exam', title: 'Exam 2', course: 'COP3502', date: '2026-10-21', start: '20:20', end: '22:10' }],
        notes: ['CHM2045 is online'],
      },
      'classes',
      semester,
    )
    expect(result.blocks.map((b) => b.weekday)).toEqual([1, 3, 5])
    expect(result.blocks.every((b) => blockProblem(b) === null)).toBe(true)
    expect(result.items).toEqual([]) // classes step ignores dated items
    expect(result.notes).toEqual(['CHM2045 is online', '2 items couldn’t be read clearly and were left out. Add them by hand if needed.'])
  })

  it('keeps exams inside the semester and fills in sensible defaults', () => {
    const result = normalizeAiSchedule(
      {
        weekly: [{ days: [1], start: '10:40', end: '11:30', label: 'x', location: null, category: 'school' }],
        dated: [
          { kind: 'exam', title: 'Midterm', course: 'MAC2312', date: '2026-11-04', start: null, end: null },
          { kind: 'deadline', title: 'Essay', course: null, date: '2026-10-30', start: '23:59', end: '23:00' },
          { kind: 'exam', title: 'Way too late', course: null, date: '2027-06-01', start: null, end: null },
          { kind: 'exam', title: 'Bad date', course: null, date: '2026-02-30', start: null, end: null },
        ],
        notes: [],
      },
      'exams',
      semester,
    )
    expect(result.blocks).toEqual([])
    expect(result.items).toEqual([
      { kind: 'deadline', title: 'Essay', course: null, date: '2026-10-30', start: '23:59', end: null, all_day: false, source: 'ai' },
      { kind: 'exam', title: 'Midterm', course: 'MAC2312', date: '2026-11-04', start: null, end: null, all_day: true, source: 'ai' },
    ])
  })

  it('survives garbage', () => {
    expect(normalizeAiSchedule('nope', 'obligations', semester)).toEqual({ blocks: [], items: [], notes: [] })
  })
})
