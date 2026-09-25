import { describe, expect, it, vi } from 'vitest'
import type { CampaignContent } from './demoCampaignStore'
import { createCampaignTemplateGateway } from './campaignTemplateGateway'

const BASE = 'https://example.supabase.co/storage/v1/object/public/campaign-images/'
const publicUrl = (path: string) => `${BASE}${path}`

type Row = { id: string; name: string; content: Record<string, unknown>; updated_at: string }

function fakeClient(options: { failCopy?: (from: string) => boolean; failUpdate?: boolean } = {}) {
  const failCopy = options.failCopy ?? (() => false)
  const failUpdate = { current: options.failUpdate ?? false }
  const failDelete = { current: false }
  const failRemove = { current: false }
  // `null` means "reflect the real rows"; set to an array to simulate a stale/racy read that
  // missed a row another request just inserted or renamed.
  let staleList: Row[] | null = null
  const rows = new Map<string, Row>()
  const objects = new Set<string>(['campaign-1/a.png', 'campaign-1/b.png'])
  const copies: Array<[string, string]> = []
  const removed: string[] = []
  let nextId = 1
  const table = {
    select: () => ({
      order: async () => ({ data: staleList ?? [...rows.values()], error: null }),
      eq: (_column: string, id: string) => ({
        single: async () => rows.has(id) ? { data: rows.get(id), error: null } : { data: null, error: { message: 'not found' } },
      }),
    }),
    insert: (value: { name: string; content: Row['content'] }) => ({
      select: () => ({
        single: async () => {
          if ([...rows.values()].some((row) => row.name.trim().toLowerCase() === value.name.trim().toLowerCase())) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } }
          }
          const row = { id: `00000000-0000-4000-8000-00000000000${nextId++}`, name: value.name, content: value.content, updated_at: '2026-09-25T00:00:00.000Z' }
          rows.set(row.id, row)
          return { data: row, error: null }
        },
      }),
    }),
    update: (patch: Partial<Row>) => ({
      eq: (_column: string, id: string) => ({
        select: () => ({
          single: async () => {
            if (failUpdate.current) return { data: null, error: { message: 'update failed' } }
            if (typeof patch.name === 'string'
              && [...rows.values()].some((row) => row.id !== id && row.name.trim().toLowerCase() === patch.name!.trim().toLowerCase())) {
              return { data: null, error: { code: '23505', message: 'duplicate key' } }
            }
            const row = { ...rows.get(id)!, ...patch, updated_at: '2026-09-25T01:00:00.000Z' }
            rows.set(id, row)
            return { data: row, error: null }
          },
        }),
      }),
    }),
    delete: () => ({
      eq: async (_column: string, id: string) => {
        if (failDelete.current) return { error: { message: 'delete failed' } }
        rows.delete(id)
        return { error: null }
      },
    }),
  }
  const bucket = {
    getPublicUrl: (path: string) => ({ data: { publicUrl: publicUrl(path) } }),
    copy: async (from: string, to: string) => {
      copies.push([from, to])
      if (failCopy(from) || !objects.has(from)) return { data: null, error: { message: `copy failed: ${from}` } }
      objects.add(to)
      return { data: { path: to }, error: null }
    },
    remove: async (paths: string[]) => {
      if (failRemove.current) return { data: null, error: { message: 'remove failed' } }
      removed.push(...paths)
      paths.forEach((path) => objects.delete(path))
      return { data: [], error: null }
    },
    list: async (prefix: string) => ({
      data: [...objects].filter((path) => path.startsWith(`${prefix}/`)).map((path) => ({ name: path.slice(prefix.length + 1) })),
      error: null,
    }),
  }
  const client = { from: () => table, storage: { from: () => bucket } }
  return {
    client: client as never,
    rows,
    objects,
    copies,
    removed,
    setFailUpdate: (value: boolean) => { failUpdate.current = value },
    setFailDelete: (value: boolean) => { failDelete.current = value },
    setFailRemove: (value: boolean) => { failRemove.current = value },
    setStaleList: (value: Row[] | null) => { staleList = value },
  }
}

