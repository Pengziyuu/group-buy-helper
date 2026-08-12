import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './index.css'
import RuntimeApp from './RuntimeApp'
import { runtimeConfig, usesSupabaseBackend } from './services/runtime'
import { SUPABASE_AUTH_STORAGE_KEY } from './services/authStorage'
import type { Database } from './types/database'

const supabaseClient = usesSupabaseBackend(runtimeConfig) && runtimeConfig.mode !== 'demo'
  ? createClient<Database>(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    })
  : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeApp config={runtimeConfig} pathname={window.location.pathname} client={supabaseClient} />
  </StrictMode>,
)
