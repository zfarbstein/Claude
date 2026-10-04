// Imports a Canvas calendar feed, a calendar link, or an uploaded .ics file and returns
// editable rows. Nothing is saved to the schedule here; the member confirms first.
import { parseIcs, scheduleFromCanvas, scheduleFromIcs } from '../_shared/ical.ts'
import type { ScheduleStep } from '../_shared/schedule-types.ts'
import { currentSemester, downloadUpload, fetchFeed, HttpError, json, requireMember, rest, serve } from '../_shared/server.ts'

const CANVAS_FEED = /^https:\/\/[^/\s]+\/feeds\/calendars\/[^\s]+$/

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.')
  const caller = await requireMember(req)
  const body = (await req.json().catch(() => ({}))) as { step?: string; source?: string; url?: string; path?: string }
  const step = body.step as ScheduleStep
  if (step !== 'exams' && step !== 'obligations') throw new HttpError(400, 'Calendars can be imported for exams or obligations.')
  const source = body.source
  if (source !== 'canvas' && source !== 'ics_url' && source !== 'ics_file') throw new HttpError(400, 'Unknown import type.')

  let text: string
  if (source === 'ics_file') {
    if (typeof body.path !== 'string' || !body.path.startsWith(`${caller.id}/`) || body.path.includes('..')) {
      throw new HttpError(403, 'You can only import your own uploads.')
    }
    text = new TextDecoder().decode(await downloadUpload(body.path))
    if (!text.includes('BEGIN:VCALENDAR')) throw new HttpError(400, 'That file isn’t a calendar (.ics) file.')
  } else {
    const url = (body.url ?? '').trim().replace(/^webcals?:\/\//i, 'https://')
    if (source === 'canvas' && !CANVAS_FEED.test(url)) {
      throw new HttpError(400, 'That doesn’t look like a Canvas feed link. In Canvas, open Calendar, then Calendar Feed, and copy the link.')
    }
    text = await fetchFeed(url)
  }

  const semester = await currentSemester()
  const events = parseIcs(text)
  const parsed = source === 'canvas' ? scheduleFromCanvas(events, semester) : scheduleFromIcs(events, step, semester)

  await rest('schedule_uploads', {
    method: 'POST',
    body: {
      member_id: caller.id,
      semester_id: semester.id,
      step,
      kind: source,
      storage_paths: source === 'ics_file' ? [body.path] : [],
      source_url: source === 'ics_file' ? null : body.url,
      parsed: { ...parsed, items: parsed.items.slice(0, 400) },
    },
  })
  return json(200, parsed)
})
