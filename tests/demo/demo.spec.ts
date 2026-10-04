import { expect, test, type Page } from '@playwright/test'

const day = (offset: number) => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  now.setDate(now.getDate() + offset)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

async function openDay(page: Page, date: string) {
  for (let i = 0; i < 3; i++) {
    const cell = page.locator(`[data-day="${date}"]`)
    if (await cell.count()) return cell.click()
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  throw new Error(`Day ${date} not found`)
}

async function signInAs(page: Page, label: string) {
  const tools = page.getByRole('dialog', { name: 'Demo tools' })
  if (!(await tools.isVisible())) await page.getByRole('button', { name: /^Demo/ }).click()
  await tools.getByRole('tab', { name: 'Sign in as' }).click()
  await tools.getByRole('button', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
}

test('demo: roles, hidden events, event creation, password reset through the demo inbox', async ({ page }) => {
  await page.goto('/demo.html')
  // First visit opens the demo tools.
  await expect(page.getByRole('dialog', { name: 'Demo tools' })).toBeVisible()

  // Brother sees the hidden rush planning event.
  await signInAs(page, 'Brother')
  await openDay(page, day(2))
  await expect(page.getByRole('button', { name: /Rush planning/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New event' })).toHaveCount(0)

  // Associate member does not.
  await signInAs(page, 'Associate Member')
  await openDay(page, day(2))
  await expect(page.getByText('Nothing scheduled.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)

  // Admin creates an event.
  await signInAs(page, 'Admin')
  await openDay(page, day(1))
  await page.getByRole('button', { name: 'New event' }).click()
  const form = page.getByRole('dialog', { name: 'New event' })
  await form.getByLabel('Title').fill('Demo test social')
  await form.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('button', { name: /Demo test social/ })).toBeVisible()

  // Pending account sees the waiting screen.
  await signInAs(page, 'Waiting for approval')
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  // Password reset through the demo inbox.
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email').fill('brother2@example.com')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('If an account exists for brother2@example.com')).toBeVisible()
  await page.getByRole('button', { name: /^Demo/ }).click()
  const tools = page.getByRole('dialog', { name: 'Demo tools' })
  await tools.getByRole('button', { name: /Reset your password/ }).click()
  await tools.getByRole('button', { name: 'Choose a new password' }).click()
  await page.getByLabel('New password', { exact: true }).fill('Gators2027')
  await page.getByLabel('Confirm new password').fill('Gators2027')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()

  // State survives a reload; reset restores the sample data.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
  await page.getByRole('button', { name: /^Demo/ }).click()
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
