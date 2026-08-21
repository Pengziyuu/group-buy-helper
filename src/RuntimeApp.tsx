import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import AdminApp from './AdminApp'
import CampaignListApp from './CampaignListApp'
import App from './App'
import { LocalLiveAdminApp, LocalLiveResidentApp } from './LocalLiveApps'
import { parseAppRoute, selectAppMode } from './routing'
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
const demoOrganizerCampaign = {
  id: DEMO_CAMPAIGN_ID,
  slug: DEMO_CAMPAIGN_SLUG,
  title: campaign.title,
  status: 'open' as const,
  openedAt: campaign.openedAt,
  createdAt: campaign.openedAt,
  updatedAt: campaign.openedAt,
}
const demoResidentMembers = [
  { memberCode: 'demo-member-a01', displayName: '測試住戶甲', pictureUrl: null, period: 2, unit: 'A01', joinedAt: campaign.openedAt, blocked: false, blockedAt: null },
  { memberCode: 'demo-member-b08', displayName: '測試住戶乙', pictureUrl: null, period: 1, unit: 'B08', joinedAt: campaign.openedAt, blocked: true, blockedAt: campaign.openedAt },
]
const demoTotalQuantity = initialOrders.reduce((total, order) =>
  total + Object.values(order.items).reduce((sum, quantity) => sum + quantity, 0), 0)

const initialDemoOrganizerOrders: OrganizerVisibleOrder[] = initialOrders.map((order, index) => ({
  ...order,
  items: { ...order.items },
  orderId: `demo-order-${index + 1}`,
  paid: false,
  pickupStatus: 'pending',
}))

function DemoOrganizerEditor() {
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>('open')
  const [orders, setOrders] = useState<OrganizerVisibleOrder[]>(initialDemoOrganizerOrders)
  const orderSummary = buildOrganizerOrderSummary({
    orders,
    items,
    unitPrice: campaign.unitPrice,
    threshold: campaign.threshold,
  })

  return (
    <AdminApp
      orderSummary={orderSummary}
      campaignStatus={campaignStatus}
      onSetCampaignStatus={async (status) => setCampaignStatus(status)}
      onSetOrderFulfillment={async (orderId, update) => {
        setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, ...update } : order))
      }}
      residentHref={`/campaign/${DEMO_CAMPAIGN_SLUG}`}
    />
  )
}

export type RuntimeAppProps = {
  config: RuntimeConfig
  pathname: string
  client?: SupabaseClient<Database>
  liffClient?: LiffClient
}

export default function RuntimeApp({ config, pathname, client, liffClient }: RuntimeAppProps) {
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
    if (appRoute.kind === 'admin-list') {
      return <LocalLiveAdminApp client={client} liffId={config.mode === 'live' ? config.liffId : undefined} liffClient={liffClient} authStorage={getBrowserAuthStorage()} logoutFallbackStorage={getBrowserSessionStorage()} />
    }
    if (appRoute.kind === 'admin-editor') {
      return <LocalLiveAdminApp client={client} campaignId={appRoute.campaignId} liffId={config.mode === 'live' ? config.liffId : undefined} liffClient={liffClient} authStorage={getBrowserAuthStorage()} logoutFallbackStorage={getBrowserSessionStorage()} />
    }
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
  if (appRoute.kind === 'admin-list') {
    return (
      <CampaignListApp
        campaigns={[demoOrganizerCampaign]}
        onCreate={async (title) => ({ ...demoOrganizerCampaign, title, openedAt: null })}
        residentMembers={demoResidentMembers}
        onSetResidentBlocked={async () => undefined}
      />
    )
  }
  if (appRoute.kind === 'admin-editor') {
    return <DemoOrganizerEditor />
  }
  if (appRoute.kind === 'resident-default') {
    return (
      <ResidentCampaignListApp
        identity={{ displayName: '測試住戶', pictureUrl: null }}
        campaigns={[{
          slug: DEMO_CAMPAIGN_SLUG,
          title: campaign.title,
          status: 'open',
          unitPrice: campaign.unitPrice,
          openedAt: campaign.openedAt,
          totalQuantity: demoTotalQuantity,
          threshold: campaign.threshold,
        }]}
      />
    )
  }
  return <App />
}
