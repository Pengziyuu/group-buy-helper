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

let loadedLiff: Liff | null = null
const liffClient: LiffClient = {
  async init(options) {
    loadedLiff ??= (await import('@line/liff')).default
    return loadedLiff.init(options)
  },
  isLoggedIn: () => loadedLiff?.isLoggedIn() ?? false,
  login: () => { loadedLiff?.login() },
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
      client={supabaseClient}
      liffClient={liffClient}
    />
  </StrictMode>,
)
