import { describe, expect, it } from 'vitest'
import {
  describeAutoClose,
  formatArrivalLabel,
  formatAutoCloseReminder,
  taipeiDateInputFromIso,
  taipeiNoonIso,
  validArrivalLabel,
} from './campaignSchedule'

describe('campaign schedule', () => {
  it('accepts and formats supported arrival labels', () => {
    expect(validArrivalLabel('貨到通知')).toBe(true)
    expect(validArrivalLabel('03/08')).toBe(true)
    expect(validArrivalLabel('3月初')).toBe(true)
    expect(validArrivalLabel('10月中')).toBe(true)
    expect(validArrivalLabel('12月底')).toBe(true)
    expect(validArrivalLabel('02/30')).toBe(false)
    expect(validArrivalLabel('3月上旬')).toBe(false)
    expect(formatArrivalLabel('03/08')).toBe('預計到貨：03/08')
    expect(formatArrivalLabel('3月初')).toBe('預計到貨：3月初')
  })

  it('stores a selected closing date as noon in Taiwan', () => {
    expect(taipeiNoonIso('2027-10-15')).toBe('2027-10-15T04:00:00.000Z')
    expect(taipeiDateInputFromIso('2027-10-15T04:00:00.000Z')).toBe('2027-10-15')
    expect(formatAutoCloseReminder('2027-10-15T04:00:00.000Z')).toBe('10/15 12:00 自動結單')
  })

  it('describes the automatic closing time relative to today in Taipei', () => {
    const now = new Date('2026-09-25T01:00:00.000Z')

    expect(describeAutoClose('2026-09-25T04:00:00.000Z', now)).toEqual({ when: '今天 12:00', soon: true })
    expect(describeAutoClose('2026-09-26T04:00:00.000Z', now)).toEqual({ when: '明天 12:00', soon: true })
    expect(describeAutoClose('2027-10-15T04:00:00.000Z', now)).toEqual({ when: '10/15（五）12:00', soon: false })
    expect(describeAutoClose(null, now)).toBeNull()
    expect(describeAutoClose('not-a-date', now)).toBeNull()
  })

  it('uses the Taipei date when UTC is still on the previous day', () => {
    const now = new Date('2026-09-24T17:00:00.000Z')

    expect(describeAutoClose('2026-09-25T04:00:00.000Z', now)).toEqual({ when: '今天 12:00', soon: true })
  })
})
