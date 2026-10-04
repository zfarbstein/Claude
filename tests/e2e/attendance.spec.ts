import { expect, test, type Page } from '@playwright/test'
import { chapterDate, chapterInstant, createMember, deleteUsers, newMobilePage, service, signIn, uniqueEmail, waitForEmail, expectCalendar } from './support.ts'

const PASSWORD = 'Passw0rd2027'
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64')

async function currentCode(page: Page, eventId: string): Promise<string> {
  await page.goto(`/attendance/${eventId}/code`)
  const code = page.getByTestId('checkin-code')
  await expect(code).toHaveText(/^\d{6}$/)
  return (await code.textContent())!.trim()
}

test.describe('attendance and excuses', () => {
  const users: string[] = []
  const tag = `E2E${Date.now()}`
  let admin = '', brother = '', pledge = ''
  let liveId = '', futureId = ''

  test.beforeAll(async () => {
    admin = uniqueEmail('admin')
    brother = uniqueEmail('brother')
    pledge = uniqueEmail('pledge')
    users.push(await createMember({ email: admin, password: PASSWORD, name: `${tag} Admin`, role: 'admin' }))
    users.push(await createMember({ email: brother, password: PASSWORD, name: `${tag} Brother` }))
    users.push(await createMember({ email: pledge, password: PASSWORD, name: `${tag} Pledge`, member_type: 'associate' }))
    const now = Date.now()
    const future = chapterDate(3)
    const { data, error } = await service
      .schema('calendar')
      .from('events')
      .insert([
        { title: `${tag} Meeting now`, category: 'required', starts_at: new Date(now - 5 * 60_000).toISOString(), ends_at: new Date(now + 3600_000).toISOString() },
        { title: `${tag} Future meeting`, category: 'required', starts_at: chapterInstant(future, '19:00'), ends_at: chapterInstant(future, '20:00') },
      ])
      .select('id,title')
    if (error) throw error
    liveId = data.find((e) => e.title.endsWith('now'))!.id
    futureId = data.find((e) => e.title.endsWith('meeting'))!.id
  })

  test.afterAll(async () => {
    await service.schema('calendar').from('events').delete().like('title', `${tag}%`)
    await deleteUsers(users)
  })

  test('members check in with the rotating code; admins mark the rest by hand', async ({ browser }) => {
    const adminPage = await newMobilePage(browser)
    await signIn(adminPage, admin, PASSWORD)
    await expectCalendar(adminPage)
    const code = await currentCode(adminPage, liveId)

    const brotherPage = await newMobilePage(browser)
    await signIn(brotherPage, brother, PASSWORD)
    await expectCalendar(brotherPage)
    await brotherPage.goto(`/checkin?e=${liveId}&c=${code}`)
    await expect(brotherPage.getByRole('heading', { name: 'You’re checked in' })).toBeVisible()

    // The pledge types the code instead of scanning; a wrong one is refused first.
    const pledgePage = await newMobilePage(browser)
    await signIn(pledgePage, pledge, PASSWORD)
    await expectCalendar(pledgePage)
    await pledgePage.goto(`/scan?event=${liveId}`)
    await pledgePage.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000')
    await pledgePage.getByRole('button', { name: 'Check in' }).click()
    await expect(pledgePage.getByText('That code expired or is wrong.', { exact: false })).toBeVisible()
    await pledgePage.getByLabel('6-digit code').fill(await currentCode(adminPage, liveId))
    await pledgePage.getByRole('button', { name: 'Check in' }).click()
    await expect(pledgePage.getByRole('heading', { name: 'You’re checked in' })).toBeVisible()

    await adminPage.goto(`/attendance/${liveId}`)
    const brotherRow = adminPage.getByRole('group', { name: `${tag} Brother attendance` })
    await expect(brotherRow.getByRole('button', { name: 'Present' })).toHaveAttribute('aria-pressed', 'true')
    const pledgeRow = adminPage.getByRole('group', { name: `${tag} Pledge attendance` })
    await pledgeRow.getByRole('button', { name: 'Excused' }).click()
    await expect(pledgeRow.getByRole('button', { name: 'Excused' })).toHaveAttribute('aria-pressed', 'true')
    await adminPage.reload()
    await expect(adminPage.getByRole('group', { name: `${tag} Pledge attendance` }).getByRole('button', { name: 'Excused' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('excuse with proof emails the secretary; approving marks the member excused and tells them', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await signIn(page, brother, PASSWORD)
    await expectCalendar(page)
    await page.goto(`/excuse?event=${futureId}`)
    await page.getByLabel('Reason').fill(`${tag} lab practical make-up`)
    await page.locator('#excuse-file').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG })
    await page.getByRole('button', { name: 'Submit excuse' }).click()
    await expect(page.getByText('Excuse sent to the secretary')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: `${tag} Future meeting` })).toContainText('Waiting for review')

    const mail = await waitForEmail('secretary@example.com', `Excuse from ${tag} Brother`)
    expect(mail.text).toContain(`${tag} lab practical make-up`)

    const adminPage = await newMobilePage(browser)
    await signIn(adminPage, admin, PASSWORD)
    await expectCalendar(adminPage)
    await adminPage.goto('/admin/excuses')
    const card = adminPage.getByRole('article', { name: `Excuse from ${tag} Brother` })
    await expect(card.getByRole('button', { name: 'View proof' })).toBeVisible()
    await card.getByLabel('Note to the member (optional)').fill('Feel better')
    await card.getByRole('button', { name: 'Approve' }).click()
    await expect(adminPage.getByText(`Approved: ${tag} Brother is excused`)).toBeVisible()

    await adminPage.goto(`/attendance/${futureId}`)
    const row = adminPage.getByRole('group', { name: `${tag} Brother attendance` })
    await expect(row.getByRole('button', { name: 'Excused' })).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/inbox')
    await expect(page.getByText('Excuse approved')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(`${tag} Future meeting: Feel better`)).toBeVisible()
  })
})
