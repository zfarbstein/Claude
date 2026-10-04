// Delivers notifications: pg_cron calls this every 5 minutes (x-cron-secret), and admins call
// it right after sending one. Each run queues due reminders, claims due notifications, writes
// every recipient's in-app inbox row, sends Web Push, and emails members it couldn't push to.
import { appUrl, emailEnabled, sendEmails } from '../_shared/email.ts'
import { json, requireAdmin, rest, serve } from '../_shared/server.ts'
import { sendPush, type VapidKeys } from '../_shared/webpush.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID: VapidKeys | null =
  VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
    ? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com' }
    : null

interface Notification {
  id: string
  kind: string
  title: string
  body: string
  url: string
  dedupe_key: string | null
}

interface Recipient {
  member_id: string
  name: string
  email: string
}

interface Subscription {
  id: string
  member_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** 1-hour reminders and the weekly nights reminder are push-only; everything else falls back to email. */
const emailWorthy = (n: Notification) => n.kind !== 'weekly' && !(n.kind === 'reminder' && n.dedupe_key?.endsWith(':1h'))

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
    }),
  )
}

const inList = (ids: string[]) => `in.(${ids.join(',')})`

async function subscriptionsFor(memberIds: string[]): Promise<Subscription[]> {
  const out: Subscription[] = []
  for (let i = 0; i < memberIds.length; i += 150) {
    out.push(...(await rest<Subscription[]>(`push_subscriptions?member_id=${inList(memberIds.slice(i, i + 150))}&select=id,member_id,endpoint,p256dh,auth`)))
  }
  return out
}

async function deliver(n: Notification, emailFallback: boolean) {
  const recipients = await rest<Recipient[]>('rpc/notification_recipients', { method: 'POST', body: { p_notification_id: n.id } })
  if (recipients.length > 0) {
    await rest('notification_inbox?on_conflict=notification_id,member_id', {
      method: 'POST',
      body: recipients.map((r) => ({ notification_id: n.id, member_id: r.member_id })),
      prefer: 'resolution=ignore-duplicates,return=minimal',
    })
  }

  const pushed = new Set<string>()
  if (VAPID && recipients.length > 0) {
    const subs = await subscriptionsFor(recipients.map((r) => r.member_id))
    const ok: string[] = []
    const gone: string[] = []
    const payload = { title: n.title, body: n.body, url: n.url, tag: n.id }
    await pool(subs, 10, async (s) => {
      const result = await sendPush(s, payload, VAPID)
      if (result.ok) {
        ok.push(s.id)
        pushed.add(s.member_id)
      } else if (result.gone) {
        gone.push(s.id)
      } else {
        console.error('push failed', result.status, result.error)
      }
    })
    for (let i = 0; i < gone.length; i += 150) {
      await rest(`push_subscriptions?id=${inList(gone.slice(i, i + 150))}`, { method: 'DELETE', prefer: 'return=minimal' })
    }
    for (let i = 0; i < ok.length; i += 150) {
      await rest(`push_subscriptions?id=${inList(ok.slice(i, i + 150))}`, {
        method: 'PATCH',
        body: { last_success_at: new Date().toISOString(), failure_count: 0 },
        prefer: 'return=minimal',
      })
    }
  }

  const emailTo = emailFallback && emailEnabled() && emailWorthy(n) ? recipients.filter((r) => !pushed.has(r.member_id) && r.email) : []
  const emailed = await sendEmails(
    emailTo.map((r) => ({
      to: r.email,
      subject: n.title,
      heading: n.title,
      paragraphs: n.body ? [n.body] : [],
      action: { label: 'Open the calendar', url: `${appUrl}${n.url}` },
      footer: 'You got this by email because notifications aren’t on in the app. Turn them on under Me → Notifications.',
    })),
  )

  const pushedIds = [...pushed]
  for (let i = 0; i < pushedIds.length; i += 150) {
    await rest(`notification_inbox?notification_id=eq.${n.id}&member_id=${inList(pushedIds.slice(i, i + 150))}`, {
      method: 'PATCH',
      body: { pushed: true },
      prefer: 'return=minimal',
    })
  }
  if (emailed > 0) {
    const emailedIds = emailTo.map((r) => r.member_id)
    for (let i = 0; i < emailedIds.length; i += 150) {
      await rest(`notification_inbox?notification_id=eq.${n.id}&member_id=${inList(emailedIds.slice(i, i + 150))}`, {
        method: 'PATCH',
        body: { emailed: true },
        prefer: 'return=minimal',
      })
    }
  }

  await rest(`notifications?id=eq.${n.id}`, {
    method: 'PATCH',
    body: { status: 'sent', sent_at: new Date().toISOString(), recipients: recipients.length, pushed: pushed.size, emailed, error: null },
    prefer: 'return=minimal',
  })
  return { id: n.id, recipients: recipients.length, pushed: pushed.size, emailed }
}

serve(async (req) => {
  const fromCron = !!CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET
  if (!fromCron) await requireAdmin(req)

  const queued = await rest<number>('rpc/queue_due_notifications', { method: 'POST', body: {} })
  const due = await rest<Notification[]>('rpc/claim_due_notifications', { method: 'POST', body: { p_limit: 25 } })
  const [settings] = await rest<{ email_fallback: boolean }[]>('settings?select=email_fallback')

  const results = []
  for (const n of due) {
    try {
      results.push(await deliver(n, settings?.email_fallback ?? true))
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 300)
      console.error('notification failed', n.id, error)
      await rest(`notifications?id=eq.${n.id}`, { method: 'PATCH', body: { status: 'failed', error }, prefer: 'return=minimal' }).catch(() => undefined)
      results.push({ id: n.id, error })
    }
  }
  return json(200, { queued, delivered: results })
})
