import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './index.css'
import App from './App.tsx'
import AdminApp from './AdminApp.tsx'
import { LocalLiveAdminApp, LocalLiveResidentApp } from './LocalLiveApps.tsx'
import { parseAppRoute, selectAppMode } from './routing.ts'
import { runtimeConfig } from './services/runtime.ts'
import type { Database } from './types/database.ts'
import {
  getBrowserAuthStorage,
  getBrowserSessionStorage,
  SUPABASE_AUTH_STORAGE_KEY,
} from './services/authStorage.ts'

const appMode = selectAppMode(window.location.pathname)
const appRoute = parseAppRoute(window.location.pathname)

function rootApplication() {
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
  if (runtimeConfig.mode === 'local-live-demo') {
    const client = createClient<Database>(
      runtimeConfig.supabaseUrl,
      runtimeConfig.supabaseAnonKey,
      { auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY } },
    )
    if (appRoute.kind === 'admin-list') {
      return (
        <LocalLiveAdminApp
          client={client}
          authStorage={getBrowserAuthStorage()}
          logoutFallbackStorage={getBrowserSessionStorage()}
        />
      )
    }
    if (appRoute.kind === 'admin-editor') {
      return (
        <LocalLiveAdminApp
          client={client}
          campaignId={appRoute.campaignId}
          authStorage={getBrowserAuthStorage()}
          logoutFallbackStorage={getBrowserSessionStorage()}
        />
      )
    }
    if (appRoute.kind === 'resident-campaign') {
      return (
        <LocalLiveResidentApp
          client={client}
          campaignSlug={appRoute.campaignSlug}
        />
      )
    }
    return appMode === 'admin'
      ? (
          <LocalLiveAdminApp
            client={client}
            campaignId={runtimeConfig.campaignId}
            authStorage={getBrowserAuthStorage()}
            logoutFallbackStorage={getBrowserSessionStorage()}
          />
        )
      : (
          <LocalLiveResidentApp
            client={client}
            campaignId={runtimeConfig.campaignId}
            campaignSlug={runtimeConfig.campaignSlug}
          />
        )
  }

  return appMode === 'admin' ? <AdminApp /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {rootApplication()}
  </StrictMode>,
)
