import { lazy, Suspense } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LocalLiveAdminApp, LocalLiveResidentApp } from './LocalLiveApps'
import { OrganizerNavigationProvider } from './components/organizer/OrganizerLink'
import { useBrowserLocation, useFocusHeadingOnNavigate } from './components/organizer/organizerNavigation'
import { parseAppRoute, parseResidentFilter, selectAppMode } from './routing'
import type { RuntimeConfig } from './services/runtime'
import { usesSupabaseBackend } from './services/runtime'
import type { Database } from './types/database'
import { getBrowserAuthStorage, getBrowserSessionStorage } from './services/authStorage'
import { EmptyState, ErrorState, LoadingState } from './components/ui/AsyncState'
import { LazySectionBoundary } from './components/ui/LazySectionBoundary'
import type { LiffClient } from './services/liffIdentity'

const DemoRuntimeRoutes = lazy(() => import('./DemoRuntimeRoutes'))

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
    if (!client) throw new Error('Supabase client 未初始化')
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
    if (appRoute.kind === 'resident-orders' && config.mode === 'live' && config.residentLiffId) {
      return <LocalLiveResidentApp client={client} liffId={config.residentLiffId} liffClient={liffClient} page="orders" />
    }
    if (appRoute.kind === 'resident-default' && config.mode === 'live' && config.residentLiffId) {
      return <LocalLiveResidentApp client={client} liffId={config.residentLiffId} liffClient={liffClient} />
    }
    if (config.mode === 'local-live-demo') {
      return selectAppMode(pathname) === 'admin'
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
  return (
    <LazySectionBoundary>
      <Suspense fallback={<main className="live-state-shell"><LoadingState label="載入示範畫面…" page /></main>}>
        <DemoRuntimeRoutes pathname={pathname} search={search} />
      </Suspense>
    </LazySectionBoundary>
  )
}
