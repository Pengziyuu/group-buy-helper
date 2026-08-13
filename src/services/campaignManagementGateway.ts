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

    async delete(campaignId: string): Promise<{ warning: string | null }> {
      const bucket = client.storage.from('campaign-images')
      const listAllObjects = async (): Promise<{ objects: { name: string }[]; error: unknown }> => {
        const objects: { name: string }[] = []
        for (let offset = 0; ; offset += 100) {
          const { data: page, error } = await bucket.list(campaignId, { limit: 100, offset })
          if (error) return { objects, error }
          objects.push(...(page ?? []))
          if (!page || page.length < 100) return { objects, error: null }
        }
      }

      const { error: deleteError } = await client.rpc('delete_campaign_permanently', {
        p_campaign_id: campaignId,
      })
      if (deleteError) throw new Error(`刪除團購失敗：${errorMessage(deleteError)}`)

      const listed = await listAllObjects()
      if (listed.error) {
        return { warning: `團購已刪除，但無法列出待清理圖片：${errorMessage(listed.error)}` }
      }
      const paths = listed.objects.map((object) => `${campaignId}/${object.name}`)
      for (let offset = 0; offset < paths.length; offset += 1000) {
        const { error: removeError } = await bucket.remove(paths.slice(offset, offset + 1000))
        if (removeError) {
          return { warning: `團購已刪除，但部分圖片清理失敗：${errorMessage(removeError)}` }
        }
      }

      const remaining = await listAllObjects()
      if (remaining.error) {
        return { warning: `團購已刪除，但無法確認圖片清理結果：${errorMessage(remaining.error)}` }
      }
      if (remaining.objects.length > 0) {
        return { warning: '團購已刪除，但部分圖片清理失敗：Storage 未確認圖片已刪除' }
      }
      return { warning: null }
    },
  }
}
