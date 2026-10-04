// Sends transactional email (Deno only). Production: Resend (RESEND_API_KEY, EMAIL_FROM).
// Local development: the Supabase Mailpit inbox (MAILPIT_URL), so tests can read the mail.
import { emailHtml, emailText, type EmailContent } from './email-template.ts'

export interface OutgoingEmail extends EmailContent {
  to: string
  subject: string
  replyTo?: string
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MAILPIT_URL = Deno.env.get('MAILPIT_URL')
const FROM = Deno.env.get('EMAIL_FROM') ?? 'Chapter Calendar <calendar@example.com>'

export const emailEnabled = () => !!RESEND_API_KEY || !!MAILPIT_URL

/** Public URL of the app, for links in emails. */
export const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

/** Sends the emails (Resend batches of 100). Returns how many were accepted. */
export async function sendEmails(emails: OutgoingEmail[]): Promise<number> {
  if (emails.length === 0 || !emailEnabled()) return 0
  if (RESEND_API_KEY) {
    let sent = 0
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100).map((e) => ({
        from: FROM,
        to: [e.to],
        subject: e.subject,
        html: emailHtml(e),
        text: emailText(e),
        ...(e.replyTo ? { reply_to: e.replyTo } : {}),
      }))
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) sent += batch.length
      else console.error('Resend', res.status, (await res.text()).slice(0, 300))
    }
    return sent
  }
  const [name, address] = FROM.match(/^(.*)<(.+)>$/)?.slice(1).map((s) => s.trim()) ?? ['', FROM]
  let sent = 0
  for (const e of emails) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ From: { Email: address, Name: name }, To: [{ Email: e.to }], Subject: e.subject, HTML: emailHtml(e), Text: emailText(e) }),
    }).catch(() => null)
    if (res?.ok) sent++
  }
  return sent
}
