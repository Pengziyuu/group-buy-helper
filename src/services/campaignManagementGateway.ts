import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { CampaignStatus } from '../domain/orderWorkflow'
import { normalizeQuantityUnit, type QuantityUnit } from '../domain/quantityUnit'
import type { CampaignImage } from './demoCampaignStore'

export type CampaignListItem = {
  id: string
  slug: string
  title: string
  status: CampaignStatus
  openedAt: string | null
  createdAt: string
  updatedAt: string
  images: CampaignImage[]
  quantityUnit: QuantityUnit
  orderCount: number
  totalQuantity: number
  totalAmount: number
  paidOrderCount: number
}

type CampaignListRow = {
  id?: unknown
  slug?: unknown
  title?: unknown
  status?: unknown
  opened_at?: unknown
  created_at?: unknown
  updated_at?: unknown
  images?: unknown
  quantity_unit?: unknown
  order_count?: unknown
  total_quantity?: unknown
  total_amount?: unknown
  paid_order_count?: unknown
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function isCampaignImage(value: unknown): value is CampaignImage {
  return Boolean(value && typeof value === 'object'
    && 'src' in value && typeof value.src === 'string'
    && 'alt' in value && typeof value.alt === 'string')
}

function toNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(number) && number >= 0 ? number : null
}

function toCampaignListItem(value: unknown, requireSummary = false): CampaignListItem {
  const row = value as CampaignListRow | null
  const images = Array.isArray(row?.images) && row.images.every(isCampaignImage) ? row.images : null
  const orderCount = toNumber(row?.order_count)
  const totalQuantity = toNumber(row?.total_quantity)
  const totalAmount = toNumber(row?.total_amount)
  const paidOrderCount = toNumber(row?.paid_order_count)
  if (!row
    || typeof row.id !== 'string'
    || typeof row.slug !== 'string'
    || typeof row.title !== 'string'
    || typeof row.status !== 'string'
    || !['open', 'closed', 'arrived'].includes(row.status)
    || (row.opened_at !== null && typeof row.opened_at !== 'string')
    || typeof row.created_at !== 'string'
    || typeof row.updated_at !== 'string'
    || (requireSummary && (!images || orderCount === null || totalQuantity === null
      || totalAmount === null || paidOrderCount === null || paidOrderCount > orderCount))) {
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
    images: images ?? [],
    quantityUnit: normalizeQuantityUnit(row.quantity_unit),
    orderCount: orderCount ?? 0,
    totalQuantity: totalQuantity ?? 0,
    totalAmount: totalAmount ?? 0,
    paidOrderCount: paidOrderCount ?? 0,
  }
}

export function createCampaignManagementGateway(client: SupabaseClient<Database>) {
  return {
    async list(): Promise<CampaignListItem[]> {
      const { data, error } = await client.rpc('list_admin_campaign_cards')
      if (error) throw new Error(`讀取團購列表失敗：${errorMessage(error)}`)
      return (data ?? []).map((row) => toCampaignListItem(row, true))
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
