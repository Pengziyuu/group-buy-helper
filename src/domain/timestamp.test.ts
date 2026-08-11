import { describe, expect, it } from 'vitest'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from './timestamp'

describe('LINE notebook timestamps', () => {
  it('formats an instant deterministically in Asia/Taipei', () => {
    expect(formatZhTwTimestamp('2026-08-14T00:05:09.000Z')).toBe('2026/08/14 08:05')
  })

  it('shows every database-confirmed edit but not identical timestamps', () => {
    expect(wasMeaningfullyUpdated(
      '2026-08-14T00:05:09.000Z',
      '2026-08-14T00:05:09.000Z',
    )).toBe(false)
    expect(wasMeaningfullyUpdated(
      '2026-08-14T00:05:09.000Z',
      '2026-08-14T00:05:09.001Z',
    )).toBe(true)
  })
})
