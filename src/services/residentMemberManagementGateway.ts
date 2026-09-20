import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { parseHouseholdUnit, type HouseholdKind } from '../domain/household'

export type ResidentMember = {
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

export function createResidentMemberManagementGateway(client: SupabaseClient<Database>) {
  return {
    async list(): Promise<ResidentMember[]> {
      const { data, error } = await client.rpc('admin_list_residents')
      if (error) throw new Error(`讀取住戶名單失敗：${errorMessage(error)}`)
      return (data ?? []).map(toResidentMember)
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
