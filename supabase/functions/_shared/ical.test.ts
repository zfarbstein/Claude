import { describe, expect, it } from 'vitest'
import { isExamTitle, parseIcs, scheduleFromCanvas, scheduleFromIcs, splitCourse, toChapterTime, zonedToInstant } from './ical'

const semester = { name: 'Fall 2026', starts_on: '2026-08-24', ends_on: '2026-12-18' }

const CANVAS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:event-1',
  'DTSTART:20261022T002000Z', // Oct 21, 8:20 PM EDT
  'DTEND:20261022T021000Z',
  'SUMMARY:Exam 2 [COP3502-Fall2026]',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:assignment-7',
  'DTSTART:20261028T035900Z', // Oct 27, 11:59 PM EDT
  'DTEND:20261028T035900Z',
  'SUMMARY:Final Project Presentation [ENC1101-Fall2026]',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-2',
  'DTSTART;VALUE=DATE:20261210',
  'DTEND;VALUE=DATE:20261211',
  'SUMMARY:Final Exam [MAC2312-Fall2026]',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:old',
  'DTSTART:20250115T150000Z',
  'SUMMARY:Exam from last year',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('ical', () => {
  it('converts Canvas UTC times to Gainesville time (EDT and EST)', () => {
    expect(toChapterTime('20261022T002000Z', {})).toEqual({ date: '2026-10-21', time: '20:20' })
    expect(toChapterTime('20261202T012000Z', {})).toEqual({ date: '2026-12-01', time: '20:20' })
    expect(toChapterTime('20261210', { VALUE: 'DATE' })).toEqual({ date: '2026-12-10', time: null })
  })

  it('converts other zones and keeps floating or local times as-is', () => {
    expect(toChapterTime('20261021T172000', { TZID: 'America/Los_Angeles' })).toEqual({ date: '2026-10-21', time: '20:20' })
    expect(toChapterTime('20261021T202000', { TZID: 'Eastern Standard Time' })).toEqual({ date: '2026-10-21', time: '20:20' })
    expect(toChapterTime('20261021T202000', {})).toEqual({ date: '2026-10-21', time: '20:20' })
    expect(new Date(zonedToInstant(2026, 11, 1, 1, 30, 'America/New_York')).toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('classifies exam titles without catching look-alikes', () => {
    for (const t of ['Exam 2', 'Midterm', 'Final Exam', 'Lab Practical 1', 'Test 3']) expect(isExamTitle(t), t).toBe(true)
    for (const t of ['Final Project', 'Exam 2 Review Session', 'Practice Exam', 'Homework 4', 'Quiz 3', 'Test corrections'])
      expect(isExamTitle(t), t).toBe(false)
  })

  it('splits Canvas course codes out of titles', () => {
    expect(splitCourse('Exam 2 [COP3502-Fall2026]')).toEqual({ title: 'Exam 2', course: 'COP3502' })
    expect(splitCourse('CHM 2045 Exam 1')).toEqual({ title: 'CHM 2045 Exam 1', course: 'CHM2045' })
  })

  it('turns a Canvas feed into exams (blocking) and deadlines, inside the semester only', () => {
    const { items } = scheduleFromCanvas(parseIcs(CANVAS), semester)
    expect(items).toEqual([
      { kind: 'exam', title: 'Exam 2', course: 'COP3502', date: '2026-10-21', start: '20:20', end: '22:10', all_day: false, source: 'canvas', external_uid: 'event-1' },
      { kind: 'deadline', title: 'Final Project Presentation', course: 'ENC1101', date: '2026-10-27', start: '23:59', end: null, all_day: false, source: 'canvas', external_uid: 'assignment-7' },
      { kind: 'exam', title: 'Final Exam', course: 'MAC2312', date: '2026-12-10', start: null, end: null, all_day: true, source: 'canvas', external_uid: 'event-2' },
    ])
  })

  it('reads weekly obligations from a Google Calendar export, with folded lines and alarms', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:g1',
      'DTSTART;TZID=America/New_York:20260825T180000',
      'DTEND;TZID=America/New_York:20260825T220000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T000000Z',
      'SUMMARY:Shift at Publix',
      'LOCATION:Publix\\, 13th St',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:g2',
      'DTSTART;TZID=America/New_York:20261003T090000',
      'DURATION:PT2H',
      'SUMMARY:Volunteer shift at the ',
      ' food bank',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    const result = scheduleFromIcs(parseIcs(ics), 'obligations', semester)
    expect(result.blocks).toEqual([
      { weekday: 2, start: '18:00', end: '22:00', label: 'Shift at Publix', location: 'Publix, 13th St', category: 'personal' },
      { weekday: 4, start: '18:00', end: '22:00', label: 'Shift at Publix', location: 'Publix, 13th St', category: 'personal' },
    ])
    expect(result.items).toMatchObject([{ kind: 'obligation', title: 'Volunteer shift at the food bank', date: '2026-10-03', start: '09:00', end: '11:00' }])
  })
})
