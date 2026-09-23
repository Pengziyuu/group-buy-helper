import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { parseHouseholdUnit, type HouseholdKind } from '../domain/household'

export type ResidentGroupStatus = 'in_group' | 'not_in_group' | 'unknown' | 'unchecked'
export type ResidentGroupStatusUpdate = {
  memberCode: string
  groupStatus: ResidentGroupStatus
  groupCheckedAt: string | null
}

export type ResidentMember = {
  groupStatus?: ResidentGroupStatus
  groupCheckedAt?: string | null
  memberCode: string
  displayName: string
  pictureUrl: string | null
  period: number | null
  unit: string | null
  householdKind?: HouseholdKind
  joinedAt: string
  blocked: boolean
  blockedAt: string | null
}

type ResidentMemberRow = {
  member_code?: unknown
  display_name?: unknown
  picture_url?: unknown
  period?: unknown
  unit?: unknown
  household_kind?: unknown
  joined_at?: unknown
  blocked?: unknown
  blocked_at?: unknown
}

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error)
}

function toResidentMember(value: unknown): ResidentMember {
  const row = value as ResidentMemberRow | null
  if (!row
    || typeof row.member_code !== 'string'
    || !/^[0-9a-f]{36}$/.test(row.member_code)
    || typeof row.display_name !== 'string'
    || (row.picture_url !== null && typeof row.picture_url !== 'string')
    || (row.period !== null && typeof row.period !== 'number')
    || (row.unit !== null && typeof row.unit !== 'string')
    || (row.household_kind !== null && row.household_kind !== 'resident' && row.household_kind !== 'other')
    || typeof row.joined_at !== 'string'
    || typeof row.blocked !== 'boolean'
    || (row.blocked_at !== null && typeof row.blocked_at !== 'string')) {
    throw new Error('Supabase回傳的住戶名單格式錯誤')
  }
  return {
    memberCode: row.member_code,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    period: row.period,
    unit: row.unit,
    // household_kind comes from a left join onto customer: a community
    // member who has not bound a household yet has no customer row, so this
    // is null rather than 'resident' or 'other' until they do.
    householdKind: row.household_kind ?? 'resident',
    joinedAt: row.joined_at,
    blocked: row.blocked,
    blockedAt: row.blocked_at,
  }
}

const groupStatusMessages = {
  INVALID_RESPONSE: '群組狀態回應格式錯誤，請重新整理後再試',
  INVALID_SELECTION: '請選擇有效的住戶重新查驗',
  REFRESH_FAILED: '群組查驗失敗，請稍後重試',
  AUTH_REQUIRED: '團主登入已失效，請重新登入',
  NETWORK: '網路連線失敗，請稍後重試',
  RATE_LIMITED: '查驗次數過多，請稍後重試',
} as const

export class ResidentGroupStatusError extends Error {
  readonly code: keyof typeof groupStatusMessages
  constructor(code: keyof typeof groupStatusMessages) {
    super(groupStatusMessages[code])
    this.name = 'ResidentGroupStatusError'
    this.code = code
  }
}

function parseGroupStatuses(value: unknown, allowedCodes: Set<string>): ResidentGroupStatusUpdate[] {
  if (!Array.isArray(value)) throw new ResidentGroupStatusError('INVALID_RESPONSE')
  const seen = new Set<string>()
  return value.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new ResidentGroupStatusError('INVALID_RESPONSE')
    const { member_code: memberCode, group_status: groupStatus, group_checked_at: groupCheckedAt } = row as Record<string, unknown>
    const validTimestamp = typeof groupCheckedAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(groupCheckedAt)
      && Number.isFinite(Date.parse(groupCheckedAt))
    if (typeof memberCode !== 'string' || !allowedCodes.has(memberCode) || seen.has(memberCode)
      || !['in_group', 'not_in_group', 'unknown', 'unchecked'].includes(String(groupStatus))
      || (groupStatus === 'unchecked' ? groupCheckedAt !== null : !validTimestamp)) {
      throw new ResidentGroupStatusError('INVALID_RESPONSE')
    }
    seen.add(memberCode)
    return { memberCode, groupStatus: groupStatus as ResidentGroupStatus, groupCheckedAt: groupCheckedAt as string | null }
  })
}

