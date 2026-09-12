import { describe, expect, it, vi } from 'vitest'
import { createAdminCampaignGateway, type AdminCampaignSupabaseClient } from './adminCampaignGateway'
import type { CampaignContent } from './demoCampaignStore'

const content: CampaignContent = {
  title: '週末冰餅團',
  unitPrice: 50,
  threshold: 80,
  thresholdKind: 'quantity',
  amountThreshold: null,
  quantityUnit: '盒',
  allowCustomItems: true,
  baseDiscountRate: 0.9,
  mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
  announcement: '團主公告',
  images: [{ src: 'campaigns/demo/front.jpg', alt: '冰餅包裝正面' }],
  items: [
    { code: 'MILK', name: '牛奶', unitPrice: 50, active: true, discountEligible: true },
    { code: 'OLD', name: '停售口味', unitPrice: 50, active: false, discountEligible: false },
  ],
  openedAt: '2026-08-14T00:05:09.000Z',
}

function mockClient() {
  const single = vi.fn().mockResolvedValue({ data: {
    campaign_id: 'campaign-1',
    title: content.title,
    unit_price: content.unitPrice,
    threshold: content.threshold,
    threshold_kind: content.thresholdKind,
    amount_threshold: content.amountThreshold,
    quantity_unit: content.quantityUnit,
    allow_custom_items: content.allowCustomItems,
    base_discount_rate: content.baseDiscountRate,
    mix_match_name: content.mixMatchDiscount?.name,
    mix_match_min_quantity: content.mixMatchDiscount?.minimumQuantity,
    mix_match_discount_rate: content.mixMatchDiscount?.rate,
    announcement: content.announcement,
    images: content.images,
    items: content.items,
    opened_at: content.openedAt,
  }, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const eq = vi.fn().mockReturnValue({ single, maybeSingle })
  const selectAfterUpsert = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const upsert = vi.fn().mockReturnValue({ select: selectAfterUpsert })
  const from = vi.fn().mockReturnValue({ select, upsert })
  const rpc = vi.fn().mockResolvedValue({ data: {
    id: 'campaign-1',
    title: content.title,
    unit_price: content.unitPrice,
    threshold: content.threshold,
    threshold_kind: content.thresholdKind,
    amount_threshold: content.amountThreshold,
    quantity_unit: content.quantityUnit,
    allow_custom_items: content.allowCustomItems,
    base_discount_rate: content.baseDiscountRate,
    mix_match_name: content.mixMatchDiscount?.name,
    mix_match_min_quantity: content.mixMatchDiscount?.minimumQuantity,
    mix_match_discount_rate: content.mixMatchDiscount?.rate,
    announcement: content.announcement,
    images: content.images,
    items: content.items,
    opened_at: content.openedAt,
  }, error: null })
  const client = { from, rpc } as unknown as AdminCampaignSupabaseClient
  return { client, from, select, eq, upsert, rpc, maybeSingle }
}

describe('Supabase admin campaign gateway', () => {
  it('loads a database draft as editable campaign content', async () => {
    const { client, from, select, eq } = mockClient()
    const gateway = createAdminCampaignGateway(client)

    await expect(gateway.loadDraft('campaign-1')).resolves.toEqual(content)
    expect(from).toHaveBeenCalledWith('campaign_draft')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('base_discount_rate,mix_match_name,mix_match_min_quantity,mix_match_discount_rate'))
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
      threshold_kind: 'quantity',
      amount_threshold: null,
      quantity_unit: '盒',
      allow_custom_items: true,
      base_discount_rate: 0.9,
      mix_match_name: '任選三件85折',
      mix_match_min_quantity: 3,
      mix_match_discount_rate: 0.85,
      announcement: '團主公告',
      images: [{ src: 'campaigns/demo/front.jpg', alt: '冰餅包裝正面' }],
      items: content.items,
    })
    expect(rpc).not.toHaveBeenCalled()

    await expect(gateway.publish('campaign-1')).resolves.toEqual(content)
    expect(rpc).toHaveBeenCalledWith('publish_campaign_draft', { p_campaign_id: 'campaign-1' })
  })

  it('loads the published campaign and treats a missing draft as empty', async () => {
    const { client, from } = mockClient()
    const gateway = createAdminCampaignGateway(client)

    await expect(gateway.loadPublished('campaign-1')).resolves.toEqual(content)
    expect(from).toHaveBeenCalledWith('campaign_public')
    await expect(gateway.loadOptionalDraft('campaign-1')).resolves.toBeNull()
  })

  it('persists a total-amount formation threshold in the existing threshold settings', async () => {
    const { client, upsert } = mockClient()
    const gateway = createAdminCampaignGateway(client)

    await gateway.saveDraft('campaign-1', {
      ...content,
      thresholdKind: 'amount',
      amountThreshold: 5000,
    })

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      threshold_kind: 'amount',
      amount_threshold: 5000,
    }))
  })

  it('returns a resident slug only after the campaign has opened', async () => {
    const publishedMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug: '82be35197b9a8c709a939627ce4c411d8de3', opened_at: content.openedAt },
      error: null,
    })
    const unpublishedMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const not = vi.fn()
      .mockReturnValueOnce({ maybeSingle: publishedMaybeSingle })
      .mockReturnValueOnce({ maybeSingle: unpublishedMaybeSingle })
    const eq = vi.fn().mockReturnValue({ not })
    const select = vi.fn().mockReturnValue({ eq })
    const client = { from: vi.fn().mockReturnValue({ select }) }
    const gateway = createAdminCampaignGateway(client as never)

    await expect(gateway.loadResidentSlug('campaign-open')).resolves.toBe('82be35197b9a8c709a939627ce4c411d8de3')
    await expect(gateway.loadResidentSlug('campaign-draft')).resolves.toBeNull()
    expect(select).toHaveBeenCalledWith('slug,opened_at')
    expect(not).toHaveBeenCalledWith('opened_at', 'is', null)
  })

  it('treats a campaign without opened_at as not yet published', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const not = vi.fn().mockReturnValue({ maybeSingle })
    const eq = vi.fn().mockReturnValue({ not })
    const select = vi.fn().mockReturnValue({ eq })
    const client = { from: vi.fn().mockReturnValue({ select }) }

    const gateway = createAdminCampaignGateway(client as never)
    await expect(gateway.loadOptionalPublished('campaign-new')).resolves.toBeNull()
    expect(not).toHaveBeenCalledWith('opened_at', 'is', null)
  })
})
