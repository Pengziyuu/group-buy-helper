// The resident list and my orders open with what this resident saw last time, then refresh in the
// background. The copy lives in this browser only (LINE's in-app browser on the resident's phone),
// is tied to the signed-in LINE account, expires after a day and is removed on logout.
import { SUPABASE_AUTH_STORAGE_KEY, getBrowserAuthStorage, type AuthSessionStorage } from './authStorage'

export type ResidentCachedPage = 'campaigns' | 'orders'
type CachedIdentity = { displayName: string; pictureUrl: string | null }
type Entry = { userId: string; savedAt: number; identity: CachedIdentity; data: unknown }

const PAGES: ResidentCachedPage[] = ['campaigns', 'orders']
const MAX_AGE = 24 * 60 * 60 * 1000
const keyFor = (page: ResidentCachedPage) => `group-buy-helper.resident-page.v1.${page}`

// The account the stored Supabase session belongs to; a copy saved for anyone else is never shown.
function signedInUserId(storage: AuthSessionStorage): string | null {
  const session = JSON.parse(storage.getItem(SUPABASE_AUTH_STORAGE_KEY) ?? 'null') as { user?: { id?: unknown } } | null
  return typeof session?.user?.id === 'string' ? session.user.id : null
}

export function readResidentPageCache<T>(
  page: ResidentCachedPage,
  storage: AuthSessionStorage | null = getBrowserAuthStorage(),
  now: Date = new Date(),
): { identity: CachedIdentity; data: T } | null {
  if (!storage) return null
  try {
    const entry = JSON.parse(storage.getItem(keyFor(page)) ?? 'null') as Entry | null
    if (!entry || typeof entry.savedAt !== 'number' || typeof entry.identity?.displayName !== 'string') return null
    if (now.getTime() - entry.savedAt > MAX_AGE || entry.userId !== signedInUserId(storage)) return null
    return { identity: entry.identity, data: entry.data as T }
  } catch {
    return null
  }
}

export function writeResidentPageCache(
  page: ResidentCachedPage,
  identity: CachedIdentity,
  data: unknown,
  storage: AuthSessionStorage | null = getBrowserAuthStorage(),
  now: Date = new Date(),
): void {
  if (!storage) return
  try {
    const userId = signedInUserId(storage)
    if (!userId) return
    const entry: Entry = { userId, savedAt: now.getTime(), identity, data }
    storage.setItem(keyFor(page), JSON.stringify(entry))
  } catch {
    // A full or blocked storage only costs the instant first paint next time.
  }
}

export function clearResidentPageCache(storage: AuthSessionStorage | null = getBrowserAuthStorage()): void {
  if (!storage) return
  for (const page of PAGES) {
    try {
      storage.removeItem(keyFor(page))
    } catch {
      // Nothing more to do; an unreadable copy is ignored anyway.
    }
  }
}