export function createResidentMemberManagementGateway(client: SupabaseClient<Database>) {
  return {
    async list(): Promise<ResidentMember[]> {
      const [{ data, error }, statuses] = await Promise.all([
        client.rpc('admin_list_residents'),
        // Temporary narrow bridge until the generated RPC types are updated.
        (client.rpc as unknown as (name: 'admin_list_resident_group_statuses') => PromiseLike<{ data: unknown; error: unknown }>)('admin_list_resident_group_statuses'),
      ])
      if (error || statuses.error) throw new Error('讀取住戶名單失敗，請稍後重試')
      const members = (data ?? []).map(toResidentMember)
      const groupStatuses = new Map(parseGroupStatuses(statuses.data, new Set(members.map((member) => member.memberCode)))
        .map((status) => [status.memberCode, status]))
      return members.map((member) => ({
        ...member,
        groupStatus: groupStatuses.get(member.memberCode)?.groupStatus ?? 'unchecked',
        groupCheckedAt: groupStatuses.get(member.memberCode)?.groupCheckedAt ?? null,
      }))
    },

    async refreshGroupStatuses(memberCodes: string[]): Promise<ResidentGroupStatusUpdate[]> {
      if (memberCodes.length < 1 || memberCodes.length > 20 || new Set(memberCodes).size !== memberCodes.length
        || memberCodes.some((code) => !/^[0-9a-f]{36}$/.test(code))) {
        throw new ResidentGroupStatusError('INVALID_SELECTION')
      }
      let response: { data: unknown; error: unknown }
      try {
        response = await client.functions.invoke('check-resident-group-membership', { body: { memberCodes } })
      } catch {
        throw new ResidentGroupStatusError('NETWORK')
      }
      if (response.error) {
        const status = (response.error as { status?: number }).status
          ?? (response.error as { context?: { status?: number } }).context?.status
        throw new ResidentGroupStatusError(status === 401 ? 'AUTH_REQUIRED'
          : status === 429 ? 'RATE_LIMITED'
            : response.error instanceof TypeError ? 'NETWORK' : 'REFRESH_FAILED')
      }
      if (!response.data || typeof response.data !== 'object' || !('members' in response.data)) {
        throw new ResidentGroupStatusError('INVALID_RESPONSE')
      }
      const rows = (response.data as { members: unknown }).members
      if (!Array.isArray(rows) || rows.length !== memberCodes.length) throw new ResidentGroupStatusError('INVALID_RESPONSE')
      const seen = new Set<string>()
      return rows.map((value: unknown) => {
        if (!value || typeof value !== 'object') throw new ResidentGroupStatusError('INVALID_RESPONSE')
        const row = value as Record<string, unknown>
        const code = row.memberCode
        const checkedAt = row.groupCheckedAt
        if (typeof code !== 'string' || !memberCodes.includes(code) || seen.has(code)
          || !['in_group', 'not_in_group', 'unknown'].includes(String(row.groupStatus))
          || typeof checkedAt !== 'string' || !Number.isFinite(Date.parse(checkedAt))) {
          throw new ResidentGroupStatusError('INVALID_RESPONSE')
        }
        seen.add(code)
        return { memberCode: code, groupStatus: row.groupStatus as ResidentGroupStatus, groupCheckedAt: checkedAt }
      })
    },

    async setBlocked(memberCode: string, blocked: boolean): Promise<void> {
      if (!/^[0-9a-f]{36}$/.test(memberCode)) throw new Error('住戶管理代碼無效')
      const { error } = await client.rpc('admin_set_resident_blocked', {
        p_member_code: memberCode,
        p_blocked: blocked,
      })
      if (error) throw new Error(`${blocked ? '移除住戶' : '解除封鎖'}失敗：${errorMessage(error)}`)
    },

    async updateHousehold(memberCode: string, household: { kind: HouseholdKind; period: number | null; unit: string | null }): Promise<void> {
      if (!/^[0-9a-f]{36}$/.test(memberCode)) throw new Error('住戶管理代碼無效')
      // 'other' has no household at all: the customer_household_format CHECK
      // requires period and unit to be null together for that kind.
      const resident = household.kind === 'resident' && household.period !== null && household.unit !== null
        ? parseHouseholdUnit(household.period, household.unit)
        : null
      // The generated types mark p_period and p_unit non-nullable (the generator
      // does not model nullability of SQL function parameters), but
      // admin_update_resident_household genuinely accepts null for both when the
      // kind is 'other' - see
      // supabase/migrations/20260919161000_household_kind_binding.sql.
      const { error } = await client.rpc('admin_update_resident_household', {
        p_member_code: memberCode,
        p_household_kind: household.kind,
        p_period: resident?.period ?? null,
        p_unit: resident ? household.unit!.trim().toUpperCase() : null,
      } as unknown as { p_member_code: string; p_household_kind: string; p_period: number; p_unit: string })
      if (error) throw new Error(`調整住戶資料失敗：${errorMessage(error)}`)
    },
  }
}
