import { describe, expect, it } from 'vitest'
import { formatClosing, formatMoney, formatResidentRelative, formatShortDate } from './residentFormat'

// 2026-09-29 20:00 in Taipei.
const now = new Date('2026-09-29T12:00:00Z')
const taipei = (local: string) => new Date(`${local}+08:00`).toISOString()

describe('resident money format', () => {
  it('uses a bare dollar sign with thousands separators', () => {
    expect(formatMoney(70)).toBe('$70')
    expect(formatMoney(3000)).toBe('$3,000')
    expect(formatMoney(32310)).toBe('$32,310')
  })
})

describe('resident date formats', () => {
  it('drops the year within the current year and never shows a weekday', () => {
    expect(formatShortDate(taipei('2026-10-04T22:25:00'), now)).toBe('10/4')
    expect(formatShortDate(taipei('2025-12-31T09:00:00'), now)).toBe('2025/12/31')
  })

  it('names today and tomorrow for closing times and keeps the hour, which decides whether you are in time', () => {
    expect(formatClosing(taipei('2026-09-29T23:00:00'), now)).toEqual({ when: '今天 23:00', soon: true })
    expect(formatClosing(taipei('2026-09-30T09:05:00'), now)).toEqual({ when: '明天 09:05', soon: true })
    expect(formatClosing(taipei('2026-10-04T22:25:00'), now)).toEqual({ when: '10/4 22:25', soon: false })
    expect(formatClosing(null, now)).toBeNull()
  })

  it('shows past times like a chat app: minutes, hours, yesterday, then a date', () => {
    expect(formatResidentRelative(taipei('2026-09-29T19:59:40'), now)).toBe('剛剛')
    expect(formatResidentRelative(taipei('2026-09-29T19:15:00'), now)).toBe('45 分鐘前')
    expect(formatResidentRelative(taipei('2026-09-29T08:00:00'), now)).toBe('12 小時前')
    expect(formatResidentRelative(taipei('2026-09-28T19:00:00'), now)).toBe('昨天')
    expect(formatResidentRelative(taipei('2026-09-27T22:59:00'), now)).toBe('9/27')
    expect(formatResidentRelative('not a date', now)).toBe('')
  })

  it('treats a device clock running slightly behind the server as just now', () => {
    expect(formatResidentRelative(taipei('2026-09-29T20:00:30'), now)).toBe('剛剛')
  })
})
