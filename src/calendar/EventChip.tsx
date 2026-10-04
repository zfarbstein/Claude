import type { CSSProperties } from 'react'
import { textColorOn } from '../lib/categories'
import { cx } from '../lib/cx'
import { shortTime } from '../lib/time'
import type { DisplayEvent } from '../lib/types'

const CLAMP = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' } as const

/**
 * Colored label for an event inside a calendar cell. Chapter events are solid; the member's
 * own exams and obligations are outlined so they read as "mine".
 */
export function EventChip({
  event,
  color = '#4B5563',
  lines,
  showTime = 'wide',
}: {
  event: DisplayEvent
  color?: string
  lines: keyof typeof CLAMP
  showTime?: 'always' | 'wide'
}) {
  const style: CSSProperties = event.personal
    ? { borderColor: color, color, backgroundColor: '#fff', overflowWrap: 'anywhere' }
    : { borderColor: color, backgroundColor: color, color: textColorOn(color), overflowWrap: 'anywhere' }
  return (
    <span
      style={style}
      className={cx(
        'block w-full rounded-sm border px-px py-px text-[10px] leading-[1.2] font-semibold tracking-tight hyphens-auto sm:rounded sm:px-1 sm:text-xs sm:tracking-normal',
        CLAMP[lines],
      )}
    >
      {!event.all_day && (
        <span className={cx('font-bold', showTime === 'wide' && 'hidden sm:inline')}>{shortTime(event.starts_at)} </span>
      )}
      {event.title}
    </span>
  )
}
