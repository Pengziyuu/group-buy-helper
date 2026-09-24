import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import AdminApp from './AdminApp'
import App from './App'
import { LocalLiveAdminApp, LocalLiveResidentApp } from './LocalLiveApps'
import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
import { OrganizerHome } from './components/organizer/OrganizerHome'
import { OrganizerNavigationProvider } from './components/organizer/OrganizerLink'
import { useBrowserLocation, useFocusHeadingOnNavigate } from './components/organizer/organizerNavigation'
import { OrganizerSettings } from './components/organizer/OrganizerSettings'
import { OrganizerShell } from './components/organizer/OrganizerShell'
import { PickupSection } from './components/organizer/PickupSection'
import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'
import { parseAppRoute, parseResidentFilter, selectAppMode, type WorkspaceSection } from './routing'
import type { RuntimeConfig } from './services/runtime'
import { usesSupabaseBackend } from './services/runtime'
import type { Database } from './types/database'
import { getBrowserAuthStorage, getBrowserSessionStorage } from './services/authStorage'
import { EmptyState, ErrorState } from './components/ui/AsyncState'
import ResidentCampaignListApp from './ResidentCampaignListApp'
import { campaign, initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary, type OrganizerVisibleOrder } from './domain/adminOrders'
import type { CampaignStatus } from './domain/orderWorkflow'

import type { LiffClient } from './services/liffIdentity'

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

function DemoOrganizerWorkspace({ requestedSection }: { requestedSection: WorkspaceSection | null }) {
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>('open')
  const [orders, setOrders] = useState<OrganizerVisibleOrder[]>(initialDemoOrganizerOrders)
  const orderSummary = buildOrganizerOrderSummary({ orders, items, threshold: campaign.threshold })
  const section = resolveWorkspaceSection(requestedSection, true)

  return (
    <CampaignWorkspace
      campaign={{
        id: DEMO_CAMPAIGN_ID,
        title: campaign.title,
        status: campaignStatus,
        published: true,
        coverImage: campaign.images[0] ?? null,
        openedAt: campaign.openedAt,
        orderCount: orders.length,
        residentHref: `/campaign/${DEMO_CAMPAIGN_SLUG}`,
      }}
      requestedSection={requestedSection}
      section={section}
      onSetCampaignStatus={async (status) => setCampaignStatus(status)}
    >
      <AdminApp
        section={section === 'pickup' ? null : section}
        orderSummary={orderSummary}
        campaignStatus={campaignStatus}
        onSetOrderPaid={async (orderId, paid) => {
          setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, paid } : order))
        }}
        onSetOrderOrganizerNote={async (orderId, organizerNote) => {
          setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, organizerNote } : order))
        }}
      />
      {section === 'pickup' && (
        <PickupSection campaignId={DEMO_CAMPAIGN_ID} campaignTitle={campaign.title} campaignStatus={campaignStatus} published excludedOtherCount={0} />
      )}
    </CampaignWorkspace>
  )
}

export type RuntimeAppProps = {
  config: RuntimeConfig
  pathname: string
  search?: string
  client?: SupabaseClient<Database>
  liffClient?: LiffClient
}

export default function RuntimeApp({ config, pathname, search = '', client, liffClient }: RuntimeAppProps) {
  // Only the organizer shell has in-app navigation; a resident page's pathname
  // is resolved from LIFF state, not the browser's address bar, so it must not
  // react to popstate. Based on the initial prop: the mode never changes mid-session.
  const isAdminMode = selectAppMode(pathname) === 'admin'
  const [location, navigate, navigationTick] = useBrowserLocation({ pathname, search }, { enabled: isAdminMode })
  useFocusHeadingOnNavigate(navigationTick, isAdminMode)
  const routes = <RuntimeRoutes config={config} pathname={location.pathname} search={location.search} client={client} liffClient={liffClient} />
  return isAdminMode
    ? <OrganizerNavigationProvider navigate={navigate}>{routes}</OrganizerNavigationProvider>
    : routes
}

