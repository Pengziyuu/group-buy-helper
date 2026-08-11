import { describe, expect, it, vi } from 'vitest'
import { createCampaignImageGateway, type CampaignImageStorageClient } from './campaignImageGateway'

describe('campaign image storage gateway', () => {
  it('uploads an allowed image into the campaign folder and returns its public URL', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'campaign-1/image.jpg' }, error: null })
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'http://storage.test/campaign-images/campaign-1/image.jpg' },
    })
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl })
    const client = { storage: { from } } as unknown as CampaignImageStorageClient
    const gateway = createCampaignImageGateway(client, () => 'image-id')
    const file = new File(['image'], '商品照.JPG', { type: 'image/jpeg' })

    await expect(gateway.upload('campaign-1', file)).resolves.toBe(
      'http://storage.test/campaign-images/campaign-1/image.jpg',
    )
    expect(from).toHaveBeenCalledWith('campaign-images')
    expect(upload).toHaveBeenCalledWith('campaign-1/image-id.jpg', file, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false,
    })
  })

  it('rejects unsupported files before contacting Storage', async () => {
    const from = vi.fn()
    const client = { storage: { from } } as unknown as CampaignImageStorageClient
    const gateway = createCampaignImageGateway(client)

    await expect(gateway.upload('campaign-1', new File(['x'], 'note.txt', { type: 'text/plain' })))
      .rejects.toThrow('只支援 JPG、PNG 或 WebP 圖片')
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects images larger than five megabytes', async () => {
    const client = { storage: { from: vi.fn() } } as unknown as CampaignImageStorageClient
    const gateway = createCampaignImageGateway(client)
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })

    await expect(gateway.upload('campaign-1', file)).rejects.toThrow('圖片不可超過 5 MB')
  })
})
