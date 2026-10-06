import { describe, expect, it } from 'vitest'
import { describeResidentSchedule } from './residentSchedule'

// 2026-09-25 09:00 in Taipei.
const now = new Date('2026-09-25T01:00:00.000Z')
const base = { status: 'open' as const, autoCloseAt: null, thresholdKind: 'quantity' as const, arrivalLabel: '貨到通知' }

describe('describeResidentSchedule', () => {
  it('uses the closing time whenever one is set, noting that a quantity threshold can close it early', () => {
    const quantity = describeResidentSchedule({ ...base, autoCloseAt: '2026-09-26T08:00:00.000Z', arrivalLabel: '10月中' }, now)
    expect(quantity.closing).toEqual({ value: '明天 16:00', line: '明天 16:00 結單', soon: true, note: '額滿會提早結單' })
    expect(quantity.arrival).toEqual({ value: '10月中', line: '10月中到貨' })

    const amount = describeResidentSchedule({ ...base, thresholdKind: 'amount', autoCloseAt: '2026-10-04T15:36:00.000Z' }, now)
    expect(amount.closing).toEqual({ value: '10/4 23:36', line: '10/4 23:36 結單', soon: false })
  })

  it('says a quantity campaign without a time closes when full', () => {
    expect(describeResidentSchedule(base, now).closing).toEqual({ value: '額滿自動結單', line: '額滿結單', soon: false })
  })

  it('says an amount campaign without a time is closed by hand, announced in the group first', () => {
    expect(describeResidentSchedule({ ...base, thresholdKind: 'amount' }, now).closing)
      .toEqual({ value: '手動決定結單', line: '手動決定結單', soon: false, note: '結單前群組通知' })
  })

  it('describes the selected threshold auto-close setting regardless of threshold kind', () => {
    expect(describeResidentSchedule({ ...base, thresholdAutoClose: false }, now).closing?.value).toBe('手動決定結單')
    expect(describeResidentSchedule({ ...base, thresholdKind: 'amount', thresholdAutoClose: true }, now).closing?.value).toBe('達標自動結單')
    expect(describeResidentSchedule({ ...base, thresholdKind: 'amount', thresholdAutoClose: true, autoCloseAt: '2026-10-04T15:36:00.000Z' }, now).closing?.note).toBe('金額達標會提早結單')
  })

  it('always describes arrival, shortening dates', () => {
    expect(describeResidentSchedule(base, now).arrival).toEqual({ value: '貨到通知', line: '貨到通知' })
    expect(describeResidentSchedule({ ...base, arrivalLabel: '10/07' }, now).arrival).toEqual({ value: '10/7', line: '10/7 到貨' })
  })

  it('gives a closed campaign the date it actually closed, without a time', () => {
    for (const status of ['closed', 'arrived'] as const) {
      const schedule = describeResidentSchedule({ ...base, status, closedAt: '2026-09-20T16:30:00.000Z', arrivalLabel: '10/07' }, now)
      expect(schedule.closing).toEqual({ value: '9/21', line: '9/21 結單', soon: false })
      expect(schedule.arrival).toEqual({ value: '10/7', line: '10/7 到貨' })
    }
  })

  it('drops the closing schedule of a closed campaign whose closing time is unknown, keeping only arrival', () => {
    for (const status of ['closed', 'arrived'] as const) {
      const schedule = describeResidentSchedule({ ...base, status, autoCloseAt: '2026-09-20T04:00:00.000Z', arrivalLabel: '10/07' }, now)
      expect(schedule.closing).toBeNull()
      expect(schedule.arrival).toEqual({ value: '10/7', line: '10/7 到貨' })
    }
  })
})
