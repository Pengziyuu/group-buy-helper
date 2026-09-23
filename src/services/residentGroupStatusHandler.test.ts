import { beforeEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import source from '../../supabase/functions/check-resident-group-membership/index.ts?raw'
import * as http from '../../supabase/functions/_shared/http'

const code = 'a'.repeat(36)
const lineId = 'U' + '1'.repeat(32)
let handler: (request: Request) => Promise<Response>
let serviceRpc: ReturnType<typeof vi.fn>
let userRpc: ReturnType<typeof vi.fn>
let getUser: ReturnType<typeof vi.fn>
let check: ReturnType<typeof vi.fn>
function request(body: unknown, token = 'session') {
  return handler(new Request('https://edge.invalid', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  serviceRpc = vi.fn(async (name: string) => name === 'service_resident_group_candidates'
    ? { data: [{ member_code: code, line_user_id: lineId, binding_revision: 'revision', line_group_id: 'C' + '2'.repeat(32) }], error: null }
    : { data: null, error: null })
  userRpc = vi.fn(async (name: string) => ({ data: name === 'admin_list_resident_group_statuses'
    ? [{ member_code: code, group_status: 'in_group', group_checked_at: '2026-09-23T00:00:00Z' }]
    : true, error: null }))
  getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'uuid', is_anonymous: false } }, error: null })
  check = vi.fn().mockResolvedValue(['in_group'])
  const createClient = vi.fn().mockImplementationOnce(() => ({ auth: { getUser }, rpc: userRpc }))
    .mockImplementationOnce(() => ({ rpc: serviceRpc }))
  vi.stubGlobal('Deno', { env: { get: () => 'secret' }, serve: (callback: typeof handler) => { handler = callback } })
  const body = ts.transpileModule(source.replace(/^import .*$/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  new Function('createClient', ...Object.keys(http), 'checkResidentGroupMemberships', body)(
    createClient, ...Object.values(http), check,
  )
})

describe('actual organizer group status handler', () => {
  it('rejects unauthorized callers without touching private member identities', async () => {
    userRpc.mockImplementation(async (name: string) => ({ data: name === 'is_admin', error: null }))
    const response = await request({ memberCodes: [code] })
    expect(response.status).toBe(403)
    expect(serviceRpc).not.toHaveBeenCalled()
    expect(check).not.toHaveBeenCalled()
  })
  it('refuses unknown member codes without partially checking known members', async () => {
    const response = await request({ memberCodes: [code, 'b'.repeat(36)] })
    expect(response.status).toBe(409)
    expect(check).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalledWith('service_record_resident_group_checks', expect.anything())
  })
  it('does not overwrite a previous status when LINE lookup cannot confirm', async () => {
    check.mockResolvedValue(['unknown'])
    const response = await request({ memberCodes: [code] })
    expect(response.status).toBe(503)
    expect(serviceRpc).not.toHaveBeenCalledWith('service_record_resident_group_checks', expect.anything())
  })
  it('records only server-resolved LINE identities and returns safe status fields', async () => {
    const response = await request({ memberCodes: [code] })
    expect(response.status).toBe(200)
    expect(check).toHaveBeenCalledWith('C' + '2'.repeat(32), [lineId], 'secret')
    expect(serviceRpc).toHaveBeenCalledWith('service_record_resident_group_checks', {
      p_binding_revision: 'revision', p_checked_at: expect.any(String), p_checks: [{ line_user_id: lineId, group_status: 'in_group' }],
    })
    const text = await response.text()
    expect(text).toContain(code)
    expect(text).not.toContain(lineId)
    expect(text).not.toContain('revision')
  })
})
