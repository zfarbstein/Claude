import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'

// Points the tests (and the dev server) at the local Supabase stack from `npx supabase start`.
function localSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  process.env.SUPABASE_URL = status.API_URL
  process.env.SUPABASE_ANON_KEY = status.ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY
  process.env.MAILPIT_URL ??= status.MAILPIT_URL ?? status.INBUCKET_URL
}
localSupabase()

// Must match auth.site_url in supabase/config.toml: email links point here.
const baseURL = 'http://localhost:5173'
const prodBuild = !!process.env.CI || !!process.env.E2E_PROD

export default defineConfig({
  testDir: 'tests/e2e',
  // One shared database and inbox: run serially so tests never race each other.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: prodBuild ? 'npm run build && npm run preview' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: process.env.SUPABASE_URL!,
      VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    },
  },
})
