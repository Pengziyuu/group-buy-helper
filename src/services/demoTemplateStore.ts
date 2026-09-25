import {
  campaignContentFromTemplate,
  templateContentFromCampaign,
  templateNameError,
  type CampaignTemplate,
} from '../domain/campaignTemplate'
import { parseTemplateContent } from '../domain/campaignTemplate'
import { createCompatibleUuid } from './campaignImageGateway'
import type { CampaignTemplateRepository } from './campaignTemplateGateway'
import type { CampaignContent } from './demoCampaignStore'

export const DEMO_TEMPLATES_KEY = 'group-buy-helper:campaign-templates'

type DemoTemplateOptions = {
  storage?: Storage | null
  createId?: () => string
  now?: () => Date
  createCampaign(content: CampaignContent): Promise<{ id: string }>
}

const browserStorage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage)

// The local demo has no upload service, so templates keep image addresses as they are.
export function createDemoTemplateRepository({
  storage = browserStorage(),
  createId = createCompatibleUuid,
  now = () => new Date(),
  createCampaign,
}: DemoTemplateOptions): CampaignTemplateRepository {
  const read = (): CampaignTemplate[] => {
    try {
      const raw = storage?.getItem(DEMO_TEMPLATES_KEY)
      const rows = raw ? (JSON.parse(raw) as CampaignTemplate[]) : []
      return rows.map((row) => ({ ...row, content: parseTemplateContent(row.content) }))
    } catch (error) {
      throw new Error(`無法讀取本機範本：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const write = (templates: CampaignTemplate[]) => {
    try {
      storage?.setItem(DEMO_TEMPLATES_KEY, JSON.stringify(templates))
    } catch (error) {
      throw new Error(`無法儲存本機範本：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const sorted = (templates: CampaignTemplate[]) => [...templates].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const find = (templates: CampaignTemplate[], templateId: string) => {
    const template = templates.find((candidate) => candidate.id === templateId)
    if (!template) throw new Error('找不到這個範本')
    return template
  }

  return {
    async list() {
      return sorted(read())
    },
    async create(name, content) {
      const templates = read()
      const nameError = templateNameError(name, templates)
      if (nameError) throw new Error(nameError)
      const template: CampaignTemplate = { id: createId(), name: name.trim(), content: templateContentFromCampaign(content), updatedAt: now().toISOString() }
      write([...templates, template])
      return template
    },
    async replace(templateId, content) {
      const templates = read()
      const updated = { ...find(templates, templateId), content: templateContentFromCampaign(content), updatedAt: now().toISOString() }
      write(templates.map((template) => template.id === templateId ? updated : template))
      return updated
    },
    async rename(templateId, name) {
      const templates = read()
      const nameError = templateNameError(name, templates, templateId)
      if (nameError) throw new Error(nameError)
      const updated = { ...find(templates, templateId), name: name.trim(), updatedAt: now().toISOString() }
      write(templates.map((template) => template.id === templateId ? updated : template))
      return updated
    },
    async delete(templateId) {
      write(read().filter((template) => template.id !== templateId))
      return { warning: null }
    },
    async createCampaign(templateId, title) {
      const template = find(read(), templateId)
      const campaign = await createCampaign(campaignContentFromTemplate(template.content, title))
      return { id: campaign.id, missingImages: 0, contentError: null }
    },
  }
}
