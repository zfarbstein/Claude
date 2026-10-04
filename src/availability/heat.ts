import type { CSSProperties } from 'react'
import type { NightCount, NightStatus } from '../lib/types'

const RED_HUE = 0
const GREEN_HUE = 130

/** Share of the chapter free that night. Members without a schedule count as not free. */
export const freeShare = (n: Pick<NightCount, 'free' | 'total'>) => (n.total > 0 ? n.free / n.total : 0)

/** Cell colors from red (nobody free) to green (everyone free); null when nothing is known. */
export function heatStyle(n: Pick<NightCount, 'free' | 'busy' | 'total'>): CSSProperties | null {
  if (n.total === 0 || n.free + n.busy === 0) return null
  const hue = Math.round(RED_HUE + (GREEN_HUE - RED_HUE) * freeShare(n))
  return { backgroundColor: `hsl(${hue} 70% 86%)`, color: `hsl(${hue} 65% 18%)` }
}

/** One member's own night: green free, red busy, gray unknown. */
export function statusStyle(status: NightStatus): CSSProperties | null {
  if (status === 'free') return { backgroundColor: `hsl(${GREEN_HUE} 70% 86%)`, color: `hsl(${GREEN_HUE} 65% 18%)` }
  if (status === 'busy') return { backgroundColor: `hsl(${RED_HUE} 70% 86%)`, color: `hsl(${RED_HUE} 65% 18%)` }
  return null
}

export const STATUS_LABELS: Record<NightStatus, string> = { free: 'Free', busy: 'Busy', unknown: 'No schedule' }

/** '19:00' -> '7 PM', '20:30' -> '8:30 PM' */
export function clock(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** '19:00', '23:00' -> '7–11 PM'; '21:00', '01:00' -> '9 PM–1 AM' */
export function clockRange(start: string, end: string): string {
  const a = clock(start)
  const b = clock(end)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}
