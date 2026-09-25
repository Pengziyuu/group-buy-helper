import type { SupabaseClient } from '@supabase/supabase-js'
import {
  campaignContentFromTemplate,
  duplicateTemplateNameMessage,
  imagePathFromPublicUrl,
  parseTemplateContent,
  templateContentFromCampaign,
  templateNameError,
  type CampaignTemplate,
  type CreateFromTemplateResult,
} from '../domain/campaignTemplate'
import type { Database, Json } from '../types/database'
import { createCompatibleUuid } from './campaignImageGateway'
import type { CampaignContent, CampaignImage } from './demoCampaignStore'

export type CampaignTemplateRepository = {
  list(): Promise<CampaignTemplate[]>
  create(name: string, content: CampaignContent): Promise<CampaignTemplate>
  replace(templateId: string, content: CampaignContent): Promise<CampaignTemplate>
  rename(templateId: string, name: string): Promise<CampaignTemplate>
  delete(templateId: string): Promise<{ warning: string | null }>
  createCampaign(templateId: string, title: string): Promise<CreateFromTemplateResult>
}

type CampaignCreation = {
  createCampaign(title: string): Promise<{ id: string }>
  saveDraft(campaignId: string, content: CampaignContent): Promise<unknown>
}

const BUCKET = 'campaign-images'
const COLUMNS = 'id,name,content,updated_at'

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

const isDuplicateName = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')

function toTemplate(row: unknown): CampaignTemplate {
  const value = row as { id?: unknown; name?: unknown; content?: unknown; updated_at?: unknown } | null
  if (!value || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.updated_at !== 'string') {
    throw new Error('Supabase 回傳的範本格式錯誤')
  }
  return { id: value.id, name: value.name, content: parseTemplateContent(value.content), updatedAt: value.updated_at }
}

const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
}

