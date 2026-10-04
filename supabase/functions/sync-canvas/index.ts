// Daily job (pg_cron -> pg_net, see the schedules migration): re-reads every member's saved
// Canvas feed for the current semester and updates their exams and deadlines.
import { parseIcs, scheduleFromCanvas } from '../_shared/ical.ts'
import { currentSemester, fetchFeed, HttpError, json, rest, serve } from '../_shared/server.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) throw new HttpError(401, 'Not allowed.')
  const semester = await currentSemester()
  const subs = await rest<{ member_id: string; canvas_feed_url: string }[]>(
    `schedule_submissions?semester_id=eq.${semester.id}&canvas_feed_url=not.is.null&select=member_id,canvas_feed_url`,
  )

  let synced = 0
  let failed = 0
  const queue = [...subs]
  const worker = async () => {
    for (let sub = queue.shift(); sub; sub = queue.shift()) {
      try {
        const parsed = scheduleFromCanvas(parseIcs(await fetchFeed(sub.canvas_feed_url)), semester)
        await rest('rpc/apply_feed_sync', {
          method: 'POST',
          body: { p_member_id: sub.member_id, p_semester_id: semester.id, p_items: parsed.items.slice(0, 400) },
        })
        synced++
      } catch (e) {
        failed++
        await rest(`schedule_submissions?member_id=eq.${sub.member_id}&semester_id=eq.${semester.id}`, {
          method: 'PATCH',
          body: { canvas_sync_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
        }).catch(() => undefined)
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return json(200, { synced, failed })
})
