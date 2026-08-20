import { describe, expect, it, vi } from 'vitest'
import { createResidentMemberManagementGateway } from './residentMemberManagementGateway'

describe('createResidentMemberManagementGateway', () => {
  it('loads only safe resident management fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        member_code: 'abcdef0123456789abcdef0123456789abcd',
        display_name: '住戶甲',
        picture_url: 'https://example.com/avatar.jpg',
        period: 2,
        unit: 'K13',
        joined_at: '2026-08-14T00:00:00Z',
        blocked: false,
        blocked_at: null,
      }],
      error: null,
    })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    await expect(gateway.list()).resolves.toEqual([{
      memberCode: 'abcdef0123456789abcdef0123456789abcd',
      displayName: '住戶甲',
      pictureUrl: 'https://example.com/avatar.jpg',
      period: 2,
      unit: 'K13',
      joinedAt: '2026-08-14T00:00:00Z',
      blocked: false,
      blockedAt: null,
    }])
    expect(rpc).toHaveBeenCalledWith('admin_list_residents')
  })

  it('changes block state by opaque member code', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    await gateway.setBlocked('abcdef0123456789abcdef0123456789abcd', true)

    expect(rpc).toHaveBeenCalledWith('admin_set_resident_blocked', {
      p_member_code: 'abcdef0123456789abcdef0123456789abcd',
      p_blocked: true,
    })
  })
})