function RuntimeRoutes({ config, pathname, search, client, liffClient }: RuntimeAppProps & { search: string }) {
  const appMode = selectAppMode(pathname)
  const appRoute = parseAppRoute(pathname)
  if (appRoute.kind === 'not-found') {
    return (
      <main className="live-state-shell">
        <ErrorState
          title="找不到這個團購頁面"
          message="請回到正確的團購列表或使用團主提供的完整分享連結。"
          secondaryAction={<a className="ui-button" data-variant="secondary" href="/">回到首頁</a>}
          page
        />
      </main>
    )
  }
  if (usesSupabaseBackend(config) && config.mode !== 'demo') {
    if (!client) throw new Error('Supabase client未初始化')
    const adminProps = {
      client,
      liffId: config.mode === 'live' ? config.liffId : undefined,
      liffClient,
      authStorage: getBrowserAuthStorage(),
      logoutFallbackStorage: getBrowserSessionStorage(),
    }
    if (appRoute.kind === 'admin-list') return <LocalLiveAdminApp {...adminProps} page="home" />
    if (appRoute.kind === 'admin-residents') return <LocalLiveAdminApp {...adminProps} page="residents" residentFilter={parseResidentFilter(search)} />
    if (appRoute.kind === 'admin-settings') return <LocalLiveAdminApp {...adminProps} page="settings" />
    if (appRoute.kind === 'admin-notification-lab') return <LocalLiveAdminApp {...adminProps} notificationLab />
    if (appRoute.kind === 'admin-campaign') return <LocalLiveAdminApp {...adminProps} campaignId={appRoute.campaignId} section={appRoute.section} />
    if (appRoute.kind === 'resident-campaign') {
      return <LocalLiveResidentApp client={client} campaignSlug={appRoute.campaignSlug} liffId={config.mode === 'live' ? config.residentLiffId : undefined} liffClient={liffClient} />
    }
    if (appRoute.kind === 'resident-invite' && config.mode === 'live' && config.residentLiffId) {
      return <LocalLiveResidentApp client={client} liffId={config.residentLiffId} liffClient={liffClient} />
    }
    if (appRoute.kind === 'resident-default' && config.mode === 'live' && config.residentLiffId) {
      return <LocalLiveResidentApp client={client} liffId={config.residentLiffId} liffClient={liffClient} />
    }
    if (config.mode === 'local-live-demo') {
      return appMode === 'admin'
        ? <LocalLiveAdminApp client={client} campaignId={config.campaignId} authStorage={getBrowserAuthStorage()} logoutFallbackStorage={getBrowserSessionStorage()} />
        : <LocalLiveResidentApp client={client} campaignId={config.campaignId} campaignSlug={config.campaignSlug} />
    }
    return (
      <main className="live-state-shell">
        <EmptyState
          title="請使用團主提供的完整團購連結"
          description="正式測試站不會在首頁顯示示範資料。"
          action={<a className="ui-button" data-variant="secondary" href="/admin">團主登入</a>}
          page
        />
      </main>
    )
  }
  const createDemoCampaign = async () => ({ id: DEMO_CAMPAIGN_ID })
  if (appRoute.kind === 'admin-notification-lab') {
    return (
      <OrganizerShell current="settings" onCreate={createDemoCampaign}>
        <main className="live-state-shell">
          <EmptyState
            title="通知測試中心僅提供Live模式使用"
            description="本機示範資料不會模擬LINE測試通知，請使用已連接Supabase的團主入口。"
            action={<a className="ui-button" data-variant="secondary" href="/admin">回到團主後台</a>}
            page
          />
        </main>
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-list') {
    return (
      <OrganizerShell current="campaigns" onCreate={createDemoCampaign}>
        <OrganizerHome campaigns={[demoOrganizerCampaign]} autoCloseNotificationState="current_user" unboundResidentCount={0} />
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-residents') {
    return (
      <OrganizerShell current="residents" onCreate={createDemoCampaign}>
        <ResidentMemberManagementApp
          key={parseResidentFilter(search)}
          members={demoResidentMembers}
          initialFilter={parseResidentFilter(search)}
          onSetBlocked={async () => undefined}
          onUpdateHousehold={async () => undefined}
        />
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-settings') {
    return (
      <OrganizerShell current="settings" onCreate={createDemoCampaign}>
        <OrganizerSettings autoCloseNotificationState="current_user" onSelectCurrentUserForAutoCloseNotification={async () => undefined} />
      </OrganizerShell>
    )
  }
  if (appRoute.kind === 'admin-campaign') {
    return (
      <OrganizerShell current="campaigns" onCreate={createDemoCampaign}>
        <DemoOrganizerWorkspace requestedSection={appRoute.section} />
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
          {
            slug: 'abcdef0123456789abcdef0123456789abcd',
            title: '台北南門市場｜雪裏紅素食點心',
            status: 'open',
            unitPrice: 190,
            openedAt: '2026-09-09T05:09:00.000Z',
            totalQuantity: 13,
            threshold: 20,
            quantityUnit: '袋',
            images: campaign.images,
          },
          {
            slug: 'fedcba9876543210fedcba9876543210fedc',
            title: 'Olitalia 奧利塔食用油',
            status: 'closed',
            unitPrice: 220,
            openedAt: '2026-09-09T04:49:00.000Z',
            totalQuantity: 12,
            threshold: 12,
            quantityUnit: '箱',
          },
        ]}
      />
    )
  }
  return <App />
}
