import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createMember, deleteUsers, expectCalendar, newMobilePage, service, signIn, uniqueEmail, waitForEmail } from './support.ts'

const PASSWORD = 'Passw0rd2027'

test.describe('admin panel: notifications, export, hub apps, settings', () => {
  const users: string[] = []
  const tag = `E2E${Date.now()}`
  let admin = '', brother = ''
  let nightStart = '19:00:00'

  test.beforeAll(async () => {
    admin = uniqueEmail('admin')
    brother = uniqueEmail('brother')
    users.push(await createMember({ email: admin, password: PASSWORD, name: `${tag} Admin`, role: 'admin' }))
    users.push(await createMember({ email: brother, password: PASSWORD, name: `${tag} Brother` }))
    const { data } = await service.schema('calendar').from('settings').select('night_start').single()
    nightStart = data?.night_start ?? nightStart
  })

  test.afterAll(async () => {
    await service.schema('calendar').from('settings').update({ night_start: nightStart }).eq('id', true)
    await service.from('hub_apps').delete().like('name', `${tag}%`)
    await service.schema('calendar').from('notifications').delete().like('title', `${tag}%`)
    await deleteUsers(users)
  })

  test('admins notify specific members: in-app inbox plus email when push is off', async ({ browser }) => {
    const adminPage = await newMobilePage(browser)
    await signIn(adminPage, admin, PASSWORD)
    await expectCalendar(adminPage)
    await adminPage.goto('/admin/notify')
    await adminPage.getByLabel('Title').fill(`${tag} Formal tickets`)
    await adminPage.getByLabel('Message').fill('On sale Monday at noon.')
    await adminPage.getByRole('radio', { name: /Specific members/ }).check()
    await adminPage.getByLabel('Search members').fill(`${tag} Brother`)
    await adminPage.getByRole('checkbox', { name: new RegExp(`${tag} Brother`) }).check()
    await expect(adminPage.getByLabel('Preview')).toContainText(`${tag} Formal tickets`)
    await adminPage.getByRole('button', { name: 'Send now' }).last().click()
    await expect(adminPage.getByText('Sent', { exact: true })).toBeVisible()
    await expect(adminPage.getByRole('listitem').filter({ hasText: `${tag} Formal tickets` })).toContainText('1 people, 0 by push, 1 by email')

    const mail = await waitForEmail(brother, `${tag} Formal tickets`)
    expect(mail.text).toContain('On sale Monday at noon.')

    const page = await newMobilePage(browser)
    await signIn(page, brother, PASSWORD)
    await expectCalendar(page)
    await page.getByRole('link', { name: /Notifications, \d+ unread/ }).click()
    await expect(page.getByRole('button', { name: new RegExp(`${tag} Formal tickets`) })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Notifications' })).toBeVisible()
  })

  test('the Excel export downloads a workbook', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await signIn(page, admin, PASSWORD)
    await expectCalendar(page)
    await page.goto('/admin/export')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .xlsx' }).click()])
    expect(download.suggestedFilename()).toMatch(/-export-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const bytes = await readFile((await download.path())!)
    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(bytes.length).toBeGreaterThan(5000)
  })

  test('hub apps appear in everyone’s Apps menu; settings change the night window', async ({ browser }) => {
    const adminPage = await newMobilePage(browser)
    await signIn(adminPage, admin, PASSWORD)
    await expectCalendar(adminPage)
    await adminPage.goto('/admin/apps')
    await adminPage.getByLabel('Name').fill(`${tag} Dues`)
    await adminPage.getByLabel('Link').fill('https://dues.example.com')
    await adminPage.getByLabel('Icon').fill('💵')
    await adminPage.getByRole('button', { name: 'Add app' }).click()
    await expect(adminPage.getByText('App added')).toBeVisible()

    await adminPage.goto('/admin/settings')
    await adminPage.getByLabel('Night starts').fill('18:00')
    await adminPage.getByRole('button', { name: 'Save settings' }).click()
    await expect(adminPage.getByText('Settings saved')).toBeVisible()

    const page = await newMobilePage(browser)
    await signIn(page, brother, PASSWORD)
    await expectCalendar(page)
    await page.getByRole('button', { name: 'Apps' }).click()
    await expect(page.getByRole('link', { name: new RegExp(`${tag} Dues`) })).toHaveAttribute('href', 'https://dues.example.com')
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Availability' }).click()
    await expect(page.getByText('Members free each night, 6–11 PM.')).toBeVisible()
  })
})
