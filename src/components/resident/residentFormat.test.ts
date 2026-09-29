import { describe, expect, it } from 'vitest'
import { formatMoney } from './residentFormat'

describe('resident money format', () => {
  it('uses a bare dollar sign with thousands separators', () => {
    expect(formatMoney(70)).toBe('$70')
    expect(formatMoney(3000)).toBe('$3,000')
    expect(formatMoney(32310)).toBe('$32,310')
  })
})
