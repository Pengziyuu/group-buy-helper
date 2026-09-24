import { describe, expect, it } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderRow } from '../../domain/adminOrders'
import {
  countOrdersOnTaipeiDay, formatRelativeTime, isNewSince, latestOrders, matchesOrderSearch,
  orderControlLabel, orderHouseholdLabel, orderItemChips, sortOrders, wasEdited,
} from './orderView'

const summary = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })

function row(overrides: Partial<OrganizerOrderRow>): OrganizerOrderRow {
  return { ...summary.orderRows[0], ...overrides }
}

describe('order view helpers', () => {
  it('lists regular items in item order and extra items after them', () => {
    const order = row({
      items: { D: 2, B: 1 },
      customItems: [{ id: 'bag', name: ' 紙袋 ', quantity: 3 }, { id: 'blank', name: '  ', quantity: 1 }],
    })
    expect(orderItemChips(order, summary.itemRows)).toEqual([
      { key: 'B', label: 'B', name: '花生（招牌）', quantity: 1, custom: false },
      { key: 'D', label: 'D', name: '草莓', quantity: 2, custom: false },
      { key: 'bag', label: '紙袋', name: '紙袋', quantity: 3, custom: true },
    ])
  })

  it('orders the latest activity first and limits the list', () => {
    const rows = Array.from({ length: 12 }, (_, index) => row({
      orderId: `o${index}`,
      orderedAt: `2026-09-20T0${index % 10}:00:00.000Z`,
      updatedAt: index === 3 ? '2026-09-21T00:00:00.000Z' : `2026-09-20T0${index % 10}:00:00.000Z`,
    }))
    const latest = latestOrders(rows)
    expect(latest).toHaveLength(10)
    expect(latest[0].orderId).toBe('o3')
  })

  it('sorts by household or by the newest order time', () => {
    const rows = [
      row({ orderId: 'b', name: '乙', period: 2, unit: '2K13', householdKind: 'resident', orderedAt: '2026-09-20T01:00:00.000Z' }),
      row({ orderId: 'c', name: '丙', period: null, unit: null, householdKind: 'other', orderedAt: '2026-09-20T03:00:00.000Z' }),
      row({ orderId: 'a', name: '甲', period: 1, unit: 'H11', householdKind: 'resident', orderedAt: '2026-09-20T02:00:00.000Z' }),
    ]
    expect(sortOrders(rows, 'household').map((order) => order.orderId)).toEqual(['a', 'b', 'c'])
    expect(sortOrders(rows, 'orderedAt').map((order) => order.orderId)).toEqual(['c', 'a', 'b'])
  })

  it('searches by name or household and labels controls', () => {
    const resident = row({ name: '斯祈', period: 2, unit: '2K13', householdKind: 'resident' })
    const other = row({ name: '社區朋友', period: null, unit: null, householdKind: 'other' })
    expect(matchesOrderSearch(resident, '2k13')).toBe(true)
    expect(matchesOrderSearch(resident, '二期')).toBe(true)
    expect(matchesOrderSearch(resident, ' 斯 ')).toBe(true)
    expect(matchesOrderSearch(resident, '佩怡')).toBe(false)
    expect(matchesOrderSearch(resident, '  ')).toBe(true)
    expect(orderHouseholdLabel(resident)).toBe('二期 2K13')
    expect(orderControlLabel(resident)).toBe('2K13')
    expect(orderControlLabel(other)).toBe('其他')
  })

  it('counts orders placed on the Taipei calendar day', () => {
    const rows = [
      row({ orderedAt: '2026-09-24T16:30:00.000Z' }),
      row({ orderedAt: '2026-09-25T10:00:00.000Z' }),
      row({ orderedAt: '2026-09-24T15:59:00.000Z' }),
      row({ orderedAt: undefined }),
    ]
    expect(countOrdersOnTaipeiDay(rows, new Date('2026-09-25T04:00:00.000Z'))).toBe(2)
  })

  it('marks edited orders and orders changed since the last visit', () => {
    const edited = row({ orderedAt: '2026-09-20T01:00:00.000Z', updatedAt: '2026-09-20T02:00:00.000Z' })
    const untouched = row({ orderedAt: '2026-09-20T01:00:00.000Z', updatedAt: '2026-09-20T01:00:00.000Z' })
    expect(wasEdited(edited)).toBe(true)
    expect(wasEdited(untouched)).toBe(false)
    expect(isNewSince(edited, '2026-09-20T01:30:00.000Z')).toBe(true)
    expect(isNewSince(untouched, '2026-09-20T01:30:00.000Z')).toBe(false)
    expect(isNewSince(edited, null)).toBe(false)
    expect(isNewSince(edited, 'not-a-date')).toBe(false)
  })

  it('describes how long ago something happened', () => {
    const now = new Date('2026-09-25T04:00:00.000Z')
    expect(formatRelativeTime('2026-09-25T03:59:40.000Z', now)).toBe('剛剛')
    expect(formatRelativeTime('2026-09-25T03:57:00.000Z', now)).toBe('3 分鐘前')
    expect(formatRelativeTime('2026-09-25T01:00:00.000Z', now)).toBe('3 小時前')
    expect(formatRelativeTime('2026-09-23T01:05:00.000Z', now)).toBe('09/23 09:05')
    expect(formatRelativeTime(undefined, now)).toBe('')
  })
})
