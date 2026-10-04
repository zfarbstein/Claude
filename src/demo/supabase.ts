// Demo build only: replaces src/lib/supabase.ts (see vite.demo.config.ts) with a client whose
// requests are answered in the browser by ./backend.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { DEMO_ANON_KEY, DEMO_URL, demoFetch } from './backend'

const memory = new Map<string, string>()
const storage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      memory.set(key, value)
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key)
    } catch {
      memory.delete(key)
    }
  },
}

export const supabase = createClient<Database>(DEMO_URL, DEMO_ANON_KEY, {
  global: { fetch: demoFetch },
  auth: {
    storage,
    storageKey: 'chapter-calendar-demo-auth',
    flowType: 'pkce',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
})

export const cal = supabase.schema('calendar')

export const functionsUrl = `${DEMO_URL}/functions/v1`
