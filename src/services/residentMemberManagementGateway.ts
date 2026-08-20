import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export type ResidentMember = {
  memberCode: string
  displayName: string
  pictureUrl: string | null
  period: number | null
  unit: string | null
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
  }
}
