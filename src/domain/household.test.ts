import { describe, expect, it } from 'vitest'
import {
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  RESIDENT_PERIODS,
  compareHousehold,
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
    expect(formatHouseholdUnit({ kind: 'resident', period: 1, prefix: null, letter: 'H', number: 11 })).toBe('H11')
    expect(formatHouseholdUnit({ kind: 'resident', period: 2, prefix: 2, letter: 'K', number: 13 })).toBe('2K13')
    expect(formatHouseholdUnit({ kind: 'resident', period: 3, prefix: 3, letter: 'Z', number: 15 })).toBe('3Z15')
  })

  it('parses valid stored units and rejects combinations outside the plan', () => {
    expect(parseHouseholdUnit(1, 'A1')).toEqual({ kind: 'resident', period: 1, prefix: null, letter: 'A', number: 1 })
    expect(parseHouseholdUnit(3, '1Z15')).toEqual({ kind: 'resident', period: 3, prefix: 1, letter: 'Z', number: 15 })
    expect(() => parseHouseholdUnit(1, '1A1')).toThrow('一期戶號格式錯誤')
    expect(() => parseHouseholdUnit(2, 'A1')).toThrow('二、三期戶號格式錯誤')
    expect(() => formatHouseholdUnit({ kind: 'resident', period: 2, prefix: 4, letter: 'A', number: 1 })).toThrow('前段只能選擇1至3')
  })
})

import { formatHousehold } from './household'

describe('household kind formatting', () => {
  it('labels a resident with period and unit', () => {
    expect(formatHousehold('resident', 2, '2K13')).toBe('二期 2K13')
  })

  it('labels someone outside the community without inventing a period', () => {
    expect(formatHousehold('other', null, null)).toBe('其他')
  })

  it('refuses a resident with no household rather than rendering NaN', () => {
    expect(() => formatHousehold('resident', null, null)).toThrow('住戶必須有期別與戶號')
  })

  it('produces no unit string for someone outside the community', () => {
    expect(formatHouseholdUnit({ kind: 'other', period: 1, prefix: null, letter: 'A', number: 1 })).toBeNull()
  })
})

describe('compareHousehold', () => {
  it('sorts residents before people outside the community regardless of period or unit', () => {
    const other = { householdKind: 'other' as const, period: null, unit: null }
    const resident = { householdKind: 'resident' as const, period: 1, unit: 'A1' }

    expect(compareHousehold(resident, other)).toBeLessThan(0)
    expect(compareHousehold(other, resident)).toBeGreaterThan(0)
    expect(compareHousehold(other, { ...other })).toBe(0)
  })

  it('breaks a tie by period, then by unit numerically so 2A9 sorts before 2A10', () => {
    const period1 = { householdKind: 'resident' as const, period: 1, unit: 'A1' }
    const period2 = { householdKind: 'resident' as const, period: 2, unit: 'A1' }
    expect(compareHousehold(period1, period2)).toBeLessThan(0)

    const unitA9 = { householdKind: 'resident' as const, period: 2, unit: '2A9' }
    const unitA10 = { householdKind: 'resident' as const, period: 2, unit: '2A10' }
    expect(compareHousehold(unitA9, unitA10)).toBeLessThan(0)
    // A plain localeCompare would order these the other way ('2A10' < '2A9'
    // lexicographically), which is exactly the discrepancy the two
    // duplicated comparators had before they were unified on this one.
    expect('2A10'.localeCompare('2A9')).toBeLessThan(0)
  })
})
