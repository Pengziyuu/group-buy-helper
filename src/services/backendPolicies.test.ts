import { describe, expect, it } from 'vitest'
import { assertBindingAllowed, normalizeOrderItems } from '../../supabase/functions/_shared/policies'

describe('assertBindingAllowed', () => {
  it('allows an unbound whitelist customer to bind', () => {
    expect(() => assertBindingAllowed(null, null, 'U123', 'auth-1')).not.toThrow()
  })

  it('allows the same LINE and auth identities to resume', () => {
    expect(() => assertBindingAllowed('U123', 'auth-1', 'U123', 'auth-1')).not.toThrow()
  })

  it('rejects attempts to take over an already-bound unit', () => {
    expect(() => assertBindingAllowed('U123', 'auth-1', 'U999', 'auth-2'))
      .toThrow('戶號已綁定')
  })
})

describe('normalizeOrderItems', () => {
  it('keeps positive integer quantities and drops zeros', () => {
    expect(normalizeOrderItems({ a: 2, B: 0, c: 1 }, ['A', 'B', 'C']))
      .toEqual({ A: 2, C: 1 })
  })

  it('rejects unknown product codes', () => {
    expect(() => normalizeOrderItems({ Z: 1 }, ['A', 'B']))
      .toThrow('不存在的品項')
  })

  it.each([-1, 1.5, 21])('rejects invalid quantity %s', (quantity) => {
    expect(() => normalizeOrderItems({ A: quantity }, ['A']))
      .toThrow('0 到 20 的整數')
  })
})
