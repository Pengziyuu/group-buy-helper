import { describe, expect, it } from 'vitest'
import { parseHouseholdLabel } from './household'

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
