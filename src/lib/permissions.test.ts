import { describe, expect, it } from 'vitest'
import { canManageEvent, canRsvp, isAdmin, isBrother, manageableCategories } from './permissions'
import type { Member } from './types'

const member = (over: Partial<Member>): Member => ({
  id: 'm1', name: 'Test', email: 't@example.com', role: 'member', member_type: 'brother', pledge_class: null,
  status: 'approved', active: true, approved_at: null, approved_by: null, created_at: '', updated_at: '', ...over,
})
const ALL = ['social', 'philanthropy', 'rush', 'required']

describe('permissions', () => {
  it('pending, rejected and inactive members get nothing', () => {
    for (const m of [member({ status: 'pending' }), member({ status: 'rejected' }), member({ active: false, role: 'admin' })]) {
      expect(isAdmin(m)).toBe(false)
      expect(isBrother(m)).toBe(false)
      expect(manageableCategories(m, ALL, ALL)).toEqual([])
    }
  })

  it('admins manage everything; chairs only their categories; members nothing', () => {
    expect(manageableCategories(member({ role: 'admin' }), [], ALL)).toEqual(ALL)
    expect(manageableCategories(member({ role: 'chair' }), ['social'], ALL)).toEqual(['social'])
    expect(manageableCategories(member({}), ['social'], ALL)).toEqual([])
    expect(canManageEvent(member({ role: 'chair' }), ['social'], { category: 'rush' })).toBe(false)
    expect(canManageEvent(member({ role: 'chair' }), ['social'], { category: 'social' })).toBe(true)
  })

  it('only allows RSVPs on open, optional, future events', () => {
    const future = new Date(Date.now() + 3600_000).toISOString()
    const past = new Date(Date.now() - 3600_000).toISOString()
    expect(canRsvp({ required: false, rsvp_enabled: true, ends_at: future })).toBe(true)
    expect(canRsvp({ required: true, rsvp_enabled: true, ends_at: future })).toBe(false)
    expect(canRsvp({ required: false, rsvp_enabled: false, ends_at: future })).toBe(false)
    expect(canRsvp({ required: false, rsvp_enabled: true, ends_at: past })).toBe(false)
  })
})
