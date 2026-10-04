import { describe, expect, it } from 'vitest'
import { clock, clockRange, freeShare, heatStyle, statusStyle } from './heat'

describe('heatStyle', () => {
  it('is gray (null) when nothing is known', () => {
    expect(heatStyle({ free: 0, busy: 0, total: 0 })).toBeNull()
    expect(heatStyle({ free: 0, busy: 0, total: 12 })).toBeNull()
  })
  it('goes from red to green by share free, with unknown members counted as not free', () => {
    expect(heatStyle({ free: 0, busy: 10, total: 10 })?.backgroundColor).toBe('hsl(0 70% 86%)')
    expect(heatStyle({ free: 10, busy: 0, total: 10 })?.backgroundColor).toBe('hsl(130 70% 86%)')
    expect(heatStyle({ free: 5, busy: 0, total: 10 })?.backgroundColor).toBe('hsl(65 70% 86%)')
    expect(freeShare({ free: 70, total: 100 })).toBe(0.7)
  })
  it('colors a member’s own night', () => {
    expect(statusStyle('free')?.backgroundColor).toContain('130')
    expect(statusStyle('busy')?.backgroundColor).toContain('hsl(0')
    expect(statusStyle('unknown')).toBeNull()
  })
})

describe('clock', () => {
  it('formats night windows', () => {
    expect(clock('19:00')).toBe('7 PM')
    expect(clock('08:05')).toBe('8:05 AM')
    expect(clockRange('19:00', '23:00')).toBe('7–11 PM')
    expect(clockRange('21:00', '01:00')).toBe('9 PM–1 AM')
  })
})
