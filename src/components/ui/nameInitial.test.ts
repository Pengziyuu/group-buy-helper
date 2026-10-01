import { describe, expect, it } from 'vitest'
import { nameInitial } from './nameInitial'

describe('nameInitial', () => {
  it('keeps an emoji whole instead of cutting it in half', () => {
    expect(nameInitial('🌸花花')).toBe('🌸')
    expect(nameInitial('👨‍👩‍👧小家庭')).toBe('👨‍👩‍👧')
  })

  it('takes the first character of ordinary names, upper-casing Latin letters', () => {
    expect(nameInitial('王小明')).toBe('王')
    expect(nameInitial('amy')).toBe('A')
    expect(nameInitial('  Lena')).toBe('L')
    expect(nameInitial('')).toBe('')
  })
})
