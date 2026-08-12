import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { CampaignContent, CampaignImage, CampaignItem } from './demoCampaignStore'

export type AdminCampaignSupabaseClient = SupabaseClient<Database>

type DraftRow = {
  title: string
  unit_price: number
  threshold: number
  announcement: string
  images: CampaignImage[]
  items: CampaignItem[]
  opened_at?: string | null
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function toContent(data: unknown): CampaignContent {
  const row = data as Partial<DraftRow> | null
  if (!row
    || typeof row.title !== 'string'
    || typeof row.unit_price !== 'number'
    || typeof row.threshold !== 'number'
    || typeof row.announcement !== 'string'
    || !Array.isArray(row.images)
    || !Array.isArray(row.items)
    || row.items.some((item) => !item
      || typeof item.code !== 'string'
      || typeof item.name !== 'string'
      || typeof item.active !== 'boolean')) {
    throw new Error('Supabase 回傳的團購草稿格式錯誤')
  }
  return {
    title: row.title,
    unitPrice: row.unit_price,
    threshold: row.threshold,
    announcement: row.announcement,
    images: row.images,
    items: row.items,
    openedAt: typeof row.opened_at === 'string' ? row.opened_at : null,
  }
}

const draftColumns = 'title,unit_price,threshold,announcement,images,items'
const publishedColumns = `${draftColumns},opened_at`

export function createAdminCampaignGateway(client: AdminCampaignSupabaseClient) {
  return {
    async loadPublished(campaignId: string): Promise<CampaignContent> {
      const { data, error } = await client
        .from('campaign_public')
        .select(publishedColumns)
        .eq('id', campaignId)
        .single()
      if (error) throw new Error(`讀取已發布團購失敗：${errorMessage(error)}`)
      return toContent(data)
    },

    async loadOptionalPublished(campaignId: string): Promise<CampaignContent | null> {
      const { data, error } = await client
        .from('campaign_public')
        .select(publishedColumns)
        .eq('id', campaignId)
        .not('opened_at', 'is', null)
        .maybeSingle()
      if (error) throw new Error(`讀取已發布團購失敗：${errorMessage(error)}`)
      return data ? toContent(data) : null
    },

    async loadResidentSlug(campaignId: string): Promise<string | null> {
      const { data, error } = await client
        .from('campaign_public')
        .select('slug,opened_at')
        .eq('id', campaignId)
        .not('opened_at', 'is', null)
        .maybeSingle()
      if (error) throw new Error(`讀取住戶分享連結失敗：${errorMessage(error)}`)
      return data?.slug ?? null
    },

    async loadOptionalDraft(campaignId: string): Promise<CampaignContent | null> {
      const { data, error } = await client
        .from('campaign_draft')
        .select(draftColumns)
        .eq('campaign_id', campaignId)
        .maybeSingle()
      if (error) throw new Error(`讀取團購草稿失敗：${errorMessage(error)}`)
      return data ? toContent(data) : null
    },

    async loadDraft(campaignId: string): Promise<CampaignContent> {
      const { data, error } = await client
        .from('campaign_draft')
        .select(draftColumns)
        .eq('campaign_id', campaignId)
        .single()
      if (error) throw new Error(`讀取團購草稿失敗：${errorMessage(error)}`)
      return toContent(data)
    },

    async saveDraft(campaignId: string, content: CampaignContent): Promise<CampaignContent> {
      const { data, error } = await client
        .from('campaign_draft')
        .upsert({
          campaign_id: campaignId,
          title: content.title,
          unit_price: content.unitPrice,
          threshold: content.threshold,
          announcement: content.announcement,
          images: content.images,
          items: content.items,
        })
        .select(draftColumns)
        .single()
      if (error) throw new Error(`儲存團購草稿失敗：${errorMessage(error)}`)
      return toContent(data)
    },

    async publish(campaignId: string): Promise<CampaignContent> {
      const { data, error } = await client.rpc('publish_campaign_draft', {
        p_campaign_id: campaignId,
      })
      if (error) throw new Error(`發布團購失敗：${errorMessage(error)}`)
      return toContent(data)
    },
  }
}
