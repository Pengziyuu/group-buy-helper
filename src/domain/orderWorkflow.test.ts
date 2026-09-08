import { describe, expect, it } from 'vitest'
import {
  campaignStatusAction,
  campaignStatusLabel,
  summarizePayment,
  type OrderPayment,
} from './orderWorkflow'

describe('campaign workflow', () => {
  it('provides the organizer action for each campaign state', () => {
    expect(campaignStatusAction('open')).toEqual({ next: 'closed', label: '結單' })
    expect(campaignStatusAction('closed')).toEqual({ next: 'open', label: '重新開放' })
    expect(campaignStatusAction('arrived')).toEqual({ next: 'closed', label: '取消到貨' })
    expect(campaignStatusLabel('arrived')).toBe('已到貨')
  })
})

describe('order payment summary', () => {
  it('counts paid and unpaid orders', () => {
    const orders: OrderPayment[] = [
      { paid: true },
      { paid: true },
      { paid: false },
    ]

    expect(summarizePayment(orders)).toEqual({
      total: 3,
      paid: 2,
      unpaid: 1,
    })
  })
})
