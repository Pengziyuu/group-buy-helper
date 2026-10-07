/// <reference types="node" />
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import campaignPreview from '../../api/campaign-preview'

const page = '<html lang="zh-Hant"><head><meta property="og:title" content="團購小幫手｜住戶入口" /><meta property="og:description" content="查看社區開團資訊並下單。" /></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>'
const image = 'https://example.supabase.co/storage/v1/object/public/campaign-images/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg'
const original = { url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY, vercel: process.env.VERCEL_URL }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (original.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = original.url
  if (original.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = original.key
  if (original.vercel === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = original.vercel
})

// root: where the function looks for the bundled dist/index.html; by default an empty folder, so it falls back to production.
async function request(slug: string, rows: unknown, rpcStatus = 200, root = mkdtempSync(join(tmpdir(), 'campaign-preview-'))) {
  vi.spyOn(process, 'cwd').mockReturnValue(root)
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
    expect(calls[0]?.url).toBe('https://tuan-go.vercel.app/index.html')
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
  it('serves this deployment’s own page when bundled, so a preview loads its own scripts rather than production’s', async () => {
    const root = mkdtempSync(join(tmpdir(), 'campaign-preview-'))
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist', 'index.html'), page.replace('/assets/app.js', '/assets/own-build.js'))
    try {
      const { state, calls } = await request('a'.repeat(36), [{ title: '神農包子', image_url: image }], 200, root)
      expect(state.body).toContain('/assets/own-build.js')
      expect(state.body).toContain('神農包子｜團購小幫手')
      expect(calls.some((call) => call.url.endsWith('/index.html'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('still recognises the page when its root holds the loading outline shown before the scripts arrive', async () => {
    const root = mkdtempSync(join(tmpdir(), 'campaign-preview-'))
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist', 'index.html'), page.replace('<div id="root"></div>', '<div id="root"><div role="status">載入中</div></div>'))
    try {
      const { state, calls } = await request('a'.repeat(36), [{ title: '神農包子', image_url: image }], 200, root)
      expect(state.body).toContain('神農包子｜團購小幫手')
      expect(calls.some((call) => call.url.endsWith('/index.html'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('bundles the built page with the preview function', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { functions?: Record<string, { includeFiles?: string }> }
    expect(config.functions?.['api/campaign-preview.ts']?.includeFiles).toBe('dist/index.html')
  })
  it('runs next to the Tokyo database rather than in the default US East region', () => {
    // Every campaign link waits for this function; from iad1 each open took 0.6 to 1 s before any HTML arrived.
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { regions?: string[] }
    expect(config.regions).toEqual(['hnd1'])
  })
  it('lets the CDN answer from its copy at once and refresh it in the background', async () => {
    const { state } = await request('k7qp2xza', [{ title: '短網址團', image_url: image }])
    // A minute fresh, then served stale while one request refreshes it, for up to a day without visits.
    expect(state.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=86400')
  })
  it('previews campaigns with the new 8-character codes, and still rejects anything else', async () => {
    const short = await request('k7qp2xza', [{ title: '短網址團', image_url: image }])
    expect(short.state.body).toContain('短網址團｜團購小幫手')
    expect(short.calls[1]?.init?.body).toBe(JSON.stringify({ p_slug: 'k7qp2xza' }))
    for (const bad of ['k7qp2xz', 'k7qp2xza9', 'K7QP2XZA', 'k7qp-xza']) {
      const rejected = await request(bad, [{ title: '不應讀取' }])
      expect(rejected.calls).toHaveLength(1)
      expect(rejected.state.body).not.toContain('不應讀取')
    }
  })
  it('routes campaign links, short /c/ and older /campaign/ ones alike, through the preview handler before the SPA catch-all', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    for (const source of ['/c/:slug', '/campaign/:slug']) {
      expect(config.rewrites.findIndex((rewrite) => rewrite.source === source)).toBeLessThan(config.rewrites.findIndex((rewrite) => rewrite.source === '/(.*)'))
      expect(config.rewrites.find((rewrite) => rewrite.source === source)?.destination).toBe('/api/campaign-preview?slug=:slug')
    }
  })
  it('only grants anonymous access to a minimal published-only metadata RPC', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261001010000_campaign_link_preview.sql'), 'utf8').toLowerCase()
    expect(sql).toContain('campaign.opened_at is not null')
    expect(sql).toContain('campaign.slug = p_slug')
    expect(sql).toContain('grant execute on function public.campaign_link_preview(text) to anon')
  })
})
