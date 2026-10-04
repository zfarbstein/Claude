import { expect, test } from '@playwright/test'
import { createMember, deleteUsers, expectCalendar, linkFromEmail, newMobilePage, signIn, uniqueEmail, waitForEmail } from './support.ts'

const OLD_PASSWORD = 'OldPassw0rd'
const NEW_PASSWORD = 'NewPassw0rd2027'

test.describe('password reset', () => {
  const created: string[] = []
  test.afterAll(async () => deleteUsers(created))

  test('request reset -> email -> follow link on another device -> set password -> sign in with it', async ({ browser }) => {
    const email = uniqueEmail('reset')
    created.push(await createMember({ email, password: OLD_PASSWORD, name: 'Reset Tester' }))

    // 1. Request the reset from the login page.
    const page = await newMobilePage(browser)
    await page.goto('/login')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('status')).toContainText(`If an account exists for ${email}`)

    // 2. Receive the email in the test inbox.
    const mail = await waitForEmail(email, 'Reset your password')
    const link = linkFromEmail(mail.html, '/reset-password')
    expect(new URL(link).searchParams.get('type')).toBe('recovery')
    expect(new URL(link).searchParams.get('token_hash')).toBeTruthy()

    // 3. Follow the link in a fresh browser (no cookies), like opening the email on a phone.
    const phone = await newMobilePage(browser)
    await phone.goto(link)
    await expect(phone.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

    // Validation errors must not burn the one-time token.
    await phone.getByLabel('New password', { exact: true }).fill('short')
    await phone.getByLabel('Confirm new password').fill('short')
    await phone.getByRole('button', { name: 'Save new password' }).click()
    await expect(phone.getByText('Use at least 8 characters.')).toBeVisible()
    await phone.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await phone.getByLabel('Confirm new password').fill(NEW_PASSWORD + 'x')
    await phone.getByRole('button', { name: 'Save new password' }).click()
    await expect(phone.getByText('The passwords don’t match.')).toBeVisible()

    // 4. Set the new password.
    await phone.getByLabel('Confirm new password').fill(NEW_PASSWORD)
    await phone.getByRole('button', { name: 'Save new password' }).click()
    await expect(phone.getByRole('heading', { name: 'Password updated' })).toBeVisible()
    await phone.getByRole('button', { name: 'Continue' }).click()
    await expectCalendar(phone)

    // The link is single-use.
    const reuse = await newMobilePage(browser)
    await reuse.goto(link)
    await reuse.getByLabel('New password', { exact: true }).fill('AnotherPass123')
    await reuse.getByLabel('Confirm new password').fill('AnotherPass123')
    await reuse.getByRole('button', { name: 'Save new password' }).click()
    await expect(reuse.getByRole('heading', { name: 'This link has expired' })).toBeVisible()

    // 5. The old password no longer works; the new one does.
    const fresh = await newMobilePage(browser)
    await signIn(fresh, email, OLD_PASSWORD)
    await expect(fresh.getByRole('alert')).toHaveText('Wrong email or password.')
    await signIn(fresh, email, NEW_PASSWORD)
    await expectCalendar(fresh)
  })

  test('a link with a bad token shows the expired screen', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await page.goto('/reset-password?token_hash=pkce_not-a-real-token&type=recovery')
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save new password' }).click()
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
    await page.getByRole('link', { name: 'Request a new link' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('the reset page without a link or session asks for a new link', async ({ browser }) => {
    const page = await newMobilePage(browser)
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
  })
})
