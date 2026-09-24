import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLastSeen, writeLastSeen } from './lastSeenStore'

afterEach(() => { window.localStorage.clear() })

describe('last seen store', () => {
  it('remembers the last visit per campaign', () => {
    expect(readLastSeen('campaign-1')).toBeNull()
    writeLastSeen('campaign-1', '2026-09-25T04:00:00.000Z')
    expect(readLastSeen('campaign-1')).toBe('2026-09-25T04:00:00.000Z')
    expect(readLastSeen('campaign-2')).toBeNull()
  })

  it('ignores unreadable values and storage that throws', () => {
    window.localStorage.setItem('group-buy-helper:organizer-last-seen:campaign-1', 'garbage')
    expect(readLastSeen('campaign-1')).toBeNull()

    const broken = {
      getItem: vi.fn(() => { throw new Error('denied') }),
      setItem: vi.fn(() => { throw new Error('denied') }),
    }
    expect(readLastSeen('campaign-1', broken)).toBeNull()
    expect(() => writeLastSeen('campaign-1', '2026-09-25T04:00:00.000Z', broken)).not.toThrow()
  })
})
