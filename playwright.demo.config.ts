import { defineConfig, devices } from '@playwright/test'

// Smoke test for the in-Claude demo build (no Supabase needed): npm run test:demo
export default defineConfig({
  testDir: 'tests/demo',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { baseURL: 'http://localhost:4180', trace: 'retain-on-failure', ...devices['Pixel 7'] },
  webServer: {
    command: 'node scripts/build-demo.mjs && npx vite preview --config vite.demo.config.ts --port 4180 --strictPort',
    url: 'http://localhost:4180/demo.html',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
