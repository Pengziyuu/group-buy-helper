import { describe, expect, it, vi } from 'vitest'
import { createResidentMemberManagementGateway } from './residentMemberManagementGateway'

describe('createResidentMemberManagementGateway', () => {
  it.each([[], ['invalid'], Array(21).fill('a'.repeat(36)), ['a'.repeat(36), 'a'.repeat(36)]].map((codes) => [codes]))('rejects invalid selections before sending %j', async (codes) => {
    const invoke = vi.fn().mockResolvedValue({ data: { members: [] }, error: null })
    await expect(createResidentMemberManagementGateway({ functions: { invoke } } as never).refreshGroupStatuses(codes))
      .rejects.toMatchObject({ code: 'INVALID_SELECTION' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([null, {}, { members: [] }, { members: [null] },
    { members: [{ memberCode: 'b'.repeat(36), groupStatus: 'in_group', groupCheckedAt: '2026-09-23T00:00:00Z' }] },
    { members: [{ memberCode: 'a'.repeat(36), groupStatus: 'unchecked', groupCheckedAt: null }] },
    { members: [{ memberCode: 'a'.repeat(36), groupStatus: 'unknown', groupCheckedAt: 'invalid' }] },
    { members: Array(2).fill({ memberCode: 'a'.repeat(36), groupStatus: 'in_group', groupCheckedAt: '2026-09-23T00:00:00Z' }) },
  ])('rejects incomplete or malformed refresh responses %j', async (data) => {
    const invoke = vi.fn().mockResolvedValue({ data, error: null })
    await expect(createResidentMemberManagementGateway({ functions: { invoke } } as never).refreshGroupStatuses(['a'.repeat(36)]))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([
    [{ message: 'SQL secret', details: 'private' }, 'REFRESH_FAILED'],
    [{ status: 401, message: 'secret' }, 'AUTH_REQUIRED'],
    [new TypeError('secret network diagnostics'), 'NETWORK'],
    [{ status: 429, message: 'secret' }, 'RATE_LIMITED'],
  ])('maps provider errors safely %j', async (error, code) => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error })
    const result = createResidentMemberManagementGateway({ functions: { invoke } } as never).refreshGroupStatuses(['a'.repeat(36)])
    await expect(result).rejects.toMatchObject({ code })
    await expect(result).rejects.not.toThrow(/secret|private|SQL/)
  })

  it('refreshes only selected opaque codes without allowing a client-selected group', async () => {
    const status = { memberCode: 'a'.repeat(36), groupStatus: 'unknown', groupCheckedAt: '2026-09-23T01:00:00Z' }
    const invoke = vi.fn().mockResolvedValue({ data: { members: [{ ...status, lineUserId: 'secret', blocked: true }] }, error: null })
    const gateway = createResidentMemberManagementGateway({ functions: { invoke } } as never)
    await expect(gateway.refreshGroupStatuses([status.memberCode])).resolves.toEqual([status])
    expect(invoke).toHaveBeenCalledWith('check-resident-group-membership', { body: { memberCodes: [status.memberCode] } })
  })

  it.each([
    null,
    [{ member_code: 'a'.repeat(36), group_status: 'unexpected', group_checked_at: null }],
    [{ member_code: 'a'.repeat(36), group_status: 'in_group', group_checked_at: 'not-a-date' }],
    [{ member_code: 'a'.repeat(36), group_status: 'in_group', group_checked_at: null }],
    [{ member_code: 'b'.repeat(36), group_status: 'unchecked', group_checked_at: null }],
    [null],
    Array(2).fill({ member_code: 'a'.repeat(36), group_status: 'unchecked', group_checked_at: null }),
  ].map((statuses) => [statuses]))('rejects malformed, duplicate or unrelated group-status rows: %j', async (statuses) => {
    const rpc = vi.fn(async (name: string) => ({ data: name === 'admin_list_residents' ? [{
      member_code: 'a'.repeat(36), display_name: '甲', picture_url: null, period: null, unit: null,
      household_kind: null, joined_at: '2026-08-14T00:00:00Z', blocked: false, blocked_at: null,
    }] : statuses, error: null }))
    await expect(createResidentMemberManagementGateway({ rpc } as never).list()).rejects.toThrow('群組狀態回應格式錯誤，請重新整理後再試')
  })

  it('merges a separately authorized safe group status by member code', async () => {
    const memberCode = 'a'.repeat(36)
    const rpc = vi.fn(async (name: string) => ({ data: name === 'admin_list_residents' ? [{
      member_code: memberCode, display_name: '住戶甲', picture_url: null,
      period: null, unit: null, household_kind: null,
      joined_at: '2026-08-14T00:00:00Z', blocked: false, blocked_at: null,
    }] : [{ member_code: memberCode, group_status: 'not_in_group', group_checked_at: '2026-09-23T01:00:00Z', line_user_id: 'secret' }], error: null }))
    const result = await createResidentMemberManagementGateway({ rpc } as never).list()
    expect(rpc).toHaveBeenCalledWith('admin_list_resident_group_statuses')
    expect(result[0]).toMatchObject({ memberCode, groupStatus: 'not_in_group', groupCheckedAt: '2026-09-23T01:00:00Z', blocked: false })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('loads only safe resident management fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null }).mockResolvedValueOnce({
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
      groupStatus: 'unchecked',
      groupCheckedAt: null,
    }])
    expect(rpc).toHaveBeenCalledWith('admin_list_residents')
  })

  it('carries the household kind for someone outside the community', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null }).mockResolvedValueOnce({
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
      groupStatus: 'unchecked',
      groupCheckedAt: null,
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

    await gateway.updateHousehold('abcdef0123456789abcdef0123456789abcd', { kind: 'resident', period: 3, unit: '3Z15' })

    expect(rpc).toHaveBeenCalledWith('admin_update_resident_household', {
      p_member_code: 'abcdef0123456789abcdef0123456789abcd',
      p_household_kind: 'resident',
      p_period: 3,
      p_unit: '3Z15',
    })
  })

  it('sends null period and unit when the organizer moves someone to other', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    // customer_household_format requires period and unit to be null together for
    // kind 'other'; sending a leftover household would violate the constraint.
    await gateway.updateHousehold('abcdef0123456789abcdef0123456789abcd', { kind: 'other', period: null, unit: null })

    expect(rpc).toHaveBeenCalledWith('admin_update_resident_household', {
      p_member_code: 'abcdef0123456789abcdef0123456789abcd',
      p_household_kind: 'other',
      p_period: null,
      p_unit: null,
    })
  })

  it('calls the kind-aware RPC so repairing an other member actually makes them a resident', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const gateway = createResidentMemberManagementGateway({ rpc } as never)

    // An 'other' member has no household to begin with; assigning one is the
    // only in-product repair path and must flip household_kind to 'resident'
    // via the four-argument RPC, not the three-argument compatibility
    // wrapper that leaves household_kind untouched.
    await gateway.updateHousehold('0123456789abcdef0123456789abcdef0123', { kind: 'resident', period: 1, unit: 'A1' })

    expect(rpc).toHaveBeenCalledWith('admin_update_resident_household', {
      p_member_code: '0123456789abcdef0123456789abcdef0123',
      p_household_kind: 'resident',
      p_period: 1,
      p_unit: 'A1',
    })
  })
})
