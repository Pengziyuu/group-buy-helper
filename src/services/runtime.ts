export type RuntimeEnvironment = Partial<Record<
  'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'VITE_LIFF_ID',
  string
>>

export type RuntimeConfig =
  | { mode: 'demo' }
  | {
      mode: 'live'
      supabaseUrl: string
      supabaseAnonKey: string
      liffId: string
    }

export function resolveRuntimeConfig(environment: RuntimeEnvironment): RuntimeConfig {
  const supabaseUrl = environment.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim()
  const liffId = environment.VITE_LIFF_ID?.trim()
  const supplied = [supabaseUrl, supabaseAnonKey, liffId].filter(Boolean).length

  if (supplied === 0) return { mode: 'demo' }
  if (supplied !== 3) throw new Error('LIFF 與 Supabase 設定必須一起提供')

  return {
    mode: 'live',
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    liffId: liffId!,
  }
}

export const runtimeConfig = resolveRuntimeConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_LIFF_ID: import.meta.env.VITE_LIFF_ID,
})
