export const SUPABASE_AUTH_STORAGE_KEY = 'group-buy-helper.auth.session'
export const SUPABASE_AUTH_CODE_VERIFIER_KEY = `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`
export const SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY = `${SUPABASE_AUTH_STORAGE_KEY}-flows-code-verifier`
export const LOGOUT_TOMBSTONE_KEY = 'group-buy-helper.auth.logout-pending'

export type AuthSessionStorage = {
  readonly length?: number
  getItem(key: string): string | null
  key?(index: number): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function getBrowserAuthStorage(): AuthSessionStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getBrowserSessionStorage(): AuthSessionStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