export function createCampaignTemplateGateway(
  client: SupabaseClient<Database>,
  campaigns: CampaignCreation,
  createId: () => string = createCompatibleUuid,
): CampaignTemplateRepository {
  const bucket = () => client.storage.from(BUCKET)
  const table = () => client.from('campaign_template')
  const publicPrefix = () => bucket().getPublicUrl('').data.publicUrl

  // Copies our own images into `folder`; addresses outside our storage are kept as they are.
  const copyImages = async (images: CampaignImage[], folder: string) => {
    const prefix = publicPrefix()
    const copied: string[] = []
    const failures: string[] = []
    const result: CampaignImage[] = []
    for (const image of images) {
      const source = imagePathFromPublicUrl(image.src, prefix)
      if (!source) {
        result.push({ ...image })
        continue
      }
      const destination = `${folder}/${createId()}${extensionOf(source)}`
      const { error } = await bucket().copy(source, destination)
      if (error) {
        failures.push(errorMessage(error))
        continue
      }
      copied.push(destination)
      result.push({ src: bucket().getPublicUrl(destination).data.publicUrl, alt: image.alt })
    }
    return { images: result, copied, failures }
  }

  const removePaths = async (paths: string[]) => {
    if (paths.length === 0) return null
    const { error } = await bucket().remove(paths)
    return error
  }

  const list = async (): Promise<CampaignTemplate[]> => {
    const { data, error } = await table().select(COLUMNS).order('updated_at', { ascending: false })
    if (error) throw new Error(`讀取範本失敗：${errorMessage(error)}`)
    return (data ?? []).map(toTemplate)
  }

  const loadOne = async (templateId: string): Promise<CampaignTemplate> => {
    const { data, error } = await table().select(COLUMNS).eq('id', templateId).single()
    if (error) throw new Error(`讀取範本失敗：${errorMessage(error)}`)
    return toTemplate(data)
  }

  const writeContent = async (templateId: string, content: unknown) => {
    const { data, error } = await table().update({ content: content as Json }).eq('id', templateId).select(COLUMNS).single()
    return { data, error }
  }

  return {
    list,

    async create(name, content) {
      const nameError = templateNameError(name, await list())
      if (nameError) throw new Error(nameError)
      const snapshot = templateContentFromCampaign(content)
      const { data, error } = await table()
        .insert({ name: name.trim(), content: { ...snapshot, images: [] } as unknown as Json })
        .select(COLUMNS)
        .single()
      if (error) throw new Error(isDuplicateName(error) ? duplicateTemplateNameMessage(name) : `存成範本失敗：${errorMessage(error)}`)
      const template = toTemplate(data)
      const copied = await copyImages(snapshot.images, `templates/${template.id}`)
      const rollback = async () => {
        await removePaths(copied.copied)
        await table().delete().eq('id', template.id)
      }
      if (copied.failures.length > 0) {
        await rollback()
        throw new Error(`存成範本失敗：${copied.failures[0]}`)
      }
      const updated = await writeContent(template.id, { ...snapshot, images: copied.images })
      if (updated.error) {
        await rollback()
        throw new Error(`存成範本失敗：${errorMessage(updated.error)}`)
      }
      return toTemplate(updated.data)
    },

    async replace(templateId, content) {
      const current = await loadOne(templateId)
      const snapshot = templateContentFromCampaign(content)
      const copied = await copyImages(snapshot.images, `templates/${templateId}`)
      if (copied.failures.length > 0) {
        await removePaths(copied.copied)
        throw new Error(`取代範本失敗：${copied.failures[0]}`)
      }
      const updated = await writeContent(templateId, { ...snapshot, images: copied.images })
      if (updated.error) {
        await removePaths(copied.copied)
        throw new Error(`取代範本失敗：${errorMessage(updated.error)}`)
      }
      // Only after the new content is stored: drop this template's images the new content no longer uses.
      const prefix = publicPrefix()
      const kept = new Set(copied.images.map((image) => imagePathFromPublicUrl(image.src, prefix)))
      const stale = current.content.images
        .map((image) => imagePathFromPublicUrl(image.src, prefix))
        .filter((path): path is string => path !== null && path.startsWith(`templates/${templateId}/`) && !kept.has(path))
      await removePaths(stale)
      return toTemplate(updated.data)
    },

    async rename(templateId, name) {
      const nameError = templateNameError(name, await list(), templateId)
      if (nameError) throw new Error(nameError)
      const { data, error } = await table().update({ name: name.trim() }).eq('id', templateId).select(COLUMNS).single()
      if (error) throw new Error(isDuplicateName(error) ? duplicateTemplateNameMessage(name) : `範本改名失敗：${errorMessage(error)}`)
      return toTemplate(data)
    },

    async delete(templateId) {
      const { error } = await table().delete().eq('id', templateId)
      if (error) throw new Error(`刪除範本失敗：${errorMessage(error)}`)
      const folder = `templates/${templateId}`
      const { data: objects, error: listError } = await bucket().list(folder, { limit: 100 })
      if (listError) return { warning: `範本已刪除，但無法列出待清理圖片：${errorMessage(listError)}` }
      const removeError = await removePaths((objects ?? []).map((object) => `${folder}/${object.name}`))
      if (removeError) return { warning: `範本已刪除，但部分圖片清理失敗：${errorMessage(removeError)}` }
      return { warning: null }
    },

    async createCampaign(templateId, title) {
      const template = await loadOne(templateId)
      const campaign = await campaigns.createCampaign(title)
      const copied = await copyImages(template.content.images, campaign.id)
      const content = campaignContentFromTemplate({ ...template.content, images: copied.images }, title)
      try {
        await campaigns.saveDraft(campaign.id, content)
        return { id: campaign.id, missingImages: copied.failures.length, contentError: null }
      } catch (saveError) {
        return { id: campaign.id, missingImages: copied.failures.length, contentError: errorMessage(saveError) }
      }
    },
  }
}
