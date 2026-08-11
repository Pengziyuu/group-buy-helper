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

function createCompatibleUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('此瀏覽器不支援安全的圖片識別碼')
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createCampaignImageGateway(
  client: CampaignImageStorageClient,
  createId: () => string = createCompatibleUuid,
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
