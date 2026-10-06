import { useState } from 'react'
import AdminApp from './AdminApp'
import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
import { OrdersSection } from './components/organizer/OrdersSection'
import { PickupSection } from './components/organizer/PickupSection'
import type { SaveTemplateActions } from './components/organizer/SaveTemplateDialog'
import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
import { demoScenarioOrganizerId, demoScenarioOrganizerOrders } from './data/demoOrganizerScenarios'
import type { DemoResidentScenario } from './data/demoResidentScenarios'
import { buildOrganizerOrderSummary, type OrganizerVisibleOrder } from './domain/adminOrders'
import type { CampaignStatus } from './domain/orderWorkflow'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { CampaignContent } from './services/demoCampaignStore'
import { residentCampaignPath, type WorkspaceSection } from './routing'

/** Saves the given content as a template, as the live workspace does for every campaign. */
export type DemoSaveTemplate = (content: CampaignContent) => SaveTemplateActions

/** The unpublished demo draft: only its content settings are available, as for a real draft. */
export function DemoOrganizerDraftWorkspace({ draft, saveTemplate }: { draft: CampaignListItem; saveTemplate?: DemoSaveTemplate }) {
  const content: CampaignContent = {
    title: draft.title, unitPrice: 0, threshold: draft.threshold, thresholdConfigured: false,
    itemNameConfigured: false, itemPriceConfigured: false, quantityUnit: draft.quantityUnit,
    announcement: '', images: [], items: [], openedAt: null,
  }
  return (
    <CampaignWorkspace
      campaign={{ id: draft.id, title: draft.title, status: draft.status, published: false, coverImage: null, openedAt: null, orderCount: null, residentHref: null }}
      requestedSection="content"
      section="content"
      saveTemplate={saveTemplate?.(content)}
    >
      <AdminApp
        key={draft.id}
        initialPublicationState="draft"
        initialContent={content}
        section="content"
      />
    </CampaignWorkspace>
  )
}

/** One made-up campaign in the organizer workspace; status, notes and cancellations live in memory. */
export function DemoOrganizerScenarioWorkspace({ scenario, requestedSection, saveTemplate }: { scenario: DemoResidentScenario; requestedSection: WorkspaceSection | null; saveTemplate?: DemoSaveTemplate }) {
  const { content } = scenario
  const id = demoScenarioOrganizerId(scenario.slug)
  const residentHref = residentCampaignPath(scenario.slug)
  const [status, setStatus] = useState<CampaignStatus>(scenario.status)
  const [closedAt, setClosedAt] = useState<string | null>(scenario.closedAt ?? null)
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
        closedAt,
        arrivalLabel: content.arrivalLabel,
        thresholdKind: content.thresholdKind ?? 'quantity',
        orderCount: orders.length,
        residentHref,
      }}
      requestedSection={requestedSection}
      section={section}
      onSetCampaignStatus={async (next) => {
        // As the database records it: stamped when it closes, cleared when it reopens.
        setClosedAt(next === 'open' ? null : new Date().toISOString())
        setStatus(next)
      }}
      saveTemplate={saveTemplate?.(content)}
    >
      <AdminApp key={id} initialContent={content} campaignStatus={status} section={section === 'content' ? 'content' : null} />
      {section === 'orders' && (
        <OrdersSection
          campaignId={id}
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
