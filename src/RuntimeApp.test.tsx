import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import RuntimeApp from './RuntimeApp'
import type { Database } from './types/database'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('./LocalLiveApps', () => ({
  LocalLiveAdminApp: ({ campaignId, liffId, liffClient }: { campaignId?: string; liffId?: string; liffClient?: unknown }) => (
    <div>supabase-admin:{campaignId ?? 'list'}:{liffId ?? 'no-liff'}:{liffClient ? 'client' : 'no-client'}</div>
  ),
  LocalLiveResidentApp: ({ campaignSlug }: { campaignSlug?: string }) => <div>supabase-resident:{campaignSlug}</div>,
}))

const liveConfig = {
  mode: 'live' as const,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'publishable-key',
}
const stableClient = { auth: {} } as SupabaseClient<Database>
const stableLiff = { init: vi.fn() }

describe('RuntimeApp production live routing', () => {
  it('injects LIFF only into the production organizer app', () => {
    const config = { ...liveConfig, liffId: '2011099887-PlmOrmYw' }
    render(<RuntimeApp config={config} pathname="/admin" client={stableClient} liffClient={stableLiff as never} />)
    expect(screen.getByText('supabase-admin:list:2011099887-PlmOrmYw:client')).toBeInTheDocument()
  })

  it('connects the admin list and editor to the Supabase-backed app', () => {
    const { rerender } = render(<RuntimeApp config={liveConfig} pathname="/admin" client={stableClient} />)
    expect(screen.getByText('supabase-admin:list:no-liff:no-client')).toBeInTheDocument()

    rerender(<RuntimeApp config={liveConfig} pathname="/admin/campaign/8d2f0f6a-1111-4222-8333-123456789abc" client={stableClient} />)
    expect(screen.getByText('supabase-admin:8d2f0f6a-1111-4222-8333-123456789abc:no-liff:no-client')).toBeInTheDocument()
  })

  it('connects a valid share slug to the Supabase-backed resident app', () => {
    render(<RuntimeApp config={liveConfig} pathname="/campaign/0123456789abcdef0123456789abcdef0123" client={stableClient} />)
    expect(screen.getByText('supabase-resident:0123456789abcdef0123456789abcdef0123')).toBeInTheDocument()
  })

  it('does not expose fallback demo campaign data on the production root', () => {
    render(<RuntimeApp config={liveConfig} pathname="/" client={stableClient} />)
    expect(screen.getByText('請使用團主提供的完整團購連結')).toBeInTheDocument()
    expect(screen.queryByText('一涼製冰所 超厚三明治冰餅')).not.toBeInTheDocument()
  })

  it('does not construct Supabase clients while StrictMode renders or rerenders', () => {
    const { rerender } = render(
      <StrictMode><RuntimeApp config={liveConfig} pathname="/admin" client={stableClient} /></StrictMode>,
    )
    rerender(<StrictMode><RuntimeApp config={liveConfig} pathname="/" client={stableClient} /></StrictMode>)
    expect(createClient).not.toHaveBeenCalled()
  })
})
