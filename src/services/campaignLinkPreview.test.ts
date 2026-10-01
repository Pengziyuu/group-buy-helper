/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import campaignPreview from '../../api/campaign-preview'

const page = '<html lang="zh-Hant"><head><meta property="og:title" content="團購小幫手｜住戶入口" /><meta property="og:description" content="查看社區開團資訊並下單。" /></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>'
const image = 'https://example.supabase.co/storage/v1/object/public/campaign-images/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg'
const original = { url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY, vercel: process.env.VERCEL_URL }

afterEach(() => {
  vi.unstubAllGlobals()
  if (original.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = original.url
  if (original.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = original.key
  if (original.vercel === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = original.vercel
})

async function request(slug: string, rows: unknown, rpcStatus = 200) {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-key'
  process.env.VERCEL_URL = 'example.vercel.app'
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    if (String(input).endsWith('/index.html')) return new Response(page, { status: 200 })
    return new Response(JSON.stringify(rows), { status: rpcStatus, headers: { 'content-type': 'application/json' } })
  }))
  const state: { code: number; headers: Record<string, string>; body: string } = { code: 200, headers: {}, body: '' }
  const res = {
    status(code: number) { state.code = code; return this },
    setHeader(key: string, value: string) { state.headers[key] = value; return this },
    send(body: string) { state.body = body; return this },
  }
  await campaignPreview({ query: { slug }, method: 'GET' }, res)
  return { state, calls }
}

describe('LINE 團購連結預覽', () => {
  it('renders published campaign title, description and approved public cover in raw HTML without losing the SPA', async () => {
    const { state, calls } = await request('a'.repeat(36), [{ title: '神農包子 <新品>', image_url: image }])
    expect(state.code).toBe(200)
    expect(state.body).toContain('og:title" content="神農包子 &lt;新品&gt;｜團購小幫手"')
    expect(state.body).toContain('og:description" content="查看「神農包子 &lt;新品&gt;」團購商品與下單資訊。"')
    expect(state.body).toContain(`og:image" content="${image}"`)
    expect(state.body).toContain('<div id="root"></div>')
    expect(calls[0]?.url).toBe('https://group-buy-helper-liart.vercel.app/index.html')
    expect(calls[1]?.url).toContain('/rest/v1/rpc/campaign_link_preview')
    expect(calls[1]?.init?.headers).toMatchObject({ apikey: 'public-anon-key' })
    expect(calls[1]?.init?.body).toBe(JSON.stringify({ p_slug: 'a'.repeat(36) }))
  })
  it('does not expose draft/unavailable campaigns or attacker-controlled image hosts', async () => {
    const noRow = await request('b'.repeat(36), [])
    expect(noRow.state.body).not.toContain('og:image')
    expect(noRow.state.body).toContain('團購小幫手｜住戶入口')
    const attacker = await request('c'.repeat(36), [{ title: '測試團購', image_url: 'https://example.evil/campaign-images/a.jpg' }])
    expect(attacker.state.body).toContain('測試團購｜團購小幫手')
    expect(attacker.state.body).not.toContain('og:image')
    const malformed = await request('not-a-slug', [{ title: '不應讀取' }])
    expect(malformed.calls).toHaveLength(1)
    expect(malformed.state.body).not.toContain('不應讀取')
  })
  it('routes campaign links through the preview handler before the SPA catch-all', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    expect(config.rewrites.findIndex(({ source }) => source === '/campaign/:slug')).toBeLessThan(config.rewrites.findIndex(({ source }) => source === '/(.*)'))
    expect(config.rewrites.find(({ source }) => source === '/campaign/:slug')?.destination).toBe('/api/campaign-preview?slug=:slug')
  })
  it('only grants anonymous access to a minimal published-only metadata RPC', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261001010000_campaign_link_preview.sql'), 'utf8').toLowerCase()
    expect(sql).toContain('campaign.opened_at is not null')
    expect(sql).toContain('campaign.slug = p_slug')
    expect(sql).toContain('grant execute on function public.campaign_link_preview(text) to anon')
  })
})
