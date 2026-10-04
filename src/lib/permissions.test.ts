import { describe, expect, it } from 'vitest'
import { accessFields, accessOf, canManageEvents, canRsvp, isAdmin, isBrother, isPledge } from './permissions'
import type { Member } from './types'

const member = (over: Partial<Member>): Member => ({
  id: 'm1', name: 'Test', email: 't@example.com', role: 'member', member_type: 'brother', pledge_class: null,
  status: 'approved', active: true, approved_at: null, approved_by: null, created_at: '', updated_at: '', ...over,
})

describe('permissions', () => {
  it('pending, rejected and inactive members get nothing', () => {
    for (const m of [member({ status: 'pending' }), member({ status: 'rejected' }), member({ active: false, role: 'admin' })]) {
      expect(isAdmin(m)).toBe(false)
      expect(isBrother(m)).toBe(false)
      expect(canManageEvents(m)).toBe(false)
    }
  })

  it('maps the three views to role and member type', () => {
    for (const access of ['admin', 'brother', 'pledge'] as const) {
      expect(accessOf(accessFields(access))).toBe(access)
    }
    expect(isPledge(member({ member_type: 'associate' }))).toBe(true)
    expect(canManageEvents(member({ role: 'admin' }))).toBe(true)
    expect(canManageEvents(member({}))).toBe(false)
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
