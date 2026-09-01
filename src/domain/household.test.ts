import { describe, expect, it } from 'vitest'
import {
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  RESIDENT_PERIODS,
  formatHouseholdUnit,
  parseHouseholdLabel,
  parseHouseholdUnit,
} from './household'

describe('parseHouseholdLabel', () => {
  it('treats the entire alphanumeric run as the unit and defaults to period two', () => {
    expect(parseHouseholdLabel('斯祈2K13')).toEqual({
      name: '斯祈',
      period: 2,
      unit: '2K13',
      key: '2:2K13',
    })
  })

  it('uses an explicitly written Chinese period without consuming the unit prefix', () => {
    expect(parseHouseholdLabel('佩怡一期H11')).toEqual({
      name: '佩怡',
      period: 1,
      unit: 'H11',
      key: '1:H11',
    })
  })

  it('normalizes lower-case unit letters', () => {
    expect(parseHouseholdLabel('Sophie 2i7')).toEqual({
      name: 'Sophie',
      period: 2,
      unit: '2I7',
      key: '2:2I7',
    })
  })
})

describe('resident household options', () => {
  it('covers all periods, prefixes, letters and numbers from the community plan', () => {
    expect(RESIDENT_PERIODS).toEqual([1, 2, 3])
    expect(HOUSEHOLD_PREFIXES).toEqual([1, 2, 3])
    expect(HOUSEHOLD_LETTERS).toHaveLength(26)
    expect(HOUSEHOLD_LETTERS[0]).toBe('A')
    expect(HOUSEHOLD_LETTERS[25]).toBe('Z')
    expect(HOUSEHOLD_NUMBERS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  it('formats phase one without a prefix and phases two and three with one', () => {
    expect(formatHouseholdUnit({ period: 1, prefix: null, letter: 'H', number: 11 })).toBe('H11')
    expect(formatHouseholdUnit({ period: 2, prefix: 2, letter: 'K', number: 13 })).toBe('2K13')
    expect(formatHouseholdUnit({ period: 3, prefix: 3, letter: 'Z', number: 15 })).toBe('3Z15')
  })

  it('parses valid stored units and rejects combinations outside the plan', () => {
    expect(parseHouseholdUnit(1, 'A1')).toEqual({ period: 1, prefix: null, letter: 'A', number: 1 })
    expect(parseHouseholdUnit(3, '1Z15')).toEqual({ period: 3, prefix: 1, letter: 'Z', number: 15 })
    expect(() => parseHouseholdUnit(1, '1A1')).toThrow('一期戶號格式錯誤')
    expect(() => parseHouseholdUnit(2, 'A1')).toThrow('二、三期戶號格式錯誤')
    expect(() => formatHouseholdUnit({ period: 2, prefix: 4, letter: 'A', number: 1 })).toThrow('前段只能選擇1至3')
  })
})
