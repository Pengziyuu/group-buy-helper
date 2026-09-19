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
        unit: '2K13',
        household_kind: 'resident',
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
      unit: '2K13',
      householdKind: 'resident',
      joinedAt: '2026-08-14T00:00:00Z',
      blocked: false,
      blockedAt: null,
    }])
    expect(rpc).toHaveBeenCalledWith('admin_list_residents')
  })

  it('carries the household kind for someone outside the community', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        member_code: 'abcdef0123456789abcdef0123456789abcd',
        display_name: '住戶丙',
        picture_url: null,
        period: null,
        unit: null,
        household_kind: 'other',
        joined_at: '2026-08-14T00:00:00Z',
        blocked: false,
        blocked_at: null,
      }],
      error: null,
    })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    await expect(gateway.list()).resolves.toEqual([{
      memberCode: 'abcdef0123456789abcdef0123456789abcd',
      displayName: '住戶丙',
      pictureUrl: null,
      period: null,
      unit: null,
      householdKind: 'other',
      joinedAt: '2026-08-14T00:00:00Z',
      blocked: false,
      blockedAt: null,
    }])
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

  it('updates a resident household by opaque member code', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    await gateway.updateHousehold('abcdef0123456789abcdef0123456789abcd', { period: 3, unit: '3Z15' })

    expect(rpc).toHaveBeenCalledWith('admin_update_resident_household', {
      p_member_code: 'abcdef0123456789abcdef0123456789abcd',
      p_household_kind: 'resident',
      p_period: 3,
      p_unit: '3Z15',
    })
  })

  it('calls the kind-aware RPC so repairing an other member actually makes them a resident', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    // An 'other' member has no household to begin with; assigning one is the
    // only in-product repair path and must flip household_kind to 'resident'
    // via the four-argument RPC, not the three-argument compatibility
    // wrapper that leaves household_kind untouched.
    await gateway.updateHousehold('0123456789abcdef0123456789abcdef0123', { period: 1, unit: 'A1' })

    expect(rpc).toHaveBeenCalledWith('admin_update_resident_household', {
      p_member_code: '0123456789abcdef0123456789abcdef0123',
      p_household_kind: 'resident',
      p_period: 1,
      p_unit: 'A1',
    })
  })
})
