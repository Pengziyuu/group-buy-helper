import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ts from 'typescript'
import source from '../../supabase/functions/line-resident-login/index.ts?raw'
import * as http from '../../supabase/functions/_shared/http'
import * as line from '../../supabase/functions/_shared/line'
import * as rateLimit from '../../supabase/functions/_shared/lineRateLimit'
import * as policies from '../../supabase/functions/_shared/policies'
import * as groupMembership from '../../supabase/functions/_shared/residentGroupMembership'

const state = { client: null as unknown }
// Execute the actual Deno entrypoint; only its npm client and HTTP transport
// are replaced. TypeScript transpilation avoids teaching Vite Deno's npm scheme.
function loadEntrypoint() {
  const dependencies = { createClient: () => state.client, ...http, ...line, ...rateLimit, ...policies, ...groupMembership }
  const body = ts.transpileModule(source.replace(/^import .*$/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  new Function(...Object.keys(dependencies), body)(...Object.values(dependencies))
}
const subject = 'U' + '1'.repeat(32)
const uid = '10000000-0000-4000-8000-000000000001'
const group = 'C' + '2'.repeat(32)
let handler: (request: Request) => Promise<Response>
let admitted: boolean
let blocked: boolean
let groupStatus: number
let summaryStatus: number
let fetcher: ReturnType<typeof vi.fn>
let authAdmin: Record<string, ReturnType<typeof vi.fn>>
let rpc: ReturnType<typeof vi.fn>
let tables: string[]

beforeEach(async () => {
  vi.resetModules()
  admitted = false; blocked = false; groupStatus = 404; summaryStatus = 200; tables = []
  authAdmin = {
    getUserById: vi.fn().mockResolvedValue({ data: { user: { id: uid, email: 'fixture@users.invalid' } } }),
    generateLink: vi.fn().mockResolvedValue({ data: { user: { id: uid }, properties: { hashed_token: 'exchange' } } }),
    createUser: vi.fn().mockResolvedValue({ data: { user: { id: uid } } }),
  }
  rpc = vi.fn(async (name: string) => {
    if (name === 'provision_line_resident' && blocked) return { error: { message: 'resident blocked' } }
    return { data: true, error: null }
  })
  state.client = {
    auth: { admin: authAdmin }, rpc,
    from: (table: string) => {
      tables.push(table)
      const builder = {
        select: () => builder, eq: () => builder,
        maybeSingle: async () => ({ data:
          table === 'community_resident_admission' ? (admitted ? { line_user_id: subject } : null)
          : table === 'community_resident_block' ? (blocked ? { line_user_id: subject } : null)
          : table === 'community_line_group' ? { line_group_id: group, binding_revision: 'revision' }
          : { auth_user_id: uid }, error: null }),
      }
      return builder
    },
  }
  fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/oauth2/v2.1/verify')) return new Response(JSON.stringify({
      iss: 'https://access.line.me', aud: 'channel', sub: subject,
      exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), name: '住戶',
    }), { status: 200 })
    return new Response(null, { status: url.endsWith('/summary') ? summaryStatus : groupStatus })
  })
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => key === 'LINE_CHANNEL_ID' ? 'channel' : 'fixture-secret' },
    serve: (fn: typeof handler) => { handler = fn },
  })
  loadEntrypoint()
})
afterEach(() => vi.unstubAllGlobals())
const login = () => handler(new Request('https://edge.invalid', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
  body: JSON.stringify({ idToken: 'official-token' }),
}))

describe('actual resident login handler', () => {
  it('checks blocks before Auth lookups even for a new admission retry', async () => {
    blocked = true
    const response = await login()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: '此LINE帳號已被團主移除' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    for (const method of Object.values(authAdmin)) expect(method).not.toHaveBeenCalled()
  })
  it('does not log raw errors or identifiers', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    admitted = true
    authAdmin.getUserById.mockResolvedValue({ error: new Error('secret ' + subject), data: {} })
    expect((await login()).status).toBe(500)
    expect(JSON.stringify(log.mock.calls)).not.toContain(subject)
    expect(log.mock.calls.every((call) => call.length === 1)).toBe(true)
    log.mockRestore()
  })
  it('returns safe retryable unknown when the bot cannot confirm the group', async () => {
    summaryStatus = 404
    const response = await login()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'GROUP_MEMBERSHIP_UNAVAILABLE', error: '目前無法確認群組資格，請稍後再試或聯繫團主' })
    for (const method of Object.values(authAdmin)) expect(method).not.toHaveBeenCalled()
  })
  it('passes fresh production proof into the atomic provision RPC', async () => {
    groupStatus = 200
    expect((await login()).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('provision_line_resident', expect.objectContaining({
      p_group_id: group, p_binding_revision: 'revision', p_group_checked_at: expect.any(String),
    }))
  })
  it('does not contact messaging or read group binding for previously admitted residents', async () => {
    admitted = true; groupStatus = 500
    expect((await login()).status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(tables).not.toContain('community_line_group')
  })
  it('preserves organizer blocks without generating Auth tokens', async () => {
    admitted = true; blocked = true
    const response = await login()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: '此LINE帳號已被團主移除' })
    expect(authAdmin.generateLink).not.toHaveBeenCalled()
  })
  it('denies identity-only newcomers before any Auth or provisioning side effect', async () => {
    const response = await login()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: 'GROUP_MEMBERSHIP_REQUIRED', error: '請先加入社區團購群組，才能使用團購系統' })
    for (const method of Object.values(authAdmin)) expect(method).not.toHaveBeenCalled()
    expect(rpc.mock.calls.some(([name]) => name === 'provision_line_resident')).toBe(false)
  })
})
