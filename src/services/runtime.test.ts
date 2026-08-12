import { describe, expect, it } from 'vitest'
import { resolveRuntimeConfig, usesSupabaseBackend } from './runtime'

describe('resolveRuntimeConfig', () => {
  it('uses demo mode when no external credentials are present', () => {
    expect(resolveRuntimeConfig({})).toEqual({ mode: 'demo' })
  })

  it('uses live mode when the Supabase settings are present before LIFF is configured', () => {
    expect(resolveRuntimeConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    })).toEqual({
      mode: 'live',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    })

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
      .toThrow('Supabase URL 與公開金鑰必須一起提供')
    expect(() => resolveRuntimeConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }))
      .toThrow('Supabase URL 與公開金鑰必須一起提供')
  })

  it('rejects a Supabase secret key from browser-exposed VITE configuration', () => {
    expect(() => resolveRuntimeConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_must-never-reach-browser',
    })).toThrow('VITE_SUPABASE_ANON_KEY只能使用publishable或anon公開金鑰')

    expect(() => resolveRuntimeConfig({
      VITE_LOCAL_SUPABASE_DEMO: 'true',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_must-never-reach-browser',
      VITE_DEMO_CAMPAIGN_ID: 'campaign-1',
      VITE_DEMO_CAMPAIGN_SLUG: 'slug',
    })).toThrow('VITE_SUPABASE_ANON_KEY只能使用publishable或anon公開金鑰')
  })
})

describe('usesSupabaseBackend', () => {
  it('connects both local-live and production-live modes to Supabase', () => {
    expect(usesSupabaseBackend({
      mode: 'local-live-demo',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'local-key',
      campaignId: 'campaign-1',
      campaignSlug: 'slug',
    })).toBe(true)
    expect(usesSupabaseBackend({
      mode: 'live',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      liffId: '123-example',
    })).toBe(true)
    expect(usesSupabaseBackend({ mode: 'demo' })).toBe(false)
  })
})
