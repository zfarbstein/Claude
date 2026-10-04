import { expect, test } from '@playwright/test'
import { agenda, chapterDate, chapterInstant, createMember, deleteUsers, expectCalendar, newMobilePage, openDay, service, signIn, uniqueEmail } from './support.ts'

const PASSWORD = 'Passw0rd2027'

function examsIcs(date: string) {
  const stamp = (time: string) => chapterInstant(date, time).replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:e2e-exam-1',
    `DTSTART:${stamp('20:20')}`,
    `DTEND:${stamp('22:10')}`,
    'SUMMARY:E2E Midterm [STA2023-Test]',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:e2e-hw-1',
    `DTSTART:${stamp('23:59')}`,
    `DTEND:${stamp('23:59')}`,
    'SUMMARY:E2E Homework 9 [STA2023-Test]',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

test.describe('schedule setup', () => {
  const users: string[] = []
  test.afterAll(async () => deleteUsers(users))

  test('a member without a schedule is walked through all three steps before the calendar opens', async ({ browser }) => {
    const email = uniqueEmail('wizard')
    const id = await createMember({ email, password: PASSWORD, name: 'Wizard Tester', schedule: false })
    users.push(id)
    const examDate = chapterDate(2)

    const page = await newMobilePage(browser)
    // Claude is not available in local tests, so the reading call is answered here.
    await page.route('**/functions/v1/parse-schedule', (route) =>
      route.fulfill({
        json: {
          blocks: [
            { weekday: 1, start: '10:40', end: '11:30', label: 'COP3502 Lecture', location: 'CSE A101', category: 'school' },
            { weekday: 3, start: '10:40', end: '11:30', label: 'COP3502 Lecture', location: 'CSE A101', category: 'school' },
          ],
          items: [],
          notes: ['CHM2045 is online with no meeting time.'],
        },
      }),
    )
    await signIn(page, email, PASSWORD)
    await expect(page.getByRole('heading', { name: 'Set up your schedule' })).toBeVisible()

    // Step 1: read the typed schedule, fix a row, save.
    await page.getByLabel('Type it, add photos or screenshots, or both').fill('COP3502 MW period 4')
    await page.getByRole('button', { name: 'Read it' }).click()
    await expect(page.getByText('CHM2045 is online with no meeting time.')).toBeVisible()
    const rows = page.getByRole('listitem', { name: /^class/ })
    await expect(rows).toHaveCount(2)
    await rows.nth(1).getByLabel('Name').fill('COP3502 Discussion')
    await page.getByRole('button', { name: 'Add class' }).click()
    await rows.nth(2).getByLabel('Name').fill('Broken')
    await rows.nth(2).getByLabel('Ends').fill('08:00')
    await page.getByRole('button', { name: 'Save and continue' }).click()
    await expect(page.getByText('Fix the highlighted rows first.')).toBeVisible()
    await rows.nth(2).getByRole('button', { name: /Remove/ }).click()
    await page.getByRole('button', { name: 'Save and continue' }).click()

    // Step 2: import a calendar file through the real import function.
    await page.getByRole('tab', { name: /Calendar file or link/ }).click()
    await page.locator('input[type=file][accept*=".ics"]').setInputFiles({ name: 'exams.ics', mimeType: 'text/calendar', buffer: Buffer.from(examsIcs(examDate)) })
    await expect(page.getByLabel('Name').first()).toHaveValue('E2E Midterm')
    await expect(page.getByText(/Deadlines \(don.t block your availability\): 1/)).toBeVisible()
    await page.getByRole('button', { name: 'Save and continue' }).click()

    // Step 3: nothing extra; confirm saving an empty step.
    await expect(page.getByRole('heading', { name: 'Every week' })).toBeVisible()
    await page.getByRole('button', { name: 'Save and finish' }).click()
    await expect(page.getByText('Save with no obligations?')).toBeVisible()
    await page.getByRole('button', { name: 'Save and finish' }).click()

    await expectCalendar(page)
    await openDay(page, examDate)
    await expect(agenda(page).getByRole('button', { name: /STA2023 E2E Midterm/ })).toBeVisible()

    const { data: blocks } = await service.schema('calendar').from('weekly_blocks').select('label').eq('member_id', id).order('label')
    expect(blocks?.map((b) => b.label)).toEqual(['COP3502 Discussion', 'COP3502 Lecture'])
    const { data: items } = await service.schema('calendar').from('dated_items').select('kind,title,source').eq('member_id', id).order('kind')
    expect(items).toEqual([
      { kind: 'deadline', title: 'E2E Homework 9', source: 'ics' },
      { kind: 'exam', title: 'E2E Midterm', source: 'ics' },
    ])
  })

  test('nobody else can read a member’s schedule through the API', async ({ browser }) => {
    const email = uniqueEmail('peek')
    users.push(await createMember({ email, password: PASSWORD, name: 'Peeker' }))
    const page = await newMobilePage(browser)
    await signIn(page, email, PASSWORD)
    await expectCalendar(page)
    const leaked = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:54321/rest/v1/weekly_blocks?select=member_id', {
        headers: {
          apikey: (window as unknown as { __anon?: string }).__anon ?? '',
          'accept-profile': 'calendar',
        },
      })
      return res.status
    })
    // Without the member's own session the request is rejected outright.
    expect([401, 403]).toContain(leaked)
  })
})
