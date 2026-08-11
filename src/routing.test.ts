import { describe, expect, it } from 'vitest'
import { selectAppMode } from './routing'

describe('app routing', () => {
  it('opens organizer mode only on the admin path', () => {
    expect(selectAppMode('/admin')).toBe('admin')
    expect(selectAppMode('/admin/')).toBe('admin')
    expect(selectAppMode('/')).toBe('resident')
    expect(selectAppMode('/campaign/demo')).toBe('resident')
  })
})
