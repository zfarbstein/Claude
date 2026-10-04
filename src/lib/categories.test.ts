import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, contrastRatio, textColorOn } from './categories'

describe('categories', () => {
  it('every category color passes WCAG AA (4.5:1) with its text color', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(contrastRatio(c.color, textColorOn(c.color)), c.label).toBeGreaterThanOrEqual(4.5)
      expect(textColorOn(c.color), c.label).toBe('#FFFFFF')
    }
  })

  it('matches the categories seeded by the migration', () => {
    const file = readdirSync('supabase/migrations').find((f) => f.endsWith('_calendar_events.sql'))!
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
    for (const c of DEFAULT_CATEGORIES) {
      expect(sql).toMatch(new RegExp(`\\('${c.key}',\\s*'${c.label.replace('/', '\\/')}',\\s*'${c.color}',\\s*${c.sort_order}\\)`))
    }
  })

  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})
