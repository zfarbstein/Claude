// Saves a member's excuse (as the member, so the database enforces the rules) and emails
// the secretary set in calendar.settings.
import { appUrl, emailEnabled, sendEmails } from '../_shared/email.ts'
import { HttpError, json, requireMember, rest, serve, userRest } from '../_shared/server.ts'

interface Excuse {
  id: string
  event_id: string
  reason: string
  attachment_path: string | null
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  )

serve(async (req) => {
  const caller = await requireMember(req)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = typeof body.event_id === 'string' ? body.event_id : ''
  const reason = typeof body.reason === 'string' ? body.reason : ''
  const path = typeof body.attachment_path === 'string' && body.attachment_path ? body.attachment_path : null
  if (!eventId) throw new HttpError(400, 'Pick the event.')

  const excuse = await userRest<Excuse>(req, 'rpc/submit_excuse', {
    method: 'POST',
    body: { p_event_id: eventId, p_reason: reason, p_attachment_path: path },
  })

  let emailed = false
  try {
    const [settings] = await rest<{ secretary_email: string | null }[]>('settings?select=secretary_email')
    if (settings?.secretary_email && emailEnabled()) {
      const [event] = await rest<{ title: string; starts_at: string }[]>(`events?id=eq.${eventId}&select=title,starts_at`)
      const [member] = await rest<{ name: string; email: string }[]>(`members?id=eq.${caller.id}&select=name,email`, { schema: 'public' })
      const sent = await sendEmails([
        {
          to: settings.secretary_email,
          replyTo: member.email,
          subject: `Excuse from ${member.name}: ${event.title}`,
          heading: 'New excuse to review',
          paragraphs: [
            `${member.name} can’t make ${event.title} (${when(event.starts_at)}).`,
            `Reason: ${excuse.reason}`,
            path ? 'They attached proof. Open the excuse in the app to see it.' : 'No proof attached.',
          ],
          action: { label: 'Review excuses', url: `${appUrl}/admin/excuses` },
          footer: 'You get these because you’re the chapter secretary in the calendar settings.',
        },
      ])
      emailed = sent > 0
    }
  } catch (e) {
    // The excuse is saved either way; the secretary also sees it in the app.
    console.error('excuse email failed', e)
  }
  return json(200, { excuse, emailed })
})
