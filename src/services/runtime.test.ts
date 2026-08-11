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

  it('enables the local Supabase visual demo only with an explicit complete configuration', () => {
    expect(resolveRuntimeConfig({
      VITE_LOCAL_SUPABASE_DEMO: 'true',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'local-key',
      VITE_DEMO_CAMPAIGN_ID: 'campaign-1',
      VITE_DEMO_CAMPAIGN_SLUG: 'unguessable-slug',
    })).toEqual({
      mode: 'local-live-demo',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'local-key',
      campaignId: 'campaign-1',
      campaignSlug: 'unguessable-slug',
    })

    expect(() => resolveRuntimeConfig({ VITE_LOCAL_SUPABASE_DEMO: 'true' }))
      .toThrow('本機 Supabase Demo 設定不完整')
  })

  it('rejects partial live configuration instead of silently falling back', () => {
    expect(() => resolveRuntimeConfig({ VITE_LIFF_ID: '123-example' }))
      .toThrow('LIFF 與 Supabase 設定必須一起提供')
  })
})
