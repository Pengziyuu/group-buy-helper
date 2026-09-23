import { afterEach, describe, expect, it, vi } from 'vitest'

const modules = import.meta.glob('../../supabase/functions/_shared/residentGroupMembership.ts')
async function load() {
  const loader = modules['../../supabase/functions/_shared/residentGroupMembership.ts']
  expect(loader, '群組查驗實作必須存在').toBeTypeOf('function')
  return await loader() as typeof import('../../supabase/functions/_shared/residentGroupMembership')
}

afterEach(() => vi.useRealTimers())

describe('resident LINE group lookup', () => {
  it.each([201, 204, 401, 403, 404, 429, 500])('never interprets summary %s as confirmed absence', async (status) => {
    const { checkResidentGroupMemberships } = await load()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status }))
    expect(await checkResidentGroupMemberships('Cg', ['Uu'], 'token', { fetcher })).toEqual(['unknown'])
  })
  it('returns unknown on network failure and missing binding/token without requests', async () => {
    const { checkResidentGroupMemberships } = await load()
    const fetcher = vi.fn().mockRejectedValue(new Error('network with sensitive details'))
    expect(await checkResidentGroupMemberships('Cg', ['Uu'], 'token', { fetcher })).toEqual(['unknown'])
    fetcher.mockClear()
    expect(await checkResidentGroupMemberships('', ['Uu'], 'token', { fetcher })).toEqual(['unknown'])
    expect(await checkResidentGroupMemberships('Cg', ['Uu'], '', { fetcher })).toEqual(['unknown'])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('limits concurrency and enforces one total deadline even for non-resolving fetch', async () => {
    const { checkResidentGroupMemberships } = await load()
    vi.useFakeTimers()
    const fetcher = vi.fn(() => new Promise<Response>(() => {}))
    const result = checkResidentGroupMemberships('Cg', Array.from({ length: 20 }, (_, i) => 'U' + i), 'token', { fetcher, deadlineMs: 100, concurrency: 3 })
    await vi.advanceTimersByTimeAsync(100)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(await result).toEqual(Array(20).fill('unknown'))
    expect(fetcher.mock.calls.every((call) => (call as unknown as [string, RequestInit])[1].signal?.aborted)).toBe(true)
  })
  it('confirms bot access with exact summary 200 before reporting absence', async () => {
    const { checkResidentGroupMemberships } = await load()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await checkResidentGroupMemberships('Cproduction', ['Uresident'], 'secret', { fetcher })).toEqual(['not_in_group'])
    expect(fetcher.mock.calls[1][0]).toBe('https://api.line.me/v2/bot/group/Cproduction/summary')
  })
  it('accepts exact 200 from the server-selected member endpoint', async () => {
    const { checkResidentGroupMemberships } = await load()
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    expect(await checkResidentGroupMemberships('Cproduction', ['Uresident'], 'secret', { fetcher })).toEqual(['in_group'])
    expect(fetcher.mock.calls[0][0]).toBe('https://api.line.me/v2/bot/group/Cproduction/member/Uresident')
  })
})
