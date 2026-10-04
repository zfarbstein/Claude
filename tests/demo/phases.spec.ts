import { expect, test, type Page } from '@playwright/test'

const chapterNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
const day = (offset: number) => {
  const now = chapterNow()
  now.setDate(now.getDate() + offset)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const weekdayOf = (offset: number) => {
  const now = chapterNow()
  now.setDate(now.getDate() + offset)
  return now.getDay()
}
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

async function openDay(page: Page, date: string) {
  await page.locator('[data-day]').first().waitFor()
  for (let i = 0; i < 3; i++) {
    const cell = page.locator(`[data-day="${date}"]`)
    if (await cell.count()) return cell.click()
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  throw new Error(`Day ${date} not found`)
}

async function signInAs(page: Page, name: string) {
  const tools = page.getByRole('dialog', { name: 'Demo tools' })
  if (!(await tools.isVisible())) await page.getByRole('button', { name: /^Demo/ }).click()
  await tools.getByRole('tab', { name: 'Sign in as' }).click()
  await tools.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
}

test('demo: availability, excuses, check-in, notifications and the Excel export', async ({ page }) => {
  // The artifact viewer provides window.claude; here it only offers downloads (reading falls back to samples).
  await page.addInitScript(() => {
    const w = window as unknown as { claude: unknown; __saved?: { filename: string; size: number } }
    w.claude = {
      use: async (name: string) =>
        name === 'downloads'
          ? {
              save: async (r: { filename: string; data: Blob }) => {
                w.__saved = { filename: r.filename, size: r.data.size }
                return { status: 'saved' }
              },
            }
          : null,
    }
  })
  await page.goto('/demo.html')

  // A brother marks a night unavailable, and is sent to the excuse form for a required meeting.
  await signInAs(page, 'Marcus Johnson')
  await page.getByRole('button', { name: 'Availability' }).click()
  await expect(page.getByTestId('submitted-count')).toHaveText('16/19 submitted')
  const quiet = [3, 4, 6, 7, 8].find((o) => weekdayOf(o) !== 0)!
  await openDay(page, day(quiet))
  const panel = page.locator('section[aria-labelledby="night-title"]')
  await panel.getByLabel('Reason (optional)').fill('Intramural final')
  await panel.getByRole('button', { name: /make it this night/ }).click()
  await expect(panel.getByText('You marked yourself unavailable.')).toBeVisible()
  const sunday = weekdayOf(0) === 0 ? 7 : 7 - weekdayOf(0)
  await openDay(page, day(sunday))
  await panel.getByRole('link', { name: 'Request an excuse' }).click()
  await page.getByLabel('Reason').fill('Lab practical make-up that night.')
  await page.getByRole('button', { name: 'Submit excuse' }).click()
  await expect(page.getByText('Excuse sent to the secretary')).toBeVisible()
  await expect(page.getByText('Waiting for review').first()).toBeVisible()

  // The admin approves it; the secretary's email is in the demo inbox.
  await signInAs(page, 'Alex Rivera')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' }).click()
  await page.getByRole('link', { name: /^Excuses/ }).click()
  await page.getByRole('article', { name: 'Excuse from Marcus Johnson' }).getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Approved: Marcus Johnson is excused')).toBeVisible()
  await page.getByRole('link', { name: 'Attendance' }).click()
  await expect(page.getByRole('table', { name: 'Attendance by member and event' })).toBeVisible()

  // Announcement to everyone, then the export.
  await page.getByRole('link', { name: 'Notify' }).click()
  await page.getByLabel('Title').fill('Formal tickets on sale')
  await page.getByLabel('Message').fill('Monday at noon in the chapter house.')
  await page.getByRole('button', { name: 'Send now' }).last().click()
  await expect(page.getByText('Sent', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Download .xlsx' }).click()
  await expect(page.getByText('Export ready')).toBeVisible()
  const saved = await page.evaluate(() => (window as unknown as { __saved?: { filename: string; size: number } }).__saved)
  expect(saved?.filename).toMatch(/\.xlsx$/)
  expect(saved?.size).toBeGreaterThan(5000)

  // Check-in: the admin creates an event happening now and opens its rotating code.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await page.getByRole('button', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'New event' }).click()
  const form = page.getByRole('dialog', { name: 'New event' })
  const start = chapterNow()
  await form.getByLabel('Title').fill('Demo check-in meeting')
  await form.getByLabel('Category').selectOption('required')
  await form.getByLabel('Starts').fill(hhmm(start))
  await form.getByLabel('Ends').first().fill(hhmm(new Date(start.getTime() + 90 * 60_000)))
  await form.getByRole('button', { name: 'Create' }).click()
  const agenda = page.locator('section[aria-labelledby="day-title"]')
  await agenda.getByRole('button', { name: /Demo check-in meeting/ }).click()
  await page.getByRole('link', { name: 'Check-in code' }).click()
  const code = (await page.getByTestId('checkin-code').textContent())!.trim()
  expect(code).toMatch(/^\d{6}$/)
  await page.getByRole('link', { name: 'Roster' }).click()

  // The brother types the code from the door.
  await signInAs(page, 'Marcus Johnson')
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await agenda.getByRole('button', { name: /Demo check-in meeting/ }).click()
  await page.getByRole('link', { name: 'Check in' }).click()
  await page.getByLabel('6-digit code').fill(code)
  await page.getByRole('button', { name: 'Check in' }).click()
  await expect(page.getByRole('heading', { name: 'You’re checked in' })).toBeVisible()

  // His inbox has the excuse decision and the announcement.
  await page.getByRole('link', { name: /Notifications/ }).click()
  await expect(page.getByText('Excuse approved')).toBeVisible()
  await expect(page.getByText('Formal tickets on sale')).toBeVisible()

  // Pledges don't get the members tab.
  await signInAs(page, 'Luke Garcia')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Members' })).toHaveCount(0)
})
