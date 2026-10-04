import type { NightReason } from '../lib/types'
import { clockRange } from './heat'

/** "Shift at Publix (6–10 PM)", "Marked unavailable: Family dinner" */
export function reasonText(r: NightReason): string {
  if (r.kind === 'mark') return r.label ? `Marked unavailable: ${r.label}` : 'Marked unavailable'
  const when = r.start && r.end ? ` (${clockRange(r.start, r.end)})` : ''
  return `${r.label ?? 'Busy'}${when}`
}