const campaign: CampaignContent = {
  title: '一涼冰餅',
  unitPrice: 45,
  threshold: 100,
  arrivalLabel: '10月中',
  autoCloseAt: '2026-10-15T04:00:00.000Z',
  announcement: '公告',
  images: [
    { src: publicUrl('campaign-1/a.png'), alt: '冰餅 1' },
    { src: '/remote.svg', alt: '外部圖' },
    { src: publicUrl('campaign-1/b.png'), alt: '冰餅 2' },
  ],
  items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true }],
  openedAt: '2026-09-20T00:00:00.000Z',
}

let counter = 0
const createId = () => `id-${++counter}`
const deps = () => ({
  createCampaign: vi.fn(async (_title: string) => ({ id: 'campaign-9' })),
  saveDraft: vi.fn(async (_campaignId: string, _content: CampaignContent) => undefined),
})

describe('campaignTemplateGateway', () => {
  it('saves a new template with its own copies of our images and keeps other addresses as they are', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)

    const template = await gateway.create('  一涼冰餅範本 ', campaign)

    expect(template.name).toBe('一涼冰餅範本')
    expect(fake.copies.map(([from]) => from)).toEqual(['campaign-1/a.png', 'campaign-1/b.png'])
    expect(fake.copies.every(([, to]) => to.startsWith(`templates/${template.id}/`))).toBe(true)
    expect(template.content.images.map((image) => image.alt)).toEqual(['冰餅 1', '外部圖', '冰餅 2'])
    expect(template.content.images[1].src).toBe('/remote.svg')
    expect(template.content.images[0].src).toBe(publicUrl(fake.copies[0][1]))
    expect(template.content).not.toHaveProperty('autoCloseAt')
    expect(template.content).not.toHaveProperty('arrivalLabel')
  })

  it('removes the half-saved template and its copied images when a copy fails', async () => {
    const fake = fakeClient({ failCopy: (from) => from === 'campaign-1/b.png' })
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)

    await expect(gateway.create('一涼冰餅範本', campaign)).rejects.toThrow('存成範本失敗：copy failed: campaign-1/b.png')

    expect(fake.rows.size).toBe(0)
    expect(fake.removed).toEqual([fake.copies[0][1]])
    expect([...fake.objects].some((path) => path.startsWith('templates/'))).toBe(false)
  })

  it('rejects a duplicate name before writing anything', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    await gateway.create('一涼冰餅', campaign)
    const copiesBefore = fake.copies.length

    await expect(gateway.create(' 一涼冰餅 ', campaign)).rejects.toThrow('已經有叫「一涼冰餅」的範本，請改名，或選擇取代既有範本')
    expect(fake.copies.length).toBe(copiesBefore)
  })

  it('maps a duplicate-name insert error the same way when the pre-check missed the race', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    await gateway.create('一涼冰餅', campaign)
    // Simulate another request's row landing between our pre-check read and our insert:
    // the pre-check's list() sees a stale snapshot without it, but insert() still collides.
    fake.setStaleList([])

    await expect(gateway.create('一涼冰餅', { ...campaign, images: [] })).rejects.toThrow('已經有叫「一涼冰餅」的範本，請改名，或選擇取代既有範本')
  })

  it('maps a duplicate-name rename error the same way when the pre-check missed the race', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const first = await gateway.create('冰餅', campaign)
    await gateway.create('包子', { ...campaign, images: [] })
    fake.setStaleList([])

    await expect(gateway.rename(first.id, '包子')).rejects.toThrow('已經有叫「包子」的範本，請改名，或選擇取代既有範本')
  })

  it('reports that the half-saved template could not be removed automatically when rollback fails to delete the row', async () => {
    const fake = fakeClient({ failCopy: (from) => from === 'campaign-1/b.png' })
    fake.setFailDelete(true)
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)

    await expect(gateway.create('一涼冰餅範本', campaign))
      .rejects.toThrow('存成範本失敗：copy failed: campaign-1/b.png；已建立的範本「一涼冰餅範本」未能自動移除，請到設定頁刪除')
  })

  it('reports that copied images could not be cleared when rollback deletes the row but not the images', async () => {
    const fake = fakeClient({ failCopy: (from) => from === 'campaign-1/b.png' })
    fake.setFailRemove(true)
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)

    await expect(gateway.create('一涼冰餅範本', campaign))
      .rejects.toThrow('存成範本失敗：copy failed: campaign-1/b.png；部分已複製的圖片未能清除')
    expect(fake.rows.size).toBe(0)
  })

  it('replaces a template, keeping its name and deleting only its own images that are no longer used', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const original = await gateway.create('一涼冰餅', campaign)
    const oldPaths = fake.copies.map(([, to]) => to)

    const replaced = await gateway.replace(original.id, { ...campaign, title: '一涼冰餅（新版）', images: [campaign.images[0]] })

    expect(replaced.name).toBe('一涼冰餅')
    expect(replaced.content.title).toBe('一涼冰餅（新版）')
    expect(replaced.content.images).toHaveLength(1)
    expect(fake.removed.sort()).toEqual([...oldPaths].sort())
  })

  it('keeps the old template untouched when replacing fails', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const original = await gateway.create('一涼冰餅', campaign)
    const before = JSON.stringify(fake.rows.get(original.id))
    fake.setFailUpdate(true)

    await expect(gateway.replace(original.id, campaign)).rejects.toThrow('取代範本失敗：update failed')

    expect(JSON.stringify(fake.rows.get(original.id))).toBe(before)
    const newCopies = fake.copies.slice(2).map(([, to]) => to)
    expect(newCopies.length).toBeGreaterThan(0)
    expect(newCopies.every((path) => !fake.objects.has(path))).toBe(true)
  })

  it('renames with the same duplicate rule and deletes a template with its images', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const first = await gateway.create('冰餅', campaign)
    await gateway.create('包子', { ...campaign, images: [] })

    await expect(gateway.rename(first.id, ' 包子 ')).rejects.toThrow('已經有叫「包子」的範本')
    expect((await gateway.rename(first.id, '冰餅（每月）')).name).toBe('冰餅（每月）')

    expect(await gateway.delete(first.id)).toEqual({ warning: null })
    expect(fake.rows.has(first.id)).toBe(false)
    expect([...fake.objects].some((path) => path.startsWith(`templates/${first.id}/`))).toBe(false)
  })

  it('creates a draft campaign from a template, copying images into the new campaign folder', async () => {
    const fake = fakeClient()
    const campaignDeps = deps()
    const gateway = createCampaignTemplateGateway(fake.client, campaignDeps, createId)
    const template = await gateway.create('一涼冰餅', campaign)

    const result = await gateway.createCampaign(template.id, '十月冰餅團')

    expect(result).toEqual({ id: 'campaign-9', missingImages: 0, contentError: null })
    expect(campaignDeps.createCampaign).toHaveBeenCalledWith('十月冰餅團')
    const saved = campaignDeps.saveDraft.mock.calls[0]?.[1] as CampaignContent
    expect(campaignDeps.saveDraft.mock.calls[0]?.[0]).toBe('campaign-9')
    expect(saved).toMatchObject({ title: '十月冰餅團', autoCloseAt: null, openedAt: null, arrivalLabel: '貨到通知' })
    expect(saved.images.filter((image) => image.src.startsWith(BASE)).every((image) => image.src.startsWith(`${BASE}campaign-9/`))).toBe(true)
  })

  it('reports missing images and a failed content save without losing the new draft', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const template = await gateway.create('一涼冰餅', campaign)
    const brokenPath = fake.copies[0][1]
    fake.objects.delete(brokenPath)
    const failingDeps = {
      createCampaign: vi.fn(async (_title: string) => ({ id: 'campaign-10' })),
      saveDraft: vi.fn(async (_campaignId: string, _content: CampaignContent) => { throw new Error('儲存團購草稿失敗：network') }),
    }
    const failing = createCampaignTemplateGateway(fake.client, failingDeps, createId)

    const result = await failing.createCampaign(template.id, '十一月冰餅團')

    expect(result).toEqual({ id: 'campaign-10', missingImages: 1, contentError: '儲存團購草稿失敗：network' })
    const saved = failingDeps.saveDraft.mock.calls[0]?.[1] as CampaignContent
    expect(saved.images).toHaveLength(2)
  })
})
