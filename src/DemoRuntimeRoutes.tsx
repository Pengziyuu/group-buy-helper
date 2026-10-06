import { useState } from 'react'
import AdminApp from './AdminApp'
import App from './App'
import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
import { OrdersSection } from './components/organizer/OrdersSection'
import { OrganizerHome } from './components/organizer/OrganizerHome'
import { OrganizerSettings } from './components/organizer/OrganizerSettings'
import { OrganizerShell } from './components/organizer/OrganizerShell'
import { PickupSection } from './components/organizer/PickupSection'
import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'
import { parseAppRoute, parseResidentFilter, residentCampaignPath, type WorkspaceSection } from './routing'
import { EmptyState } from './components/ui/AsyncState'
import ResidentCampaignListApp from './ResidentCampaignListApp'
import ResidentMyOrdersApp from './ResidentMyOrdersApp'
import { DemoResidentScenarioApp } from './DemoResidentScenarioApp'
import { demoResidentScenarios, demoScenarioListItem, demoScenarioMyOrder } from './data/demoResidentScenarios'
import { demoDraftCampaign, demoOrganizerMembers, demoRefreshGroupStatuses, demoScenarioOrganizerId, demoScenarioOrganizerListItem } from './data/demoOrganizerScenarios'
import { DemoOrganizerDraftWorkspace, DemoOrganizerScenarioWorkspace } from './DemoOrganizerScenarioWorkspace'
import { campaign, initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary, type OrganizerVisibleOrder } from './domain/adminOrders'
import type { CampaignStatus } from './domain/orderWorkflow'
import { createDemoTemplateRepository } from './services/demoTemplateStore'
import { loadDraftCampaign, saveDraftCampaign, type CampaignContent } from './services/demoCampaignStore'

const DEMO_CAMPAIGN_SLUG = '0123456789abcdef0123456789abcdef0123'
const DEMO_CAMPAIGN_ID = '01234567-89ab-cdef-0123-456789abcdef'
const demoTotalQuantity = initialOrders.reduce((total, order) =>
  total + Object.values(order.items).reduce((sum, quantity) => sum + quantity, 0), 0)
const demoTotalAmount = initialOrders.reduce((total, order) => total + Object.entries(order.items)
  .reduce((sum, [code, quantity]) => sum + quantity * (items.find((item) => item.code === code)?.unitPrice ?? campaign.unitPrice), 0), 0)
const demoOrganizerCampaign = {
  id: DEMO_CAMPAIGN_ID,
  slug: DEMO_CAMPAIGN_SLUG,
  title: campaign.title,
  status: 'open' as const,
  openedAt: campaign.openedAt,
  createdAt: campaign.openedAt,
  updatedAt: campaign.openedAt,
  images: campaign.images,
  quantityUnit: '個' as const,
  orderCount: initialOrders.length,
  totalQuantity: demoTotalQuantity,
  totalAmount: demoTotalAmount,
  paidOrderCount: 0,
  thresholdKind: 'quantity' as const,
  threshold: campaign.threshold,
  amountThreshold: null,
}
const demoScenarios = demoResidentScenarios()
const demoDraft = demoDraftCampaign()
const demoOrganizerCampaigns = [...demoScenarios.map(demoScenarioOrganizerListItem), demoDraft]
const demoScenarioMembers = demoOrganizerMembers(demoScenarios)
const demoResidentMembers = [
  { memberCode: 'demo-member-a01', displayName: '測試住戶甲', pictureUrl: null, period: 2, unit: '1A1', joinedAt: campaign.openedAt, blocked: false, blockedAt: null },
  { memberCode: 'demo-member-b08', displayName: '測試住戶乙', pictureUrl: null, period: 1, unit: 'B8', joinedAt: campaign.openedAt, blocked: true, blockedAt: campaign.openedAt },
]

const initialDemoOrganizerOrders: OrganizerVisibleOrder[] = initialOrders.map((order, index) => ({
  ...order,
  items: { ...order.items },
  orderId: `demo-order-${index + 1}`,
  paid: false,
  organizerNote: '',
}))

const demoFallbackContent: CampaignContent = {
  title: campaign.title,
  unitPrice: campaign.unitPrice,
  threshold: campaign.threshold,
  announcement: campaign.announcement,
  images: campaign.images,
  items,
  openedAt: campaign.openedAt,
}
// The demo has one campaign, so creating from a template rewrites its draft.
const demoTemplates = createDemoTemplateRepository({
  createCampaign: async (content) => {
    saveDraftCampaign(content)
    return { id: DEMO_CAMPAIGN_ID }
  },
})
const demoSaveTemplate = (content: CampaignContent) => ({
  loadTemplates: () => demoTemplates.list(),
  saveNew: (name: string) => demoTemplates.create(name, content),
  replace: (templateId: string) => demoTemplates.replace(templateId, content),
})
const demoCreateFromTemplate = {
  list: () => demoTemplates.list(),
  create: (templateId: string, title: string) => demoTemplates.createCampaign(templateId, title),
}

