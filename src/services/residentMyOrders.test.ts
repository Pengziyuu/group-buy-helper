import { describe, expect, it } from 'vitest'
import { residentMyOrderFromRow } from './residentMyOrders'

const row = {
  campaign_slug: 'abcd1234',
  title: '手工蛋捲禮盒',
  status: 'closed',
  opened_at: '2026-10-03T00:00:00.000Z',
  images: [{ src: '/roll.png', alt: '蛋捲' }, { src: 42 }],
  quantity_unit: '盒',
  arrival_label: '10/07',
  auto_close_at: null,
  threshold_kind: 'amount',
  threshold_auto_close: false,
  closed_at: '2026-10-04T04:00:00.000Z',
  ordered_at: '2026-10-03T02:00:00.000Z',
  items: [{ name: '原味', quantity: 1, unitPrice: 280 }, { name: '壞資料', quantity: 'x', unitPrice: 1 }],
  custom_items: [{ id: 'a', name: '海苔肉鬆', quantity: 1 }],
}

describe('residentMyOrderFromRow', () => {
  it('maps a list_my_orders row, dropping malformed images and items', () => {
    expect(residentMyOrderFromRow(row)).toEqual({
      slug: 'abcd1234',
      title: '手工蛋捲禮盒',
      status: 'closed',
      openedAt: '2026-10-03T00:00:00.000Z',
      images: [{ src: '/roll.png', alt: '蛋捲' }],
      quantityUnit: '盒',
      arrivalLabel: '10/07',
      autoCloseAt: null,
      thresholdKind: 'amount',
      thresholdAutoClose: false,
      closedAt: '2026-10-04T04:00:00.000Z',
      orderedAt: '2026-10-03T02:00:00.000Z',
      items: [{ name: '原味', quantity: 1, unitPrice: 280 }],
      customItems: [{ name: '海苔肉鬆', quantity: 1 }],
    })
  })

  it('skips a row without the fields the page needs', () => {
    expect(residentMyOrderFromRow({ ...row, campaign_slug: null })).toBeNull()
    expect(residentMyOrderFromRow({ ...row, status: 'draft' })).toBeNull()
    expect(residentMyOrderFromRow({ ...row, ordered_at: null })).toBeNull()
  })
})
