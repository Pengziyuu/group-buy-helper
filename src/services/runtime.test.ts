import { describe, expect, it } from 'vitest'
import { resolveRuntimeConfig } from './runtime'

describe('resolveRuntimeConfig', () => {
  it('uses demo mode when no external credentials are present', () => {
    expect(resolveRuntimeConfig({})).toEqual({ mode: 'demo' })
  })

  it('uses live mode only when Supabase and LIFF settings are all present', () => {
    expect(resolveRuntimeConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_LIFF_ID: '123-example',
    })).toEqual({
      mode: 'live',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      liffId: '123-example',
    })
  })

  it('rejects partial live configuration instead of silently falling back', () => {
    expect(() => resolveRuntimeConfig({ VITE_LIFF_ID: '123-example' }))
      .toThrow('LIFF 與 Supabase 設定必須一起提供')
  })
})
