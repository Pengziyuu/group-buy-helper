import type { OrganizerItemRow, OrganizerOrderRow } from '../../domain/adminOrders'
import { taipeiDateInputFromIso } from '../../domain/campaignSchedule'
import { compareHousehold, formatHousehold } from '../../domain/household'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from '../../domain/timestamp'

export type OrderSort = 'household' | 'orderedAt'
export type OrderItemChip = { key: string; label: string; name: string; quantity: number; custom: boolean }

const timestamp = (value: string | null | undefined) => Date.parse(value ?? '') || 0
const lastActivity = (order: OrganizerOrderRow) => Math.max(timestamp(order.orderedAt), timestamp(order.updatedAt))

export function orderItemChips(order: OrganizerOrderRow, itemRows: OrganizerItemRow[]): OrderItemChip[] {
  const regular = itemRows
    .filter((item) => (order.items[item.code] ?? 0) > 0)
    .map((item) => ({ key: item.code, label: item.label, name: item.name, quantity: order.items[item.code], custom: false }))
  const custom = (order.customItems ?? [])
    .filter((item) => item.name.trim() && item.quantity > 0)
    .map((item) => ({ key: item.id, label: item.name.trim(), name: item.name.trim(), quantity: item.quantity, custom: true }))
  return [...regular, ...custom]
}

export function latestOrders(rows: OrganizerOrderRow[], limit = 10): OrganizerOrderRow[] {
  return [...rows].sort((left, right) => lastActivity(right) - lastActivity(left)).slice(0, limit)
}

export function sortOrders(rows: OrganizerOrderRow[], sort: OrderSort): OrganizerOrderRow[] {
  return sort === 'orderedAt'
    ? [...rows].sort((left, right) => timestamp(right.orderedAt) - timestamp(left.orderedAt))
    : [...rows].sort((left, right) => compareHousehold(left, right))
}

export function orderHouseholdLabel(order: OrganizerOrderRow): string {
  return formatHousehold(order.householdKind, order.period, order.unit)
}

export function orderControlLabel(order: OrganizerOrderRow): string {
  return order.householdKind === 'other' ? orderHouseholdLabel(order) : order.unit ?? orderHouseholdLabel(order)
}

export function matchesOrderSearch(order: OrganizerOrderRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [order.name, orderHouseholdLabel(order), order.unit ?? ''].some((value) => value.toLowerCase().includes(needle))
}

export function countOrdersOnTaipeiDay(rows: OrganizerOrderRow[], now: Date): number {
  const today = taipeiDateInputFromIso(now.toISOString())
  return rows.filter((order) => order.orderedAt && taipeiDateInputFromIso(order.orderedAt) === today).length
}

export function wasEdited(order: OrganizerOrderRow): boolean {
  return Boolean(order.orderedAt && order.updatedAt && wasMeaningfullyUpdated(order.orderedAt, order.updatedAt))
}

export function isNewSince(order: OrganizerOrderRow, lastSeen: string | null): boolean {
  const seen = timestamp(lastSeen)
  return seen > 0 && lastActivity(order) > seen
}

export function formatRelativeTime(value: string | undefined, now: Date): string {
  const time = timestamp(value)
  if (!time || !value) return ''
  const minutes = Math.floor((now.getTime() - time) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return formatZhTwTimestamp(value).slice(5)
}
