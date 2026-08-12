import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { CampaignStatus } from '../domain/orderWorkflow'

export type CampaignListItem = {
  id: string
  slug: string
  title: string
  status: CampaignStatus
  openedAt: string | null
  createdAt: string
  updatedAt: string
}

type CampaignListRow = {
  id?: unknown
  slug?: unknown
  title?: unknown
  status?: unknown
  opened_at?: unknown
  created_at?: unknown
  updated_at?: unknown
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function toCampaignListItem(value: unknown): CampaignListItem {
  const row = value as CampaignListRow | null
  if (!row
    || typeof row.id !== 'string'
    || typeof row.slug !== 'string'
    || typeof row.title !== 'string'
    || typeof row.status !== 'string'
    || !['open', 'closed', 'arrived'].includes(row.status)
    || (row.opened_at !== null && typeof row.opened_at !== 'string')
    || typeof row.created_at !== 'string'
    || typeof row.updated_at !== 'string') {
    throw new Error('Supabase 回傳的團購列表格式錯誤')
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status as CampaignStatus,
    openedAt: row.opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createCampaignManagementGateway(client: SupabaseClient<Database>) {
  return {
    async list(): Promise<CampaignListItem[]> {
      const { data, error } = await client
        .from('admin_campaign_list')
        .select('id,slug,title,status,opened_at,created_at,updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw new Error(`讀取團購列表失敗：${errorMessage(error)}`)
      return (data ?? []).map(toCampaignListItem)
    },

    async create(title: string): Promise<CampaignListItem> {
      const { data, error } = await client.rpc('create_campaign_draft', {
        p_title: title.trim(),
      })
      if (error) throw new Error(`建立團購失敗：${errorMessage(error)}`)
      return toCampaignListItem(data)
    },
  }
}
