import { describe, expect, it } from 'vitest'
import { validatePassword } from './password'
import { isIos } from './platform'

describe('validatePassword', () => {
  it('matches the Supabase password policy', () => {
    expect(validatePassword('short1')).toMatch(/8 characters/)
    expect(validatePassword('allletters')).toMatch(/letter and one number/)
    expect(validatePassword('12345678')).toMatch(/letter and one number/)
    expect(validatePassword('gators2027')).toBeNull()
  })
})

describe('isIos', () => {
  it('detects iPhone, iPad and iPadOS desktop mode', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0)).toBe(false)
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile', 5)).toBe(false)
  })
})
