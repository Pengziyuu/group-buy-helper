// The organizer's view of the made-up demo campaigns, so the organizer pages can be reviewed
// with the same variety residents see: several statuses, a draft, amount thresholds,
// mix-and-match pricing, custom items and a 50-order campaign. All data is fictional.
import type { OrganizerVisibleOrder } from '../domain/adminOrders'
import { normalizeQuantityUnit } from '../domain/quantityUnit'
import type { CampaignListItem } from '../services/campaignManagementGateway'
import type { ResidentMember } from '../services/residentMemberManagementGateway'
import { demoScenarioListItem, type DemoResidentScenario } from './demoResidentScenarios'

/** A UUID-shaped id built from the scenario slug, as organizer routes expect. */
export function demoScenarioOrganizerId(slug: string): string {
  return `${slug.slice(0, 8)}-${slug.slice(8, 12)}-${slug.slice(12, 16)}-${slug.slice(16, 20)}-${slug.slice(20, 32)}`
}

export function demoScenarioOrganizerOrders(scenario: DemoResidentScenario): OrganizerVisibleOrder[] {
  return scenario.orders.map((order, index) => ({
    ...order,
    orderId: `${scenario.slug.slice(0, 4)}-order-${index + 1}`,
    paid: false,
    // A few organizer notes, including a long one, to exercise the notes column.
    organizerNote: index === 1 ? '週六下午取貨' : index === 4 ? '請放管理室，住戶出差到下週三，回來後會自己去拿，不用另外通知' : '',
  }))
}

export function demoScenarioOrganizerListItem(scenario: DemoResidentScenario): CampaignListItem {
  const item = demoScenarioListItem(scenario)
  return {
    id: demoScenarioOrganizerId(scenario.slug),
    slug: scenario.slug,
    title: item.title,
    status: item.status,
    openedAt: item.openedAt,
    createdAt: item.openedAt,
    updatedAt: item.openedAt,
    images: item.images ?? [],
    quantityUnit: normalizeQuantityUnit(item.quantityUnit),
    orderCount: scenario.orders.length,
    totalQuantity: item.totalQuantity,
    totalAmount: item.totalAmount ?? 0,
    paidOrderCount: 0,
    thresholdKind: item.thresholdKind ?? 'quantity',
    threshold: item.threshold,
    amountThreshold: item.amountThreshold ?? null,
    arrivalLabel: item.arrivalLabel,
    autoCloseAt: item.autoCloseAt ?? null,
    closedAt: item.closedAt ?? null,
  }
}

/** A draft the organizer has started but not published. */
export function demoDraftCampaign(now = Date.now()): CampaignListItem {
  const edited = new Date(now - 3 * 60 * 60 * 1000).toISOString()
  return {
    id: '5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e',
    slug: '5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e',
    title: '中秋文旦柚（草稿，尚未發布）',
    status: 'open',
    openedAt: null,
    createdAt: edited,
    updatedAt: edited,
    images: [],
    quantityUnit: '箱',
    orderCount: 0,
    totalQuantity: 0,
    totalAmount: 0,
    paidOrderCount: 0,
    thresholdKind: 'quantity',
    threshold: 30,
    amountThreshold: null,
    autoCloseAt: null,
  }
}

/** Residents drawn from the scenario orders, with every household state the organizer filters by. */
export function demoOrganizerMembers(scenarios: DemoResidentScenario[]): ResidentMember[] {
  const seen = new Map<string, ResidentMember>()
  for (const order of scenarios.flatMap((scenario) => scenario.orders)) {
    if (seen.has(order.customerId)) continue
    const index = seen.size
    const unbound = index % 11 === 5
    const other = index % 13 === 7
    seen.set(order.customerId, {
      memberCode: `demo-member-${String(index + 1).padStart(3, '0')}`,
      displayName: order.name,
      pictureUrl: null,
      period: unbound || other ? null : order.period,
      unit: unbound || other ? null : order.unit,
      householdKind: other ? 'other' : 'resident',
      joinedAt: order.orderedAt,
      blocked: index % 17 === 9,
      blockedAt: index % 17 === 9 ? order.orderedAt : null,
    })
  }
  return [...seen.values()]
}
