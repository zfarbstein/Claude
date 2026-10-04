import type { Category } from './types'

/** Mirrors the seed in supabase/migrations/*_calendar_events.sql (checked by a test). */
export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'social', label: 'Socials', color: '#7C3AED', sort_order: 1 },
  { key: 'philanthropy', label: 'Philanthropy', color: '#BE185D', sort_order: 2 },
  { key: 'rush', label: 'Rush', color: '#C2410C', sort_order: 3 },
  { key: 'required', label: 'Required Chapter Event', color: '#1D4ED8', sort_order: 4 },
  { key: 'exam', label: 'Exams', color: '#A16207', sort_order: 5 },
  { key: 'school', label: 'School/Involvement Obligations', color: '#0F766E', sort_order: 6 },
  { key: 'personal', label: 'Personal', color: '#4B5563', sort_order: 7 },
]

function channel(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** White or near-black, whichever reads better on the given background. */
export function textColorOn(hex: string): string {
  return contrastRatio(hex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#111827'
}
