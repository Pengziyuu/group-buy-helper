import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export type CampaignImageStorageClient = SupabaseClient<Database>

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const extensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

export function createCampaignImageGateway(
  client: CampaignImageStorageClient,
  createId: () => string = () => crypto.randomUUID(),
) {
  return {
    async upload(campaignId: string, file: File): Promise<string> {
      const extension = extensionByMimeType[file.type]
      if (!extension) throw new Error('只支援 JPG、PNG 或 WebP 圖片')
      if (file.size > MAX_IMAGE_BYTES) throw new Error('圖片不可超過 5 MB')

      const path = `${campaignId}/${createId()}.${extension}`
      const bucket = client.storage.from('campaign-images')
      const { error } = await bucket.upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })
      if (error) throw new Error(`上傳圖片失敗：${errorMessage(error)}`)

      const { data } = bucket.getPublicUrl(path)
      if (!data.publicUrl) throw new Error('Storage 未回傳圖片網址')
      return data.publicUrl
    },
  }
}
