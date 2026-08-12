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

  it('rejects malformed rows instead of guessing identifiers', async () => {
    const gateway = createCampaignManagementGateway({
      from: vi.fn(() => queryResult([{ id: null }])),
      rpc: vi.fn(),
    } as never)

    await expect(gateway.list()).rejects.toThrow('團購列表格式錯誤')
  })
})
