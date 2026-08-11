import { describe, expect, it, vi } from 'vitest'
import { createAdminCampaignGateway, type AdminCampaignSupabaseClient } from './adminCampaignGateway'
import type { CampaignContent } from './demoCampaignStore'

const content: CampaignContent = {
  title: '週末冰餅團',
  unitPrice: 50,
  threshold: 80,
  announcement: '團主公告',
  images: [{ src: 'campaigns/demo/front.jpg', alt: '冰餅包裝正面' }],
}

function mockClient() {
  const single = vi.fn().mockResolvedValue({ data: {
    campaign_id: 'campaign-1',
    title: content.title,
    unit_price: content.unitPrice,
    threshold: content.threshold,
    announcement: content.announcement,
    images: content.images,
  }, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const eq = vi.fn().mockReturnValue({ single, maybeSingle })
  const selectAfterUpsert = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const upsert = vi.fn().mockReturnValue({ select: selectAfterUpsert })
  const from = vi.fn().mockReturnValue({ select, upsert })
  const rpc = vi.fn().mockResolvedValue({ data: { id: 'campaign-1' }, error: null })
  const client = { from, rpc } as unknown as AdminCampaignSupabaseClient
  return { client, from, select, eq, upsert, rpc, maybeSingle }
}

describe('Supabase admin campaign gateway', () => {
  it('loads a database draft as editable campaign content', async () => {
    const { client, from, select, eq } = mockClient()
    const gateway = createAdminCampaignGateway(client)

    await expect(gateway.loadDraft('campaign-1')).resolves.toEqual(content)
    expect(from).toHaveBeenCalledWith('campaign_draft')
    expect(select).toHaveBeenCalledWith('title,unit_price,threshold,announcement,images')
    expect(eq).toHaveBeenCalledWith('campaign_id', 'campaign-1')
  })

  it('saves a draft without publishing and uses the publish RPC explicitly', async () => {
    const { client, upsert, rpc } = mockClient()
    const gateway = createAdminCampaignGateway(client)

    await gateway.saveDraft('campaign-1', content)
    expect(upsert).toHaveBeenCalledWith({
      campaign_id: 'campaign-1',
      title: '週末冰餅團',
      unit_price: 50,
      threshold: 80,
      announcement: '團主公告',
      images: [{ src: 'campaigns/demo/front.jpg', alt: '冰餅包裝正面' }],
    })
    expect(rpc).not.toHaveBeenCalled()

    await gateway.publish('campaign-1')
    expect(rpc).toHaveBeenCalledWith('publish_campaign_draft', { p_campaign_id: 'campaign-1' })
  })

  it('loads the published campaign and treats a missing draft as empty', async () => {
    const { client, from } = mockClient()
    const gateway = createAdminCampaignGateway(client)

    await expect(gateway.loadPublished('campaign-1')).resolves.toEqual(content)
    expect(from).toHaveBeenCalledWith('campaign')
    await expect(gateway.loadOptionalDraft('campaign-1')).resolves.toBeNull()
  })
})
