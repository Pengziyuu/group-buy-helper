import { useState } from 'react'
import AdminApp from './AdminApp'
import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
import { OrdersSection } from './components/organizer/OrdersSection'
import { OverviewSection } from './components/organizer/OverviewSection'
import { PickupSection } from './components/organizer/PickupSection'
import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
import { demoScenarioOrganizerId, demoScenarioOrganizerOrders } from './data/demoOrganizerScenarios'
import type { DemoResidentScenario } from './data/demoResidentScenarios'
import { buildOrganizerOrderSummary, type OrganizerVisibleOrder } from './domain/adminOrders'
import type { CampaignStatus } from './domain/orderWorkflow'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { WorkspaceSection } from './routing'

/** The unpublished demo draft: only its content settings are available, as for a real draft. */
export function DemoOrganizerDraftWorkspace({ draft }: { draft: CampaignListItem }) {
  return (
    <CampaignWorkspace
      campaign={{ id: draft.id, title: draft.title, status: draft.status, published: false, coverImage: null, openedAt: null, orderCount: null, residentHref: null }}
      requestedSection="content"
      section="content"
    >
      <AdminApp
        key={draft.id}
        initialPublicationState="draft"
        initialContent={{
          title: draft.title, unitPrice: 0, threshold: draft.threshold, thresholdConfigured: false,
          itemNameConfigured: false, itemPriceConfigured: false, quantityUnit: draft.quantityUnit,
          announcement: '', images: [], items: [], openedAt: null,
        }}
        section="content"
      />
    </CampaignWorkspace>
  )
}

/** One made-up campaign in the organizer workspace; status, notes and cancellations live in memory. */
export function DemoOrganizerScenarioWorkspace({ scenario, requestedSection }: { scenario: DemoResidentScenario; requestedSection: WorkspaceSection | null }) {
  const { content } = scenario
  const id = demoScenarioOrganizerId(scenario.slug)
  const residentHref = `/campaign/${scenario.slug}`
  const [status, setStatus] = useState<CampaignStatus>(scenario.status)
  const [orders, setOrders] = useState<OrganizerVisibleOrder[]>(() => demoScenarioOrganizerOrders(scenario))
  const summary = buildOrganizerOrderSummary({
    orders,
    items: content.items.map((item) => ({ ...item, unitPrice: item.unitPrice ?? content.unitPrice })),
    threshold: content.threshold,
    thresholdKind: content.thresholdKind ?? 'quantity',
    amountThreshold: content.amountThreshold ?? null,
    quantityUnit: content.quantityUnit,
  })
  const section = resolveWorkspaceSection(requestedSection, true, status)

  return (
    <CampaignWorkspace
      campaign={{
        id,
        title: content.title,
        status,
        published: true,
        coverImage: content.images[0] ?? null,
        openedAt: content.openedAt,
        autoCloseAt: content.autoCloseAt ?? null,
        arrivalLabel: content.arrivalLabel,
        thresholdKind: content.thresholdKind ?? 'quantity',
        orderCount: orders.length,
        residentHref,
      }}
      requestedSection={requestedSection}
      section={section}
      onSetCampaignStatus={async (next) => setStatus(next)}
    >
      <AdminApp key={id} initialContent={content} campaignStatus={status} residentHref={residentHref} section={section === 'content' ? 'content' : null} />
      {section === 'overview' && (
        <OverviewSection campaignId={id} campaignTitle={content.title} openedAt={content.openedAt} summary={summary} status={status} liveState="unavailable" />
      )}
      {section === 'orders' && (
        <OrdersSection
          campaignTitle={content.title}
          openedAt={content.openedAt}
          summary={summary}
          status={status}
          liveState="unavailable"
          onSetOrderOrganizerNote={async (orderId, organizerNote) => {
            setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, organizerNote } : order))
          }}
          onCancelOrder={async (orderId) => {
            setOrders((current) => current.filter((order) => order.orderId !== orderId))
          }}
        />
      )}
      {section === 'pickup' && (
        <PickupSection campaignId={id} campaignTitle={content.title} campaignStatus={status} published excludedOtherCount={0} />
      )}
    </CampaignWorkspace>
  )
}
