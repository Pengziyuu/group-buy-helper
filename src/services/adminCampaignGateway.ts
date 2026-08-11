import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { CampaignContent, CampaignImage } from './demoCampaignStore'

export type AdminCampaignSupabaseClient = SupabaseClient<Database>

type DraftRow = {
  title: string
  unit_price: number
  threshold: number
  announcement: string
  images: CampaignImage[]
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
    || !Array.isArray(row.images)) {
    throw new Error('Supabase 回傳的團購草稿格式錯誤')
  }
  return {
    title: row.title,
    unitPrice: row.unit_price,
    threshold: row.threshold,
    announcement: row.announcement,
    images: row.images,
  }
}

const draftColumns = 'title,unit_price,threshold,announcement,images'

export function createAdminCampaignGateway(client: AdminCampaignSupabaseClient) {
  return {
    async loadPublished(campaignId: string): Promise<CampaignContent> {
      const { data, error } = await client
        .from('campaign')
        .select(draftColumns)
        .eq('id', campaignId)
        .single()
      if (error) throw new Error(`讀取已發布團購失敗：${errorMessage(error)}`)
      return toContent(data)
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
        })
        .select(draftColumns)
        .single()
      if (error) throw new Error(`儲存團購草稿失敗：${errorMessage(error)}`)
      return toContent(data)
    },

    async publish(campaignId: string): Promise<unknown> {
      const { data, error } = await client.rpc('publish_campaign_draft', {
        p_campaign_id: campaignId,
      })
      if (error) throw new Error(`發布團購失敗：${errorMessage(error)}`)
      return data
    },
  }
}
