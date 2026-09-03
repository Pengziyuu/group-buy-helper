type RpcResult = Promise<{ data: unknown; error: unknown }>

type PickupNotificationTestCampaignClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult
}

function hasErrorMessage(error: unknown, expected: string): boolean {
  return Boolean(error && typeof error === 'object' && 'message' in error
    && String(error.message).includes(expected))
}

export function createPickupNotificationTestCampaignGateway(client: PickupNotificationTestCampaignClient) {
  return {
    async list(): Promise<string[]> {
      const { data, error } = await client.rpc('list_pickup_notification_test_campaigns')
      if (error) throw new Error('讀取通知測試設定失敗')
      if (!Array.isArray(data)) throw new Error('測試團購標記格式錯誤')
      return data.map((value) => {
        if (!value || typeof value !== 'object' || !('campaign_id' in value)
          || typeof value.campaign_id !== 'string') throw new Error('測試團購標記格式錯誤')
        return value.campaign_id
      })
    },

    async setEnabled(campaignId: string, enabled: boolean): Promise<void> {
      const { data, error } = await client.rpc('set_pickup_notification_test_campaign', {
        p_campaign_id: campaignId,
        p_enabled: enabled,
      })
      if (hasErrorMessage(error, 'campaign notification sending')) {
        throw new Error('通知正在發送中，請稍後再變更測試標記')
      }
      if (error || data !== true) throw new Error('更新通知測試設定失敗')
    },
  }
}
