import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import type { Liff } from '@line/liff'
import './index.css'
import RuntimeApp from './RuntimeApp'
import { resolveLiffPath } from './routing'
import { runtimeConfig, usesSupabaseBackend } from './services/runtime'
import { SUPABASE_AUTH_STORAGE_KEY } from './services/authStorage'
import type { LiffClient } from './services/liffIdentity'
import type { Database } from './types/database'
import { shouldMonitorErrors } from './services/errorMonitoringPolicy'

// Sentry is a separate download, fetched only on the live site; its global handlers catch errors React rethrows.
// It waits until the page has loaded and the browser is idle, so on a slow phone connection it does not
// compete with the app's own scripts and first queries.
if (shouldMonitorErrors(runtimeConfig, import.meta.env.PROD)) {
  const startMonitoring = () => {
    void import('./services/errorMonitoring').then(({ startErrorMonitoring }) => startErrorMonitoring(runtimeConfig, true))
  }
  const whenIdle = () => window.requestIdleCallback ? window.requestIdleCallback(startMonitoring, { timeout: 3000 }) : window.setTimeout(startMonitoring, 1000)
  if (document.readyState === 'complete') whenIdle()
  else window.addEventListener('load', whenIdle, { once: true })
}

let loadedLiff: Liff | null = null
const liffClient: LiffClient = {
  async init(options) {
    loadedLiff ??= (await import('@line/liff')).default
    return loadedLiff.init(options)
  },
  isLoggedIn: () => loadedLiff?.isLoggedIn() ?? false,
  isInClient: () => loadedLiff?.isInClient() ?? false,
  login: () => { loadedLiff?.login() },
  logout: () => { loadedLiff?.logout() },
  getProfile: async () => {
    if (!loadedLiff) throw new Error('LIFF 尚未初始化')
    return loadedLiff.getProfile()
  },
  getIDToken: () => loadedLiff?.getIDToken() ?? null,
}

const supabaseClient = usesSupabaseBackend(runtimeConfig) && runtimeConfig.mode !== 'demo'
  ? createClient<Database>(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    })
  : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeApp
      config={runtimeConfig}
      pathname={resolveLiffPath(window.location.pathname, window.location.search)}
      search={window.location.search}
      client={supabaseClient}
      liffClient={liffClient}
    />
  </StrictMode>,
)
