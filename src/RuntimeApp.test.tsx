import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import RuntimeApp from './RuntimeApp'
import type { Database } from './types/database'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('./LocalLiveApps', () => ({
  LocalLiveAdminApp: ({ campaignId, section, page, residentFilter, liffId, liffClient, notificationLab }: { campaignId?: string; section?: string | null; page?: string; residentFilter?: string; liffId?: string; liffClient?: unknown; notificationLab?: boolean }) => notificationLab
    ? <div>supabase-admin:notification-lab</div>
    : (
      <div>supabase-admin:{campaignId ? `${campaignId}/${section ?? 'default'}` : `${page}/${residentFilter ?? 'all'}`}:{liffId ?? 'no-liff'}:{liffClient ? 'client' : 'no-client'}</div>
    ),
  LocalLiveResidentApp: ({ campaignSlug, inviteSlug, liffId, liffClient }: { campaignSlug?: string; inviteSlug?: string; liffId?: string; liffClient?: unknown }) => (
    <div>supabase-resident:{campaignSlug ?? 'list'}:{inviteSlug ?? 'no-invite'}:{liffId ?? 'no-liff'}:{liffClient ? 'client' : 'no-client'}</div>
  ),
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
    expect(screen.getByText('supabase-admin:home/all:2011099887-PlmOrmYw:client')).toBeInTheDocument()
  })

  it('connects every organizer page and workspace section to the Supabase-backed app', () => {
    const { rerender } = render(<RuntimeApp config={liveConfig} pathname="/admin" client={stableClient} />)
    expect(screen.getByText('supabase-admin:home/all:no-liff:no-client')).toBeInTheDocument()

    rerender(<RuntimeApp config={liveConfig} pathname="/admin/residents" search="?filter=unbound" client={stableClient} />)
    expect(screen.getByText('supabase-admin:residents/unbound:no-liff:no-client')).toBeInTheDocument()

    rerender(<RuntimeApp config={liveConfig} pathname="/admin/settings" client={stableClient} />)
    expect(screen.getByText('supabase-admin:settings/all:no-liff:no-client')).toBeInTheDocument()

    rerender(<RuntimeApp config={liveConfig} pathname="/admin/campaign/8d2f0f6a-1111-4222-8333-123456789abc" client={stableClient} />)
    expect(screen.getByText('supabase-admin:8d2f0f6a-1111-4222-8333-123456789abc/default:no-liff:no-client')).toBeInTheDocument()

    rerender(<RuntimeApp config={liveConfig} pathname="/admin/campaign/8d2f0f6a-1111-4222-8333-123456789abc/pickup" client={stableClient} />)
    expect(screen.getByText('supabase-admin:8d2f0f6a-1111-4222-8333-123456789abc/pickup:no-liff:no-client')).toBeInTheDocument()
  })

  it('connects the isolated notification lab to the Supabase-backed organizer app', () => {
    render(<RuntimeApp config={liveConfig} pathname="/admin/notification-lab" client={stableClient} />)
    expect(screen.getByText('supabase-admin:notification-lab')).toBeInTheDocument()
  })

  it('connects a valid share slug to the Supabase-backed resident app', () => {
    render(<RuntimeApp config={liveConfig} pathname="/campaign/0123456789abcdef0123456789abcdef0123" client={stableClient} />)
    expect(screen.getByText('supabase-resident:0123456789abcdef0123456789abcdef0123:no-invite:no-liff:no-client')).toBeInTheDocument()
  })

  it('uses the production root as the fixed resident LIFF campaign list entry', () => {
    const config = { ...liveConfig, residentLiffId: '2011099887-Resident' }
    render(<RuntimeApp config={config} pathname="/" client={stableClient} liffClient={stableLiff as never} />)
    expect(screen.getByText('supabase-resident:list:no-invite:2011099887-Resident:client')).toBeInTheDocument()
  })

  it('keeps legacy resident invitation URLs compatible with the public LINE entry', () => {
    const config = { ...liveConfig, residentLiffId: '2011099887-Resident' }
    render(<RuntimeApp config={config} pathname="/join/abcdef0123456789abcdef0123456789abcd" client={stableClient} liffClient={stableLiff as never} />)
    expect(screen.getByText('supabase-resident:list:no-invite:2011099887-Resident:client')).toBeInTheDocument()
  })

  it('does not expose fallback demo campaign data on the production root without a resident LIFF configuration', () => {
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

describe('RuntimeApp localStorage resident demo routing', () => {
  afterEach(() => { window.history.replaceState(null, '', '/') })

  it('loads demo-only routes on demand with a visible pending state', async () => {
    render(<RuntimeApp config={{ mode: 'demo' }} pathname="/" />)
    expect(screen.getByRole('status', { name: '載入示範畫面…' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '團購' })).toBeInTheDocument()
  })

  it('ignores a popstate event so a resident page keeps its LIFF-resolved pathname', () => {
    const config = { mode: 'demo' as const }
    render(<RuntimeApp config={config} pathname="/" />)
    expect(screen.getByRole('heading', { name: '團購' })).toBeInTheDocument()

    act(() => {
      window.history.pushState(null, '', '/admin')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('heading', { name: '團購' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立新團' })).not.toBeInTheDocument()
  })

  it('does not impersonate the Live notification lab with resident demo data', () => {
    render(<RuntimeApp config={{ mode: 'demo' }} pathname="/admin/notification-lab" />)
    expect(screen.getByText('通知測試中心僅提供 Live 模式使用')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '送出訂單' })).not.toBeInTheDocument()
  })

  it('opens the resident list at root and the order page from its campaign link', () => {
    const config = { mode: 'demo' as const }
    const { rerender } = render(<RuntimeApp config={config} pathname="/" />)

    expect(screen.getByRole('heading', { name: '團購' })).toBeInTheDocument()
    const campaignLink = screen.getByRole('link', { name: '一涼製冰所 超厚三明治冰餅' })
    expect(campaignLink).toHaveAttribute('href', '/c/0123456789abcdef0123456789abcdef0123')

    rerender(<RuntimeApp config={config} pathname="/c/0123456789abcdef0123456789abcdef0123" />)
    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.getByText('二期 2K13・斯祈')).toBeInTheDocument()
  })
})

describe('RuntimeApp localStorage organizer demo routing', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { window.history.replaceState(null, '', '/') })

  it('moves from the organizer home into a campaign workspace and back without reloading', async () => {
    const user = userEvent.setup()
    const config = { mode: 'demo' as const }
    const campaignId = '01234567-89ab-cdef-0123-456789abcdef'
    render(<RuntimeApp config={config} pathname="/admin" />)

    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '一涼製冰所 超厚三明治冰餅' }))

    await waitFor(() => expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/orders`))
    expect(screen.getByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    expect(screen.queryByText('即時更新')).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: '訂單 6' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '示範備註{Enter}')
    expect(await screen.findByRole('button', { name: '編輯 H11 備註' })).toHaveTextContent('示範備註')

    await user.click(screen.getByRole('link', { name: '內容設定' }))
    expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/content`)
    expect(screen.getByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '所有團購' }))
    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
  })

  it('opens the demo residents and settings pages', async () => {
    const config = { mode: 'demo' as const }
    const { rerender } = render(<RuntimeApp config={config} pathname="/admin/residents" />)
    expect(screen.getByRole('heading', { level: 1, name: /^住戶 \d+ 位$/ })).toBeInTheDocument()

    rerender(<RuntimeApp config={config} pathname="/admin/settings" />)
    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    await screen.findByText(/還沒有範本。在團購工作區/)
  })

  it('moves focus to the new page heading after clicking an organizer nav link', async () => {
    const user = userEvent.setup()
    const config = { mode: 'demo' as const }
    render(<RuntimeApp config={config} pathname="/admin" />)
    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '住戶' }))

    expect(await screen.findByRole('heading', { level: 1, name: /^住戶 \d+ 位$/ })).toHaveFocus()
  })

  it('keeps focus on the campaign heading through the follow-up URL replace that fills in the default section', async () => {
    const user = userEvent.setup()
    const config = { mode: 'demo' as const }
    const campaignId = '01234567-89ab-cdef-0123-456789abcdef'
    render(<RuntimeApp config={config} pathname="/admin" />)

    await user.click(screen.getByRole('link', { name: '一涼製冰所 超厚三明治冰餅' }))

    await waitFor(() => expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/orders`))
    expect(screen.getByRole('heading', { level: 1, name: '一涼製冰所 超厚三明治冰餅' })).toHaveFocus()
  })

  it('saves the demo campaign as a template and shows it on the settings page', async () => {
    const user = userEvent.setup()
    const config = { mode: 'demo' as const }
    const campaignId = '01234567-89ab-cdef-0123-456789abcdef'
    const { unmount } = render(<RuntimeApp config={config} pathname={`/admin/campaign/${campaignId}/overview`} />)

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await user.clear(within(dialog).getByRole('textbox', { name: '範本名稱' }))
    await user.type(within(dialog).getByRole('textbox', { name: '範本名稱' }), '示範範本')
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))
    expect(await screen.findByText('已存成範本「示範範本」')).toBeInTheDocument()
    unmount()

    render(<RuntimeApp config={config} pathname="/admin/settings" />)
    expect(await screen.findByRole('rowheader', { name: '示範範本' })).toBeInTheDocument()
  })
})

describe('RuntimeApp demo resident scenarios', () => {
  it('lists every scenario and opens each one on its own page', () => {
    const { unmount } = render(<RuntimeApp config={{ mode: 'demo' }} pathname="/" />)
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/c/'))
    const hrefs = links.map((link) => link.getAttribute('href')!)
    expect(hrefs.length).toBeGreaterThanOrEqual(8)
    unmount()

    for (const href of hrefs.filter((candidate) => !candidate.endsWith('0123456789abcdef0123456789abcdef0123'))) {
      const title = links.find((link) => link.getAttribute('href') === href)!.textContent!
      const page = render(<RuntimeApp config={{ mode: 'demo' }} pathname={href} />)
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      page.unmount()
    }
  })

  it('shows the binding form to a resident who has not bound a household', () => {
    render(<RuntimeApp config={{ mode: 'demo' }} pathname="/campaign/d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4" />)
    expect(screen.getByRole('heading', { name: '首次填寫住戶資料' })).toBeInTheDocument()
  })

  it('shows a closed scenario as read-only', () => {
    render(<RuntimeApp config={{ mode: 'demo' }} pathname="/campaign/f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6" />)
    expect(screen.getByText('本團已結單，無法修改訂單。')).toBeInTheDocument()
  })
})

describe('RuntimeApp demo organizer scenarios', () => {
  it('lists the scenarios and a draft, and opens each campaign workspace', async () => {
    const { demoResidentScenarios } = await import('./data/demoResidentScenarios')
    const { demoScenarioOrganizerId } = await import('./data/demoOrganizerScenarios')
    const home = render(<RuntimeApp config={{ mode: 'demo' }} pathname="/admin" />)
    expect(screen.getByRole('link', { name: '中秋文旦柚（草稿，尚未發布）' })).toBeInTheDocument()
    const scenarios = demoResidentScenarios()
    for (const scenario of scenarios) expect(screen.getByRole('link', { name: scenario.content.title })).toBeInTheDocument()
    home.unmount()

    for (const scenario of scenarios) {
      const page = render(<RuntimeApp config={{ mode: 'demo' }} pathname={`/admin/campaign/${demoScenarioOrganizerId(scenario.slug)}/orders`} />)
      expect(screen.getByRole('heading', { level: 1, name: scenario.content.title })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '訂單' })).toBeInTheDocument()
      // Every campaign can be saved as a template, as in live mode.
      expect(screen.getByRole('button', { name: '存成範本' })).toBeInTheDocument()
      page.unmount()
    }
  })

  it('opens the draft on its content settings only', () => {
    render(<RuntimeApp config={{ mode: 'demo' }} pathname="/admin/campaign/5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e" />)
    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('中秋文旦柚（草稿，尚未發布）')
    expect(screen.getByRole('button', { name: '存成範本' })).toBeInTheDocument()
  })
})

describe('demo resident scenario data', () => {
  it('never shows an open quantity campaign at its threshold, since reaching it closes the campaign', async () => {
    const { demoResidentScenarios, demoScenarioListItem } = await import('./data/demoResidentScenarios')
    const impossible = demoResidentScenarios()
      .map(demoScenarioListItem)
      .filter((item) => item.status === 'open' && (item.thresholdKind ?? 'quantity') === 'quantity' && item.totalQuantity >= item.threshold)
      .map((item) => item.title)
    expect(impossible).toEqual([])
  })
})
