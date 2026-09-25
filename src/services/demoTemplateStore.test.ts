import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignContent } from './demoCampaignStore'
import { createDemoTemplateRepository, DEMO_TEMPLATES_KEY } from './demoTemplateStore'

const content: CampaignContent = {
  title: '示範冰餅', unitPrice: 45, threshold: 100, announcement: '公告',
  images: [{ src: '/ice.png', alt: '冰餅' }],
  items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true }],
  openedAt: '2026-08-14T00:05:00.000Z', autoCloseAt: '2026-10-15T04:00:00.000Z',
}

describe('demo template repository', () => {
  beforeEach(() => localStorage.clear())

  it('saves, lists newest first, renames, replaces and deletes templates in the browser', async () => {
    let tick = 0
    const repository = createDemoTemplateRepository({
      createId: () => `t${++tick}`,
      now: () => new Date(Date.UTC(2026, 8, 25, 0, tick)),
      createCampaign: vi.fn(async () => ({ id: 'demo' })),
    })

    const first = await repository.create('冰餅', content)
    await repository.create('包子', { ...content, title: '示範包子' })
    expect((await repository.list()).map((template) => template.name)).toEqual(['包子', '冰餅'])
    await expect(repository.create(' 冰餅 ', content)).rejects.toThrow('已經有叫「冰餅」的範本')
    expect(first.content).not.toHaveProperty('autoCloseAt')

    expect((await repository.rename(first.id, '冰餅（每月）')).name).toBe('冰餅（每月）')
    expect((await repository.replace(first.id, { ...content, title: '新版冰餅' })).content.title).toBe('新版冰餅')
    expect(await repository.delete(first.id)).toEqual({ warning: null })
    expect((await repository.list()).map((template) => template.name)).toEqual(['包子'])
    expect(JSON.parse(localStorage.getItem(DEMO_TEMPLATES_KEY) ?? '[]')).toHaveLength(1)
  })

  it('creates a campaign from a template through the demo campaign store', async () => {
    const createCampaign = vi.fn(async () => ({ id: 'demo-campaign' }))
    const repository = createDemoTemplateRepository({ createCampaign })
    const template = await repository.create('冰餅', content)

    expect(await repository.createCampaign(template.id, '十月冰餅')).toEqual({ id: 'demo-campaign', missingImages: 0, contentError: null })
    expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ title: '十月冰餅', autoCloseAt: null, openedAt: null, arrivalLabel: '貨到通知' }))
  })

  it('reports a readable error when the browser storage is unavailable', async () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } } as unknown as Storage
    const repository = createDemoTemplateRepository({ storage: broken, createCampaign: vi.fn() })

    await expect(repository.list()).rejects.toThrow('無法讀取本機範本')
  })
})
