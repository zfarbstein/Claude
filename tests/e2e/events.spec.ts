import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  chapterDate,
  chapterInstant,
  createMember,
  deleteUsers,
  expectCalendar,
  newMobilePage,
  openDay,
  service,
  signIn,
  uniqueEmail,
  agenda,
} from './support.ts'

const PASSWORD = 'Passw0rd2027'

test.describe('events and roles', () => {
  const users: string[] = []
  const tag = `E2E${Date.now()}`
  const date = chapterDate(1)
  let admin = '', brother = '', am = ''

  test.beforeAll(async () => {
    admin = uniqueEmail('admin')
    brother = uniqueEmail('brother')
    am = uniqueEmail('am')
    users.push(await createMember({ email: admin, password: PASSWORD, name: 'E2E Admin', role: 'admin' }))
    users.push(await createMember({ email: brother, password: PASSWORD, name: 'E2E Brother' }))
    users.push(await createMember({ email: am, password: PASSWORD, name: 'E2E AM', member_type: 'associate' }))
    const { error } = await service.schema('calendar').from('events').insert([
      { title: `${tag} Required`, category: 'required', starts_at: chapterInstant(date, '12:00'), ends_at: chapterInstant(date, '13:00') },
    ])
    if (error) throw error
  })

  test.afterAll(async () => {
    await service.schema('calendar').from('events').delete().like('title', `${tag}%`)
    await deleteUsers(users)
  })

  test('admin creates a hidden event; brothers see it, pledges never do; RSVPs persist', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await signIn(page, admin, PASSWORD)
    await expectCalendar(page)
    await openDay(page, date)

    await page.getByRole('button', { name: 'New event' }).click()
    const form = page.getByRole('dialog', { name: 'New event' })
    await form.getByLabel('Title').fill(`${tag} Rush planning`)
    await form.getByLabel('Category').selectOption('rush')
    await form.getByLabel('Starts').fill('18:00')
    await form.getByLabel('Ends').fill('19:30')
    await form.getByLabel('Location').fill('Library West')
    await form.getByLabel('Hide from pledges').check()
    await form.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Event created')).toBeVisible()
    await expect(agenda(page).getByRole('button', { name: new RegExp(`${tag} Rush planning`) })).toBeVisible()

    // Visible optional event for the RSVP check.
    await page.getByRole('button', { name: 'New event' }).click()
    await form.getByLabel('Title').fill(`${tag} Mixer`)
    await form.getByLabel('Category').selectOption('social')
    await form.getByRole('button', { name: 'Create' }).click()
    await expect(agenda(page).getByRole('button', { name: new RegExp(`${tag} Mixer`) })).toBeVisible()

    // Brother: sees everything, RSVPs to the mixer, cannot RSVP to the required event, cannot create events.
    const b = await newMobilePage(browser)
    await signIn(b, brother, PASSWORD)
    await expectCalendar(b)
    await openDay(b, date)
    await expect(agenda(b).getByRole('button', { name: new RegExp(`${tag} Rush planning`) })).toBeVisible()
    await expect(b.getByText('Hidden from pledges')).toBeVisible()
    await expect(b.getByRole('button', { name: 'New event' })).toHaveCount(0)
    await agenda(b).getByRole('button', { name: new RegExp(`${tag} Mixer`) }).click()
    const detail = b.getByRole('dialog')
    await detail.getByRole('button', { name: 'Going' }).click()
    await expect(detail.getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true')
    await detail.getByRole('button', { name: 'Close' }).click()
    await b.reload()
    await openDay(b, date)
    await expect(agenda(b).getByRole('button', { name: new RegExp(`${tag} Mixer`) })).toContainText('Going')
    await agenda(b).getByRole('button', { name: new RegExp(`${tag} Required`) }).click()
    await expect(b.getByRole('dialog').getByText('This is a required chapter event')).toBeVisible()
    await expect(b.getByRole('dialog').getByRole('button', { name: 'Going' })).toHaveCount(0)

    // Associate: the hidden event is absent from the UI and from the API.
    const a = await newMobilePage(browser)
    await signIn(a, am, PASSWORD)
    await expectCalendar(a)
    await openDay(a, date)
    await expect(agenda(a).getByRole('button', { name: new RegExp(`${tag} Mixer`) })).toBeVisible()
    await expect(agenda(a).getByRole('button', { name: new RegExp(`${tag} Rush planning`) })).toHaveCount(0)
    const amApi = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    await amApi.auth.signInWithPassword({ email: am, password: PASSWORD })
    const { data, error } = await amApi.schema('calendar').from('events').select('title').like('title', `${tag}%`)
    expect(error).toBeNull()
    expect(data!.map((r) => r.title).sort()).toEqual([`${tag} Mixer`, `${tag} Required`])
  })
})
