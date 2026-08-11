import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './index.css'
import App from './App.tsx'
import AdminApp from './AdminApp.tsx'
import { LocalLiveAdminApp, LocalLiveResidentApp } from './LocalLiveApps.tsx'
import { selectAppMode } from './routing.ts'
import { runtimeConfig } from './services/runtime.ts'
import type { Database } from './types/database.ts'
import {
  getBrowserAuthStorage,
  getBrowserSessionStorage,
  SUPABASE_AUTH_STORAGE_KEY,
} from './services/authStorage.ts'

const appMode = selectAppMode(window.location.pathname)

function rootApplication() {
  if (runtimeConfig.mode === 'local-live-demo') {
    const client = createClient<Database>(
      runtimeConfig.supabaseUrl,
      runtimeConfig.supabaseAnonKey,
      { auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY } },
    )
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
