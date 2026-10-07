import { describe, expect, it } from 'vitest'
import { trimItemNames } from './itemName'

describe('trimItemNames', () => {
  it('drops spaces typed before or after a name, keeping everything else about the item', () => {
    expect(trimItemNames([
      { code: 'A', name: ' 黑糖迷你小饅頭', unitPrice: 95 },
      { code: 'B', name: '純橄欖油1L ', unitPrice: 220 },
      { code: 'C', name: '芋泥 包', unitPrice: 95 },
    ])).toEqual([
      { code: 'A', name: '黑糖迷你小饅頭', unitPrice: 95 },
      { code: 'B', name: '純橄欖油1L', unitPrice: 220 },
      { code: 'C', name: '芋泥 包', unitPrice: 95 },
    ])
  })
})
