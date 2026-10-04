import { useQuery } from '@tanstack/react-query'
import { cal } from './supabase'
import { unwrap } from './query'
import type { Settings } from './types'

export const settingsKey = ['settings'] as const

/** Chapter-wide settings (night window, excuse rules, reminders). */
export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async (): Promise<Settings> => unwrap(await cal.from('settings').select('*').single()),
    staleTime: 5 * 60_000,
  })
}
