import type { Breadcrumb, ErrorEvent } from '@sentry/react'
import { describe, expect, it } from 'vitest'
import { scrubBreadcrumb, scrubEvent } from './errorMonitoring'
import { shouldMonitorErrors } from './errorMonitoringPolicy'

const live = { mode: 'live' as const, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k', liffId: 'l', residentLiffId: 'r' }

describe('error monitoring', () => {
  it('reports only from the production build of the live site, never from demo previews or local work', () => {
    expect(shouldMonitorErrors(live, true)).toBe(true)
    expect(shouldMonitorErrors({ mode: 'demo' }, true)).toBe(false)
    expect(shouldMonitorErrors(live, false)).toBe(false)
  })

  it('drops addresses’ query strings and fragments, where LINE login tokens and database ids appear, and any user', () => {
    const event = {
      request: { url: 'https://site.example/campaign/abc?liff.state=x&code=secret#access_token=tok', headers: { Cookie: 'c' }, cookies: { a: 'b' } },
      user: { id: 'u1', username: '住戶甲' },
    } as unknown as ErrorEvent
    const scrubbed = scrubEvent(event)!
    expect(scrubbed.request?.url).toBe('https://site.example/campaign/abc')
    expect(scrubbed.request?.headers).toBeUndefined()
    expect(scrubbed.request?.cookies).toBeUndefined()
    expect(scrubbed.user).toBeUndefined()
  })

  it('keeps request breadcrumbs without their query strings, and drops console and clicked-element breadcrumbs', () => {
    const fetch = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/customer?id=eq.123', method: 'GET', status_code: 200 } } as Breadcrumb)
    expect(fetch?.data?.url).toBe('https://x.supabase.co/rest/v1/customer')
    expect(fetch?.data?.status_code).toBe(200)
    const navigation = scrubBreadcrumb({ category: 'navigation', data: { from: '/a?code=1', to: '/b#t' } } as Breadcrumb)
    expect(navigation?.data).toEqual({ from: '/a', to: '/b' })
    expect(scrubBreadcrumb({ category: 'console', message: '住戶甲 2K13' } as Breadcrumb)).toBeNull()
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'button[aria-label="調整住戶資料 住戶甲"]' } as Breadcrumb)).toBeNull()
  })
})
