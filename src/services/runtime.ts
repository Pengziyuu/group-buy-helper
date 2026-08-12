export type RuntimeEnvironment = Partial<Record<
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_LIFF_ID'
  | 'VITE_LOCAL_SUPABASE_DEMO'
  | 'VITE_DEMO_CAMPAIGN_ID'
  | 'VITE_DEMO_CAMPAIGN_SLUG',
  string
>>

export type RuntimeConfig =
  | { mode: 'demo' }
  | {
      mode: 'local-live-demo'
      supabaseUrl: string
      supabaseAnonKey: string
      campaignId: string
      campaignSlug: string
    }
  | {
      mode: 'live'
      supabaseUrl: string
      supabaseAnonKey: string
      liffId?: string
    }

export function resolveRuntimeConfig(environment: RuntimeEnvironment): RuntimeConfig {
  const supabaseUrl = environment.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim()
  const localDemo = environment.VITE_LOCAL_SUPABASE_DEMO?.trim() === 'true'
  const campaignId = environment.VITE_DEMO_CAMPAIGN_ID?.trim()
  const campaignSlug = environment.VITE_DEMO_CAMPAIGN_SLUG?.trim()
  const liffId = environment.VITE_LIFF_ID?.trim()

  if (supabaseAnonKey?.startsWith('sb_secret_')) {
    throw new Error('VITE_SUPABASE_ANON_KEY只能使用publishable或anon公開金鑰')
  }

  if (localDemo) {
    if (!supabaseUrl || !supabaseAnonKey || !campaignId || !campaignSlug) {
      throw new Error('本機 Supabase Demo 設定不完整')
    }
    return {
      mode: 'local-live-demo',
      supabaseUrl,
      supabaseAnonKey,
      campaignId,
      campaignSlug,
    }
  }
  const suppliedSupabase = [supabaseUrl, supabaseAnonKey].filter(Boolean).length

  if (suppliedSupabase === 0 && !liffId) return { mode: 'demo' }
  if (suppliedSupabase !== 2) throw new Error('Supabase URL 與公開金鑰必須一起提供')
  return {
    mode: 'live',
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    ...(liffId ? { liffId } : {}),
  }
}

export function usesSupabaseBackend(config: RuntimeConfig): boolean {
  return config.mode === 'local-live-demo' || config.mode === 'live'
}

export const runtimeConfig = resolveRuntimeConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_LIFF_ID: import.meta.env.VITE_LIFF_ID,
  VITE_LOCAL_SUPABASE_DEMO: import.meta.env.VITE_LOCAL_SUPABASE_DEMO,
  VITE_DEMO_CAMPAIGN_ID: import.meta.env.VITE_DEMO_CAMPAIGN_ID,
  VITE_DEMO_CAMPAIGN_SLUG: import.meta.env.VITE_DEMO_CAMPAIGN_SLUG,
})