function DemoOrganizerWorkspace({ requestedSection }: { requestedSection: WorkspaceSection | null }) {
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>('open')
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrganizerVisibleOrder[]>(initialDemoOrganizerOrders)
  const orderSummary = buildOrganizerOrderSummary({ orders, items, threshold: campaign.threshold })
  const section = resolveWorkspaceSection(requestedSection, true, campaignStatus)

  return (
    <CampaignWorkspace
      campaign={{
        id: DEMO_CAMPAIGN_ID,
        title: campaign.title,
        status: campaignStatus,
        published: true,
        coverImage: campaign.images[0] ?? null,
        openedAt: campaign.openedAt,
        closedAt,
        orderCount: orders.length,
        residentHref: residentCampaignPath(DEMO_CAMPAIGN_SLUG),
      }}
      requestedSection={requestedSection}
      section={section}
      onSetCampaignStatus={async (status) => {
        setClosedAt(status === 'open' ? null : new Date().toISOString())
        setCampaignStatus(status)
      }}
      saveTemplate={{
        loadTemplates: () => demoTemplates.list(),
        saveNew: (name) => demoTemplates.create(name, loadDraftCampaign(demoFallbackContent)),
        replace: (templateId) => demoTemplates.replace(templateId, loadDraftCampaign(demoFallbackContent)),
      }}
    >
      <AdminApp section={section === 'content' ? 'content' : null} campaignStatus={campaignStatus} />
      {section === 'orders' && (
        <OrdersSection
          campaignId={DEMO_CAMPAIGN_ID}
          campaignTitle={campaign.title}
          openedAt={campaign.openedAt}
          summary={orderSummary}
          status={campaignStatus}
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
        <PickupSection campaignId={DEMO_CAMPAIGN_ID} campaignTitle={campaign.title} campaignStatus={campaignStatus} published excludedOtherCount={0} />
      )}
    </CampaignWorkspace>
  )
}

export default function DemoRuntimeRoutes({ pathname, search }: { pathname: string; search: string }) {
  const appRoute = parseAppRoute(pathname)
  const createDemoCampaign = async () => ({ id: DEMO_CAMPAIGN_ID })
  if (appRoute.kind === 'admin-notification-lab') {
    return (
      <OrganizerShell current="settings" onCreate={createDemoCampaign} templates={demoCreateFromTemplate}>
        <main className="live-state-shell">
          <EmptyState
            title="通知測試中心僅提供 Live 模式使用"
            description="本機示範資料不會模擬 LINE 測試通知，請使用已連接 Supabase 的團主入口。"
            action={<a className="ui-button" data-variant="secondary" href="/admin">回到團主後台</a>}
            page
          />
        </main>
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-list') {
    return (
      <OrganizerShell current="campaigns" onCreate={createDemoCampaign} templates={demoCreateFromTemplate}>
        <OrganizerHome campaigns={[demoOrganizerCampaign, ...demoOrganizerCampaigns]} autoCloseNotificationState="current_user" unboundResidentCount={demoScenarioMembers.filter((member) => member.householdKind !== 'other' && !member.unit).length} />
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-residents') {
    return (
      <OrganizerShell current="residents" onCreate={createDemoCampaign} templates={demoCreateFromTemplate}>
        <ResidentMemberManagementApp
          key={parseResidentFilter(search)}
          members={[...demoResidentMembers, ...demoScenarioMembers]}
          initialFilter={parseResidentFilter(search)}
          onSetBlocked={async () => undefined}
          onUpdateHousehold={async () => undefined}
          onRefreshGroupStatuses={(memberCodes) => demoRefreshGroupStatuses(memberCodes)}
        />
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-settings') {
    return (
      <OrganizerShell current="settings" onCreate={createDemoCampaign} templates={demoCreateFromTemplate}>
        <OrganizerSettings
          autoCloseNotificationState="current_user"
          onSelectCurrentUserForAutoCloseNotification={async () => undefined}
          templateActions={{
            list: () => demoTemplates.list(),
            rename: (templateId, name) => demoTemplates.rename(templateId, name),
            remove: (templateId) => demoTemplates.delete(templateId),
          }}
        />
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-campaign') {
    return (
      <OrganizerShell current="campaigns" onCreate={createDemoCampaign} templates={demoCreateFromTemplate}>
        {appRoute.campaignId === demoDraft.id
          ? <DemoOrganizerDraftWorkspace draft={demoDraft} saveTemplate={demoSaveTemplate} />
          : demoScenarios.find((scenario) => demoScenarioOrganizerId(scenario.slug) === appRoute.campaignId)
            ? <DemoOrganizerScenarioWorkspace
                key={appRoute.campaignId}
                scenario={demoScenarios.find((scenario) => demoScenarioOrganizerId(scenario.slug) === appRoute.campaignId)!}
                requestedSection={appRoute.section}
                saveTemplate={demoSaveTemplate}
              />
            : <DemoOrganizerWorkspace requestedSection={appRoute.section} />}
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'resident-default') {
    return (
      <ResidentCampaignListApp
        identity={{ displayName: '測試住戶', pictureUrl: null }}
        campaigns={[
          {
            slug: DEMO_CAMPAIGN_SLUG,
            title: campaign.title,
            status: 'open',
            unitPrice: campaign.unitPrice,
            openedAt: campaign.openedAt,
            totalQuantity: demoTotalQuantity,
            threshold: campaign.threshold,
            images: campaign.images,
          },
          ...demoScenarios.map(demoScenarioListItem),
        ]}
      />
    )
  }
  if (appRoute.kind === 'resident-orders') {
    return (
      <ResidentMyOrdersApp
        identity={{ displayName: '測試住戶', pictureUrl: null }}
        orders={demoScenarios.flatMap((scenario) => demoScenarioMyOrder(scenario) ?? [])}
      />
    )
  }
  if (appRoute.kind === 'resident-campaign') {
    const scenario = demoScenarios.find((candidate) => candidate.slug === appRoute.campaignSlug)
    if (scenario) return <DemoResidentScenarioApp key={scenario.slug} scenario={scenario} />
  }
  return <App />
}
