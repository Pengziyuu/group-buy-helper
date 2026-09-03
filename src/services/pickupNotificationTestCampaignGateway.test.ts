import { describe, expect, it, vi } from 'vitest'
import { createPickupNotificationTestCampaignGateway } from './pickupNotificationTestCampaignGateway'

describe('pickup notification test campaign gateway', () => {
  it('lists and updates only through the narrow organizer RPCs', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ campaign_id: 'campaign-a' }, { campaign_id: 'campaign-b' }], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
    const gateway = createPickupNotificationTestCampaignGateway({ rpc })

    await expect(gateway.list()).resolves.toEqual(['campaign-a', 'campaign-b'])
    expect(rpc).toHaveBeenNthCalledWith(1, 'list_pickup_notification_test_campaigns')
    await expect(gateway.setEnabled('campaign-a', true)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_pickup_notification_test_campaign', {
      p_campaign_id: 'campaign-a',
      p_enabled: true,
    })
  })

  it('fails closed on malformed rows and RPC errors', async () => {
    const malformed = createPickupNotificationTestCampaignGateway({
      rpc: vi.fn().mockResolvedValue({ data: [{ campaign_id: 42 }], error: null }),
    })
    await expect(malformed.list()).rejects.toThrow('測試團購標記格式錯誤')

    const failed = createPickupNotificationTestCampaignGateway({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
    })
    await expect(failed.list()).rejects.toThrow('讀取通知測試設定失敗')

    const sending = createPickupNotificationTestCampaignGateway({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'campaign notification sending' } }),
    })
    await expect(sending.setEnabled('campaign-a', false)).rejects.toThrow('通知正在發送中，請稍後再變更測試標記')
  })
})
