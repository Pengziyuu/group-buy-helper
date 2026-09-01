import { describe, expect, it } from 'vitest'
import { itemLabel, MAX_CAMPAIGN_ITEMS } from './itemLabel'

describe('itemLabel', () => {
  it('labels item positions with spreadsheet-style uppercase letters without a suffix', () => {
    expect(itemLabel(0)).toBe('A')
    expect(itemLabel(1)).toBe('B')
    expect(itemLabel(25)).toBe('Z')
    expect(itemLabel(26)).toBe('AA')
    expect(itemLabel(27)).toBe('AB')
    expect(itemLabel(51)).toBe('AZ')
    expect(itemLabel(52)).toBe('BA')
    expect(itemLabel(99)).toBe('CV')
    expect(MAX_CAMPAIGN_ITEMS).toBe(100)
  })

  it('rejects negative and non-integer positions', () => {
    expect(() => itemLabel(-1)).toThrow()
    expect(() => itemLabel(1.5)).toThrow()
  })
})
