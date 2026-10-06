import { beforeEach, describe, expect, it } from 'vitest'
import { SUPABASE_AUTH_STORAGE_KEY, type AuthSessionStorage } from './authStorage'
import { clearResidentPageCache, readResidentPageCache, writeResidentPageCache } from './residentPageCache'

function memoryStorage(): AuthSessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

const identity = { displayName: '彭梓育', pictureUrl: null }
const now = new Date('2026-10-06T12:00:00.000Z')
const signedInAs = (storage: AuthSessionStorage, userId: string) =>
  storage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'token', user: { id: userId } }))

describe('residentPageCache', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => {
    storage = memoryStorage()
    signedInAs(storage, 'resident-a')
  })

  it('gives back what this resident last saw on the page', () => {
    writeResidentPageCache('campaigns', identity, [{ slug: 'a' }], storage, now)
    expect(readResidentPageCache('campaigns', storage, now)).toEqual({ identity, data: [{ slug: 'a' }] })
    // Each page keeps its own copy.
    expect(readResidentPageCache('orders', storage, now)).toBeNull()
  })

  it('ignores a copy older than a day, or one saved for another LINE account', () => {
    writeResidentPageCache('campaigns', identity, [], storage, now)
    expect(readResidentPageCache('campaigns', storage, new Date(now.getTime() + 25 * 60 * 60 * 1000))).toBeNull()

    signedInAs(storage, 'resident-b')
    expect(readResidentPageCache('campaigns', storage, now)).toBeNull()
  })

  it('keeps nothing without a signed-in resident, and forgets everything on logout', () => {
    writeResidentPageCache('campaigns', identity, [], storage, now)
    writeResidentPageCache('orders', identity, [], storage, now)
    clearResidentPageCache(storage)
    expect(readResidentPageCache('campaigns', storage, now)).toBeNull()
    expect(readResidentPageCache('orders', storage, now)).toBeNull()

    storage.removeItem(SUPABASE_AUTH_STORAGE_KEY)
    writeResidentPageCache('campaigns', identity, [], storage, now)
    expect([...storage.data.keys()]).toEqual([])
  })

  it('treats unreadable storage as having no copy', () => {
    storage.setItem('group-buy-helper.resident-page.v1.campaigns', '{not json')
    expect(readResidentPageCache('campaigns', storage, now)).toBeNull()
    const broken: AuthSessionStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => {} }
    expect(readResidentPageCache('campaigns', broken, now)).toBeNull()
    expect(() => writeResidentPageCache('campaigns', identity, [], broken, now)).not.toThrow()
  })
})
