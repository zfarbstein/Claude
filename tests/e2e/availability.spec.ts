import { expect, test } from '@playwright/test'
import { chapterDate, chapterInstant, createMember, deleteUsers, expectCalendar, newMobilePage, openDay, service, signIn, uniqueEmail } from './support.ts'

const PASSWORD = 'Passw0rd2027'

/** A night 2–8 days out that isn't a Sunday (seeded chapter meetings are Sunday nights). */
function quietNight(): string {
  for (let i = 2; i < 9; i++) {
    const d = chapterDate(i)
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) return d
  }
  throw new Error('no quiet night')
}

test.describe('availability and the members tab', () => {
  const users: string[] = []
  const tag = `E2E${Date.now()}`
  const night = quietNight()
  const requiredNight = chapterDate(9)
  let admin = '', brother = '', pledge = ''

  test.beforeAll(async () => {
    admin = uniqueEmail('admin')
    brother = uniqueEmail('brother')
    pledge = uniqueEmail('pledge')
    users.push(await createMember({ email: admin, password: PASSWORD, name: `${tag} Admin`, role: 'admin' }))
    users.push(await createMember({ email: brother, password: PASSWORD, name: `${tag} Brother` }))
    users.push(await createMember({ email: pledge, password: PASSWORD, name: `${tag} Pledge`, member_type: 'associate' }))
    const { error } = await service.schema('calendar').from('events').insert({
      title: `${tag} Required night`,
      category: 'required',
      starts_at: chapterInstant(requiredNight, '19:30'),
      ends_at: chapterInstant(requiredNight, '20:30'),
    })
    if (error) throw error
  })

  test.afterAll(async () => {
    await service.schema('calendar').from('events').delete().like('title', `${tag}%`)
    await deleteUsers(users)
  })

  test('brothers mark nights unavailable; admins see who and why; required nights point to the excuse form', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await signIn(page, brother, PASSWORD)
    await expectCalendar(page)
    await page.getByRole('button', { name: 'Availability' }).click()
    await expect(page.getByTestId('submitted-count')).toHaveText(/\d+\/\d+ submitted/)

    await openDay(page, night)
    const panel = page.locator('section[aria-labelledby="night-title"]')
    await expect(panel.getByText('You’re free this night.')).toBeVisible()
    await panel.getByLabel('Reason (optional)').fill(`${tag} family dinner`)
    await panel.getByRole('button', { name: 'I can’t make it this night' }).click()
    await expect(panel.getByText('You marked yourself unavailable.')).toBeVisible()
    await expect(panel.getByText(`${tag} family dinner`)).toBeVisible()
    await expect(page.locator(`[data-day="${night}"]`)).toHaveAttribute('aria-label', /You: out/)

    await openDay(page, requiredNight)
    await expect(panel.getByText(`${tag} Required night`)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'I can’t make it this night' })).toHaveCount(0)
    await panel.getByRole('link', { name: 'Request an excuse' }).click()
    await expect(page).toHaveURL(/\/excuse\?event=/)
    await expect(page.getByRole('combobox', { name: 'Event' })).toHaveValue(/[0-9a-f-]{36}/)

    const adminPage = await newMobilePage(browser)
    await signIn(adminPage, admin, PASSWORD)
    await expectCalendar(adminPage)
    await adminPage.getByRole('button', { name: 'Availability' }).click()
    await openDay(adminPage, night)
    const who = adminPage.getByRole('group', { name: "Who's free" })
    await expect(who.getByRole('listitem').filter({ hasText: `${tag} Brother` })).toContainText(`Marked unavailable: ${tag} family dinner`)
  })

  test('brothers browse members (busy times only); pledges have no members tab', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await signIn(page, brother, PASSWORD)
    await expectCalendar(page)
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Members' }).click()
    await page.getByLabel('Search members').fill(`${tag} Admin`)
    await page.getByRole('link', { name: new RegExp(`${tag} Admin`) }).click()
    await expect(page.getByRole('heading', { name: 'Every week' })).toBeVisible()
    await expect(page.getByText('You see when they’re busy, not what they’re doing.')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Nights/ })).toBeVisible()

    const pledgePage = await newMobilePage(browser)
    await signIn(pledgePage, pledge, PASSWORD)
    await expectCalendar(pledgePage)
    await expect(pledgePage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Members' })).toHaveCount(0)
    await pledgePage.goto('/members')
    await expectCalendar(pledgePage)
    await pledgePage.getByRole('button', { name: 'Availability' }).click()
    await expect(pledgePage.getByText('Your nights. Tap one to mark it unavailable.')).toBeVisible()
  })
})
