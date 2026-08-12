import { describe, expect, it } from 'vitest'
import { itemLabel, MAX_ITEM_LETTERS } from './itemLabel'

describe('itemLabel', () => {
  it('labels item positions with uppercase letters from A through Z', () => {
    expect(itemLabel(0)).toBe('A號')
    expect(itemLabel(1)).toBe('B號')
    expect(itemLabel(25)).toBe('Z號')
    expect(MAX_ITEM_LETTERS).toBe(26)
  })

  it('rejects positions outside the uppercase alphabet', () => {
    expect(() => itemLabel(-1)).toThrow()
    expect(() => itemLabel(26)).toThrow()
  })
})
