import { TZDate } from '@date-fns/tz'
import { expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export const SEED_PASSWORD = 'Password123'
export const SEED_ADMIN = 'president@example.com'

export const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`

type MemberSetup = {
  email: string
  password: string
  name: string
  status?: 'pending' | 'approved' | 'rejected'
  member_type?: 'brother' | 'associate'
  role?: 'admin' | 'chair' | 'member'
}

/** Creates a confirmed auth user and sets their member row (service role bypasses RLS). */
export async function createMember(m: MemberSetup): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email: m.email,
    password: m.password,
    email_confirm: true,
    user_metadata: { full_name: m.name },
  })
  if (error) throw error
  const id = data.user.id
  const { error: updateError } = await service
    .from('members')
    .update({ status: m.status ?? 'approved', member_type: m.member_type ?? 'brother', role: m.role ?? 'member' })
    .eq('id', id)
  if (updateError) throw updateError
  return id
}

export async function deleteUsers(ids: string[]) {
  for (const id of ids) await service.auth.admin.deleteUser(id)
}

interface MailpitMessage {
  ID: string
  Subject: string
}

/** Polls the local Mailpit inbox (Supabase's test SMTP server) for the newest matching email. */
export async function waitForEmail(to: string, subject: string, timeoutMs = 30_000): Promise<{ html: string; text: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    if (res.ok) {
      const body = (await res.json()) as { messages: MailpitMessage[] }
      const match = body.messages.find((m) => m.Subject.includes(subject))
      if (match) {
        const message = await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()
        return { html: message.HTML as string, text: message.Text as string }
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No "${subject}" email for ${to} within ${timeoutMs}ms`)
}

export function linkFromEmail(html: string, path: string): string {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
  const link = hrefs.find((h) => new URL(h).pathname === path)
  if (!link) throw new Error(`No ${path} link in email. Links: ${hrefs.join(', ')}`)
  return link
}

/** Suppress the first-visit install sheet so it never covers the page under test. */
export async function newMobilePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => localStorage.setItem('install-prompt-dismissed', '1'))
  return context.newPage()
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

export async function expectCalendar(page: Page) {
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

/** 'yyyy-MM-dd' for N days from today in chapter time. */
export function chapterDate(offsetDays: number): string {
  const now = TZDate.tz('America/New_York')
  const d = new TZDate(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 'America/New_York')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function chapterInstant(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new TZDate(y, m - 1, d, hh, mm, 'America/New_York').toISOString()
}

/** Selects a day in the month view, paging forward if it's in a later month. */
export async function openDay(page: Page, date: string) {
  for (let i = 0; i < 3; i++) {
    const cell = page.locator(`[data-day="${date}"]`)
    if (await cell.count()) {
      await cell.click()
      return
    }
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  throw new Error(`Day ${date} not found`)
}
