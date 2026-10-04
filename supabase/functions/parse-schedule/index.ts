// Reads a member's schedule (typed text and/or photos) with Claude and returns editable rows.
// Nothing is saved to the schedule here: the member confirms the result in the app first.
// The original input and the raw result are kept in schedule_uploads for admin review.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { buildSchedulePrompt, normalizeAiSchedule, SCHEDULE_JSON_SCHEMA, SCHEDULE_MODEL } from '../_shared/schedule-ai.ts'
import type { ScheduleStep } from '../_shared/schedule-types.ts'
import { currentSemester, downloadUpload, HttpError, json, requireMember, rest, serve, toBase64, todayInChapter } from '../_shared/server.ts'

const STEPS: ScheduleStep[] = ['classes', 'exams', 'obligations']
const MAX_IMAGES = 4
const DAILY_LIMIT = 25

const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.')
  const caller = await requireMember(req)
  if (!anthropic) throw new HttpError(503, 'Reading schedules automatically isn’t set up yet. Type your schedule into the list instead.')

  const body = (await req.json().catch(() => ({}))) as { step?: string; text?: string; image_paths?: string[] }
  const step = body.step as ScheduleStep
  if (!STEPS.includes(step)) throw new HttpError(400, 'Unknown step.')
  const text = typeof body.text === 'string' ? body.text.slice(0, 8000) : ''
  const paths = Array.isArray(body.image_paths) ? body.image_paths.filter((p) => typeof p === 'string') : []
  if (paths.length > MAX_IMAGES) throw new HttpError(400, `Add at most ${MAX_IMAGES} photos at a time.`)
  if (paths.some((p) => !p.startsWith(`${caller.id}/`) || p.includes('..'))) throw new HttpError(403, 'You can only read your own uploads.')
  if (!text.trim() && paths.length === 0) throw new HttpError(400, 'Type your schedule or add a photo first.')

  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const recent = await rest<unknown[]>(`schedule_uploads?member_id=eq.${caller.id}&kind=eq.ai&created_at=gt.${since}&select=id`)
  if (recent.length >= DAILY_LIMIT) throw new HttpError(429, 'You’ve hit today’s limit for reading schedules. Edit the list by hand or try again tomorrow.')

  const semester = await currentSemester()
  const images = await Promise.all(paths.map(downloadUpload))

  const response = await anthropic.beta.messages.create({
    model: SCHEDULE_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEDULE_JSON_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((bytes) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: toBase64(bytes) },
          })),
          { type: 'text' as const, text: buildSchedulePrompt(step, semester, todayInChapter(), text, images.length) },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'Couldn’t read that. Try a clearer screenshot or type it instead.')
  const output = response.content.find((b) => b.type === 'text')
  let raw: unknown
  try {
    raw = JSON.parse(output && output.type === 'text' ? output.text : '')
  } catch {
    throw new HttpError(422, 'Couldn’t read that. Try a clearer screenshot or type it instead.')
  }
  const parsed = normalizeAiSchedule(raw, step, semester)

  await rest('schedule_uploads', {
    method: 'POST',
    body: { member_id: caller.id, semester_id: semester.id, step, kind: 'ai', text_content: text || null, storage_paths: paths, parsed },
  })
  return json(200, parsed)
})
