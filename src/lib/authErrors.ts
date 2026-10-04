import type { AuthError } from '@supabase/supabase-js'

export function friendlyAuthError(error: AuthError | Error | null | undefined): string {
  if (!error) return ''
  const code = 'code' in error ? (error.code as string | undefined) : undefined
  switch (code) {
    case 'invalid_credentials':
      return 'Wrong email or password.'
    case 'email_not_confirmed':
      return 'Confirm your email first. Check your inbox (and spam) for the link.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.'
    case 'weak_password':
      return 'That password is too weak. Use at least 8 characters with a letter and a number.'
    case 'same_password':
      return 'Choose a password you haven’t used here before.'
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'bad_code_verifier':
      return 'This link has expired or was already used. Request a new one.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in or reset your password.'
    case 'signup_disabled':
      return 'Sign-ups are closed right now.'
  }
  if (/fetch|network/i.test(error.message)) return 'Can’t reach the server. Check your connection and try again.'
  return error.message || 'Something went wrong. Try again.'
}
