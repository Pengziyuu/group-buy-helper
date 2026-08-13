import { describe, expect, it, vi } from 'vitest'
import { createCampaignManagementGateway } from './campaignManagementGateway'

function queryResult(data: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn().mockResolvedValue({ data, error }),
  }
  return builder
}

describe('campaign management gateway', () => {
  it('lists campaigns and creates an atomic A-item draft', async () => {
    const rows = [{
      id: 'campaign-1', slug: 'share-slug', title: '冰餅團', status: 'open',
      opened_at: null, created_at: '2026-08-12T00:00:00Z', updated_at: '2026-08-12T01:00:00Z',
    }]
    const from = vi.fn(() => queryResult(rows))
    const rpc = vi.fn().mockResolvedValue({ data: rows[0], error: null })
    const gateway = createCampaignManagementGateway({ from, rpc } as never)

    await expect(gateway.list()).resolves.toEqual([{
      id: 'campaign-1', slug: 'share-slug', title: '冰餅團', status: 'open',
      openedAt: null, createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
    }])
    await expect(gateway.create('新的團購')).resolves.toEqual(expect.objectContaining({ id: 'campaign-1' }))
    expect(from).toHaveBeenCalledWith('admin_campaign_list')
    expect(rpc).toHaveBeenCalledWith('create_campaign_draft', { p_title: '新的團購' })
  })

  it('deletes campaign data before removing its storage images', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({
        data: [{ name: 'front.jpg' }, { name: 'detail.webp' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const client = {
      from: vi.fn(),
      rpc,
      storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    }
    const gateway = createCampaignManagementGateway(client as never)

    await expect(gateway.delete('campaign-1')).resolves.toEqual({ warning: null })
    expect(rpc).toHaveBeenCalledWith('delete_campaign_permanently', { p_campaign_id: 'campaign-1' })
    expect(list).toHaveBeenCalledWith('campaign-1', { limit: 100, offset: 0 })
    expect(remove).toHaveBeenCalledWith(['campaign-1/front.jpg', 'campaign-1/detail.webp'])
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0])
    expect(list.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0])
  })

  it('lists every storage page before cleaning campaign images', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ name: `image-${index}.jpg` }))
    const list = vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ name: 'image-100.jpg' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    }
    const gateway = createCampaignManagementGateway(client as never)

    await gateway.delete('campaign-1')

    expect(list).toHaveBeenNthCalledWith(1, 'campaign-1', { limit: 100, offset: 0 })
    expect(list).toHaveBeenNthCalledWith(2, 'campaign-1', { limit: 100, offset: 100 })
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([
      'campaign-1/image-0.jpg',
      'campaign-1/image-100.jpg',
    ]))
    expect(remove.mock.calls[0][0]).toHaveLength(101)
  })

  it('does not remove storage images when database deletion fails', async () => {
    const list = vi.fn().mockResolvedValue({ data: [{ name: 'front.jpg' }], error: null })
    const remove = vi.fn()
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
      storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    }
    const gateway = createCampaignManagementGateway(client as never)

    await expect(gateway.delete('campaign-1')).rejects.toThrow('刪除團購失敗：permission denied')
    expect(list).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('warns when Storage reports success without deleting the listed object', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [{ name: 'front.jpg' }], error: null })
      .mockResolvedValueOnce({ data: [{ name: 'front.jpg' }], error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    }
    const gateway = createCampaignManagementGateway(client as never)

    await expect(gateway.delete('campaign-1')).resolves.toEqual({
      warning: '團購已刪除，但部分圖片清理失敗：Storage 未確認圖片已刪除',
    })
  })

  it('reports image cleanup failure after the campaign is already deleted', async () => {
    const list = vi.fn().mockResolvedValue({ data: [{ name: 'front.jpg' }], error: null })
    const remove = vi.fn().mockResolvedValue({ data: null, error: { message: 'storage unavailable' } })
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    }
    const gateway = createCampaignManagementGateway(client as never)

    await expect(gateway.delete('campaign-1')).resolves.toEqual({
      warning: '團購已刪除，但部分圖片清理失敗：storage unavailable',
    })
  })

  it('rejects malformed rows instead of guessing identifiers', async () => {
    const gateway = createCampaignManagementGateway({
      from: vi.fn(() => queryResult([{ id: null }])),
      rpc: vi.fn(),
    } as never)

    await expect(gateway.list()).rejects.toThrow('團購列表格式錯誤')
  })
})
