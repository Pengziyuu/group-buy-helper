import type { SupabaseClient } from '@supabase/supabase-js'
import AdminApp from './AdminApp'
import App from './App'
import { LocalLiveAdminApp, LocalLiveResidentApp } from './LocalLiveApps'
import { parseAppRoute, selectAppMode } from './routing'
import type { RuntimeConfig } from './services/runtime'
import { usesSupabaseBackend } from './services/runtime'
import type { Database } from './types/database'
import { getBrowserAuthStorage, getBrowserSessionStorage } from './services/authStorage'

import type { LiffClient } from './services/liffIdentity'

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
        <div className="live-state-card live-error" role="alert">
          <strong>找不到這個團購頁面</strong>
          <p>請回到正確的團購列表或使用團主提供的完整分享連結。</p>
          <a href="/">回到首頁</a>
        </div>
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
        <div className="live-state-card">
          <strong>請使用團主提供的完整團購連結</strong>
          <p>正式測試站不會在首頁顯示示範資料。</p>
          <a href="/admin">團主登入</a>
        </div>
      </main>
    )
  }
  return appMode === 'admin' ? <AdminApp /> : <App />
}
