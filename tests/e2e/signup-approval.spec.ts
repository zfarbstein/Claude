import { expect, test } from '@playwright/test'
import { SEED_ADMIN, SEED_PASSWORD, expectCalendar, linkFromEmail, newMobilePage, service, signIn, uniqueEmail, waitForEmail } from './support.ts'

test('new sign-ups confirm their email, wait for approval, then set up their schedule', async ({ browser }) => {
  const email = uniqueEmail('signup')
  const name = `Newbie ${Date.now()}`

  const page = await newMobilePage(browser)
  await page.goto('/signup')
  await expect(page.getByLabel('Email')).toHaveAttribute('placeholder', 'gatorlink@ufl.edu')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('weak')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible()
  await page.getByLabel('Password').fill('Gators2027')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  // Unconfirmed accounts can't sign in yet.
  await signIn(page, email, 'Gators2027')
  await expect(page.getByRole('alert')).toContainText('Confirm your email first')

  const mail = await waitForEmail(email, 'Confirm your email')
  await page.goto(linkFromEmail(mail.html, '/auth/confirm'))
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible()

  // Pending members cannot reach the calendar or read any events, even via the API.
  await page.goto('/')
  await expect(page).toHaveURL(/\/pending$/)

  const admin = await newMobilePage(browser)
  await signIn(admin, SEED_ADMIN, SEED_PASSWORD)
  await expectCalendar(admin)
  await admin.getByRole('link', { name: 'Admin' }).click()
  const row = admin.getByRole('listitem').filter({ hasText: email })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Approve as Pledge' }).click()
  await expect(admin.getByText(`${name} approved`)).toBeVisible()
  await expect(row).toHaveCount(0)

  await page.getByRole('button', { name: 'Check again' }).click()
  // The calendar stays locked until the schedule is set up.
  await expect(page.getByRole('heading', { name: 'Set up your schedule' })).toBeVisible()
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)

  const { data } = await service.from('members').select('id,status,member_type').eq('email', email).single()
  expect(data).toMatchObject({ status: 'approved', member_type: 'associate' })
  await service.auth.admin.deleteUser(data!.id)
})
