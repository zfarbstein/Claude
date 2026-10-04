import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { env } from './env'

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.')
}

// Sessions live in cookies (not localStorage) so that, once VITE_AUTH_COOKIE_DOMAIN is set
// to the parent domain, every hub app on a subdomain shares the same login.
export const supabase = createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  cookieOptions: env.authCookieDomain ? { domain: env.authCookieDomain } : undefined,
})

/** Calendar-app tables live in the `calendar` schema. */
export const cal = supabase.schema('calendar')

export const functionsUrl = `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1`
