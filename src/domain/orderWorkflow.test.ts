import { describe, expect, it } from 'vitest'
import {
  campaignStatusAction,
  campaignStatusLabel,
  summarizeFulfillment,
  type OrderFulfillment,
} from './orderWorkflow'

describe('campaign workflow', () => {
  it('provides the organizer action for each campaign state', () => {
    expect(campaignStatusAction('open')).toEqual({ next: 'closed', label: '結單' })
    expect(campaignStatusAction('closed')).toEqual({ next: 'open', label: '重新開放' })
    expect(campaignStatusAction('arrived')).toEqual({ next: 'closed', label: '取消到貨' })
    expect(campaignStatusLabel('arrived')).toBe('已到貨')
  })
})

describe('order fulfillment summary', () => {
  it('counts payment and pickup states without treating ready orders as picked up', () => {
    const orders: OrderFulfillment[] = [
      { paid: true, pickupStatus: 'picked_up' },
      { paid: true, pickupStatus: 'ready' },
      { paid: false, pickupStatus: 'pending' },
    ]

    expect(summarizeFulfillment(orders)).toEqual({
      total: 3,
      paid: 2,
      unpaid: 1,
      ready: 1,
      pickedUp: 1,
      pendingPickup: 1,
    })
  })
})
