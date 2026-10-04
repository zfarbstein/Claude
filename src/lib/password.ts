// Keep in sync with supabase/config.toml: minimum_password_length = 8, password_requirements = "letters_digits"
// (and the same settings in the production dashboard).
export const PASSWORD_HINT = 'At least 8 characters, with a letter and a number.'

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number.'
  if (password.length > 72) return 'Use 72 characters or fewer.'
  return null
}
