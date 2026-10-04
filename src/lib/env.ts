export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) || 'Chapter Calendar',
  authCookieDomain: (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined) || undefined,
}
